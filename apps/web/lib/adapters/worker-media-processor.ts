/**
 * worker-media-processor — the MediaProcessor adapter for the Fly.io
 * transcode worker (Ports & Adapters, CLAUDE.md §3.3).
 *
 * ═══ BUILT AND TESTED THOUGH NOTHING DEPLOYS IT ═══
 *
 * `docs/adr/0004-media-pipeline-mode.md` makes that non-negotiable: "A
 * deferred code path with no test rots invisibly, and 'flip one config'
 * silently becomes 'flip one config, then debug for three days.'" This
 * project has been bitten twice by that species already - a migration test
 * that passed against a schema Payload's dev-mode push had already built,
 * and a concurrency test that kept passing after `SKIP LOCKED` was deleted
 * from the adapter it was supposed to be testing. So this adapter runs the
 * same contract suite as `inline`, from day one.
 *
 * ═══ IT IS `stillPipeline` PLUS STEP 7, AND NOTHING ELSE ═══
 *
 * A still takes exactly the path `inline` takes - the same
 * `runStillPipeline`, with `mode: 'worker'`. Only a sniffed clip diverges,
 * and then only to probe, transcode and extract a poster frame; **the poster
 * goes back through `runStillPipeline`**, so a poster frame is stripped,
 * re-encoded and hashed by the same code as any other still rather than by a
 * second copy of it.
 *
 * ═══ INVARIANTS A FUTURE EDIT COULD BREAK ═══
 *
 *   - **THE INGEST DECISION RUNS BEFORE THE TOOLCHAIN.** A clip reaches a
 *     subprocess only after the policy has accepted it, for the same reason
 *     `stillPipeline` refuses before it decodes: the bytes are
 *     attacker-controlled and `ffmpeg` is a decoder. A client declaring a
 *     type its bytes contradict is refused here, not by `ffmpeg`.
 *   - **A CLIP IS SNIFFED, NEVER READ FROM `declaredType`.** The routing
 *     question ("is this a clip?") is answered from the bytes, so a client
 *     cannot choose which arm of this adapter runs.
 *   - **`'video/mp4'` MEANS ONLY THAT BYTES 4-7 SPELL `ftyp`.**
 *     `media/sniff.ts`'s header states it: the box length is never read, the
 *     brand's plausibility is never checked, and nothing past offset 11 is
 *     validated - so a real AVIF sniffs as `'video/mp4'`, and so does any
 *     file whose first four bytes do not decode to a leading `<`. This
 *     adapter therefore does NOT treat that answer as "this decodes as
 *     video": every such file is handed to `ffprobe`, whose failure is a
 *     `'unreadable'` refusal, and that probe is the first thing that
 *     actually validates the container.
 *   - **A TOOLCHAIN FAILURE IS `'unreadable'`, NEVER A THROW** - whether the
 *     toolchain RETURNS the failure or RAISES it. The port's contract is that
 *     `process` never throws, and the raising half of that is the half this
 *     adapter got wrong: `probe`/`transcode`/`poster` answer with a typed
 *     error for an `ffmpeg` that ran and failed, and with an exception for
 *     everything around it (a temp file that cannot be written, an output
 *     file that is not there after a zero exit, the named throw that
 *     `MEDIA_REQUIRE_CLIP_TOOLCHAIN` raises where the binaries are absent).
 *     Both are caught where the clip arm is entered.
 *
 * Depends on: the domain's ingest policy and sniff, `runStillPipeline` and
 * `ClipToolchain`/`createFfmpegToolchain` from ../media, and the
 * MediaProcessor port.
 */
import { acceptedIngestTypes, ingestDecision } from '@travel-diary/domain/media/ingestPolicy'
import type { SniffedType } from '@travel-diary/domain/media/sniff'
import { sniffMediaType } from '@travel-diary/domain/media/sniff'
import type { Result } from '@travel-diary/domain/result'
import { err, ok } from '@travel-diary/domain/result'
import type {
  MediaProcessor,
  Processed,
  ProcessedClip,
  ProcessingRefusal,
  UploadedBytes,
} from '../ports/mediaProcessor'
import type { ClipToolchain } from '../media/clipToolchain'
import { createFfmpegToolchain } from '../media/clipToolchain'
import { runStillPipeline } from '../media/stillPipeline'

/** The mode this adapter is, in the one place it is named. */
const MODE = 'worker' as const

/** The two container types this adapter's clip arm handles. */
const CLIP_TYPES: readonly SniffedType[] = ['video/mp4', 'video/quicktime']

/** Where the poster frame is taken from, as a fraction of the clip's length. */
const POSTER_AT_FRACTION = 0.5

/** The suffix a poster frame's filename carries, before `stillPipeline` re-extensions it. */
const POSTER_SUFFIX = '-poster'

/** Whether these bytes are a container this adapter's clip arm handles. */
const isClip = (sniffed: SniffedType): boolean => CLIP_TYPES.some((clip) => clip === sniffed)

/**
 * Probes, transcodes and posters one clip.
 * @param upload - The clip's bytes, with what the client called them.
 * @param toolchain - The `ffmpeg` boundary, injected so the process boundary
 *   can be stood in for (CLAUDE.md §2.3) without standing in for anything we
 *   own.
 * @returns `ok` with the processed clip, or `err` naming the refusal.
 */
const processClip = async (
  upload: UploadedBytes,
  toolchain: ClipToolchain,
): Promise<Result<ProcessedClip, ProcessingRefusal>> => {
  const probed = await toolchain.probe(upload.bytes)
  if (!probed.ok) return err('unreadable')

  const transcoded = await toolchain.transcode(upload.bytes)
  if (!transcoded.ok) return err('unreadable')

  const frame = await toolchain.poster(upload.bytes, probed.value.durationSec * POSTER_AT_FRACTION)
  if (!frame.ok) return err('unreadable')

  // Back through the SHARED still pipeline, so the poster is stripped,
  // re-encoded and hashed by the same code as any other still.
  const poster = await runStillPipeline(
    { bytes: frame.value, declaredType: 'image/jpeg', filename: `${upload.filename}${POSTER_SUFFIX}` },
    { mode: MODE },
  )
  // FLATTENED TO `'unreadable'` RATHER THAN PROPAGATING `poster.error`, and
  // that is a correctness choice rather than a loss. The poster frame is OUR
  // artefact, extracted by the toolchain and declared by us - so a refusal
  // about it is never a statement about what the CLIENT declared. Returning
  // the pipeline's own `'declared-mismatch'` here would tell an uploader its
  // content type disagreed with its bytes when it did not. The mutation that
  // replaced `err(poster.error)` with this line survived the whole suite,
  // which is what made it visible that the distinction was unobservable: the
  // only refusal a JPEG-declared poster frame can earn IS `'unreadable'`.
  if (!poster.ok) return err('unreadable')

  return ok({
    kind: 'clip',
    bytes: transcoded.value,
    contentType: 'video/mp4',
    filename: upload.filename,
    // A container's creation time is not EXIF and this repository reads none
    // from one, so a clip carries no capture time. Recorded as `undefined`
    // rather than invented from the upload's arrival time, which would be a
    // date the reader never took a photograph on.
    capturedAt: undefined,
    // The POSTER's perceptual hash, which is the only thing about a clip this
    // repository can compare perceptually. Two uploads of one clip share a
    // poster frame; two different clips do not.
    contentHash: poster.value.contentHash,
    durationSec: probed.value.durationSec,
    poster: poster.value,
  })
}

/**
 * Builds the worker MediaProcessor.
 *
 * NOT a singleton and holds no state (CLAUDE.md §3.3's rejected
 * anti-patterns): a fresh, stateless object per call.
 * @param options - `toolchain` replaces the real `ffmpeg` boundary, which is
 *   what lets the contract suite run where the binaries are absent. Omitted
 *   in production, where the composition root passes the real one.
 * @returns A processor that accepts stills and clips.
 * @example
 * createWorkerMediaProcessor().acceptedTypes
 * // ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime']
 */
export const createWorkerMediaProcessor = (options: { readonly toolchain?: ClipToolchain } = {}): MediaProcessor => {
  const toolchain = options.toolchain ?? createFfmpegToolchain({ ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' })

  return {
    acceptedTypes: acceptedIngestTypes(MODE),
    process: async (upload): Promise<Result<Processed, ProcessingRefusal>> => {
      // Sniffed, never read off `declaredType`: the client does not choose
      // which arm of this adapter runs.
      const sniffed = sniffMediaType(upload.bytes)
      if (!isClip(sniffed)) return runStillPipeline(upload, { mode: MODE })

      // Before the toolchain, for the same reason `stillPipeline` decides
      // before it decodes: `ffmpeg` is a decoder and these bytes are
      // attacker-controlled.
      const decision = ingestDecision({ sniffed, declared: upload.declaredType, mode: MODE })
      if (!decision.ok) return err(decision.error)

      // A TOOLCHAIN THAT THROWS IS STILL A REFUSAL, and this is where the
      // port's "`process` never throws" invariant is discharged for the clip
      // arm. `probe`/`transcode`/`poster` return typed errors for an `ffmpeg`
      // that ran and failed, but they do not cover a failure BEFORE or AFTER
      // the subprocess: `withClipOnDisk`'s `mkdtemp`/`writeFile` on a full or
      // read-only disk, `readFile(output)` after an `ffmpeg` that exited zero
      // and wrote nothing, and - in the test suite - the named throw
      // `MEDIA_REQUIRE_CLIP_TOOLCHAIN=1` raises on a runner with no binaries.
      // Every one of those used to escape as a rejected promise, which is a
      // 500 on an upload rather than a refusal an author can act on.
      //
      // The still arm above needs no equivalent: `runStillPipeline` catches
      // its own decoder failures, which the contract's truncated-JPEG case
      // pins for both adapters.
      try {
        return await processClip(upload, toolchain)
      } catch {
        // Not an empty catch (CLAUDE.md §3.1): a crash on
        // attacker-controlled bytes is a typed refusal, exactly as a decoder
        // failure is in the shared still pipeline. The toolchain's own words
        // are not carried, for the reason `processClip` states about the
        // poster frame - a refusal about OUR intermediate step is never a
        // statement about what the client declared.
        return err('unreadable')
      }
    },
  }
}
