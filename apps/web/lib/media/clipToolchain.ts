/**
 * clipToolchain — the three things step 7 of the pipeline needs from
 * `ffmpeg`, behind one interface (Ports & Adapters, CLAUDE.md §3.3).
 *
 * Only the `worker` MediaProcessor uses it. `inline` refuses clips at the
 * port (`docs/adr/0004-media-pipeline-mode.md`), so nothing here runs in the
 * deploy that exists today.
 *
 * ═══ WHY A STAND-IN IS LEGITIMATE HERE, AND WHY IT IS NEVER SILENT ═══
 *
 * A reader will otherwise assume a mock, so the rule is stated rather than
 * left to be inferred:
 *
 *   - CLAUDE.md §2.3 forbids mocking what we own. A subprocess to an external
 *     binary is the PROCESS BOUNDARY, which §2.3 names as mockable - so a
 *     stand-in here is legitimate where a stand-in for `stillPipeline` would
 *     not be.
 *   - But a stand-in ALONE is exactly the rot ADR 0004 describes: it would
 *     pass forever with `ffmpeg` broken, which is the same defect shape as a
 *     concurrency test that kept passing after `SKIP LOCKED` was deleted.
 *   - So which one {@link clipToolchainForTests} uses is never a silent
 *     decision, and it is {@link clipEncoderCase} - not a second copy of the
 *     same probe - that every caller asks, INCLUDING the fixture side
 *     (`media-fixtures.ts`'s `aClip`). Two copies of the question is how the
 *     fixture came to hand back sixteen synthetic bytes under the very
 *     configuration that forbids a stand-in. Three cases, in this order:
 *       1. `ffmpeg` and `ffprobe` both present: the real toolchain, spawning
 *          the real binaries.
 *       2. Absent, with `MEDIA_REQUIRE_CLIP_TOOLCHAIN=1` set: THROWS,
 *          naming the binary. CI sets that variable, so a runner without
 *          `ffmpeg` fails the build rather than quietly testing less - and
 *          fails with a message that says which binary, rather than with a
 *          contract assertion that says `expected null to be 'clip'`.
 *       3. Absent, without it: the recorded stand-in, and the suite PRINTS
 *          that it is using one and that the real path is UNRESOLVED on this
 *          machine. Nothing is sent anywhere to be checked (CLAUDE.md §7.1);
 *          the tool that would settle it is named instead.
 *
 * **UNRESOLVED ON THE AUTHORING MACHINE.** `ffmpeg` and `ffprobe` are not
 * installed here - `which ffmpeg ffprobe` finds neither - so case 3 is what
 * this machine got when Task 6 was written, and `createFfmpegToolchain`'s
 * subprocess arms have never been executed locally. They are executed in CI,
 * where case 1 holds. The tool that settles the local gap is `ffmpeg` itself.
 *
 * ═══ WHY MEDIA_REQUIRE_CLIP_TOOLCHAIN IS NOT IN envSchema ═══
 *
 * `apps/web/lib/env.ts` validates what the APPLICATION trusts, and this
 * variable configures a test toolchain: adding it there would make every
 * production boot validate a value no production code path reads. It is
 * compared against one exact string here instead, which is its own
 * validation - anything but `'1'` is "not set".
 *
 * ═══ WHAT A SIXTEEN-BYTE `ftyp` HEADER IS, AND IS NOT ═══
 *
 * The stand-in is MORE PERMISSIVE THAN `ffprobe`, deliberately and
 * unavoidably: it reports a duration for whatever bytes it is handed. So no
 * assertion may treat "the stand-in called this a clip" as the contract -
 * `anIsoBmffHeader()` is sixteen bytes with `ftyp` at offset 4 and nothing
 * behind it, which is a routing fixture and not a video. A real `ffprobe`
 * refuses it, and `clipToolchain.integration.test.ts`'s toolchain-choice case
 * is what pins that difference. The contract suite's clip cases therefore ask
 * `../adapters/contract/media-fixtures.ts`'s `aClip` for a GENERATED
 * container wherever one can be generated.
 *
 * PATTERN (CLAUDE.md §3.3): Ports & Adapters for the interface; Result type
 * for every fallible call, so a failed transcode is a value the worker
 * adapter must handle rather than an exception crossing the process boundary.
 * Depends on: node:child_process, node:fs/promises, node:os, node:path,
 * sharp (the stand-in's poster frame), and Result from the domain.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import type { Result } from '@travel-diary/domain/result'
import { err, ok } from '@travel-diary/domain/result'

/** The three things step 7 of the pipeline needs from ffmpeg. */
export interface ClipToolchain {
  /**
   * Reads a clip's duration without decoding it.
   * @param bytes - The uploaded clip's bytes.
   * @returns `ok` with the duration in seconds, or `err` naming the failure.
   */
  probe(bytes: Uint8Array): Promise<Result<{ readonly durationSec: number }, string>>
  /**
   * Re-encodes a clip to the one delivery format this repository serves.
   * @param bytes - The uploaded clip's bytes.
   * @returns `ok` with the transcoded bytes, or `err` naming the failure.
   */
  transcode(bytes: Uint8Array): Promise<Result<Uint8Array, string>>
  /**
   * Extracts one frame as a still, for the clip's poster image.
   * @param bytes - The uploaded clip's bytes.
   * @param atSeconds - How far into the clip to take the frame from.
   * @returns `ok` with the frame's encoded bytes, or `err` naming the failure.
   */
  poster(bytes: Uint8Array, atSeconds: number): Promise<Result<Uint8Array, string>>
}

/** The environment variable that turns a missing binary into a failed build. */
const REQUIRE_TOOLCHAIN_VARIABLE = 'MEDIA_REQUIRE_CLIP_TOOLCHAIN'

/** Its one meaningful value. Anything else, including absence, means "not set". */
const REQUIRE_TOOLCHAIN_VALUE = '1'

/** What a binary is asked in order to find out whether it is there at all. */
const VERSION_ARGUMENT = '-version'

/** The duration the recorded stand-in reports. See this module's header. */
const STAND_IN_DURATION_SECONDS = 1

/** The poster frame the recorded stand-in produces, in pixels. */
const STAND_IN_POSTER = { width: 320, height: 240 } as const

/** One spawned process's outcome: what it wrote, and whether it succeeded. */
interface CommandOutcome {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}

/**
 * Runs a binary to completion, collecting both streams.
 *
 * Resolves rather than rejects on a spawn error - a missing binary is an
 * answer this module has to be able to return, not an exception to escape
 * through.
 * @param binary - The executable's path or name.
 * @param args - Its arguments.
 * @returns What it exited with and wrote. `code` is null when it never ran.
 */
const run = (binary: string, args: readonly string[]): Promise<CommandOutcome> =>
  new Promise<CommandOutcome>((resolve) => {
    const child = spawn(binary, [...args], { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (spawnFailure: Error) => {
      resolve({ code: null, stdout, stderr: spawnFailure.message })
    })
    child.on('close', (code) => {
      resolve({ code, stdout, stderr })
    })
  })

/**
 * Runs `work` with the clip's bytes on disk, and cleans up afterwards.
 *
 * `ffmpeg` needs a SEEKABLE input for MP4 - the `moov` atom can sit at the
 * end of the file - so the bytes cannot simply be piped to its stdin. The
 * directory is removed whether `work` succeeded or not; a leaked temp
 * directory per upload is a disk that fills up quietly.
 * @param bytes - The clip's bytes.
 * @param work - Given the input path and a directory to write into.
 * @returns Whatever `work` returned.
 */
const withClipOnDisk = async <T>(
  bytes: Uint8Array,
  work: (paths: { readonly input: string; readonly directory: string }) => Promise<T>,
): Promise<T> => {
  const directory = await mkdtemp(join(tmpdir(), 'diary-clip-'))
  const input = join(directory, 'input.mp4')
  try {
    await writeFile(input, bytes)
    return await work({ input, directory })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

/**
 * A toolchain that shells out to real binaries, via temp files under
 * `os.tmpdir()`.
 * @param paths - Where `ffmpeg` and `ffprobe` are. Names alone are resolved
 *   on `PATH`, which is what the composition root passes.
 * @returns A toolchain whose every call spawns a process.
 */
export const createFfmpegToolchain = (paths: {
  readonly ffmpegPath: string
  readonly ffprobePath: string
}): ClipToolchain => ({
  probe: (bytes) =>
    withClipOnDisk(bytes, async ({ input }) => {
      const outcome = await run(paths.ffprobePath, [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        input,
      ])
      if (outcome.code !== 0) return err(`ffprobe failed: ${outcome.stderr.trim()}`)

      const durationSec = Number.parseFloat(outcome.stdout.trim())
      // A container with no duration reports an empty string or `N/A`, both
      // of which parse to NaN - and NaN would travel all the way to a
      // `durationSec` column as null.
      if (!Number.isFinite(durationSec) || durationSec <= 0) {
        return err(`ffprobe reported no usable duration: "${outcome.stdout.trim()}"`)
      }

      return ok({ durationSec })
    }),

  transcode: (bytes) =>
    withClipOnDisk(bytes, async ({ input, directory }) => {
      const output = join(directory, 'output.mp4')
      const outcome = await run(paths.ffmpegPath, [
        '-v',
        'error',
        '-y',
        '-i',
        input,
        // Silent loops: the handoff's clips carry no audio, and stripping it
        // is both smaller and one less codec to have available.
        '-an',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        // Puts the `moov` atom first, so a browser can start playing before
        // the whole file has arrived.
        '-movflags',
        '+faststart',
        output,
      ])
      if (outcome.code !== 0) return err(`ffmpeg failed: ${outcome.stderr.trim()}`)

      return ok(new Uint8Array(await readFile(output)))
    }),

  poster: (bytes, atSeconds) =>
    withClipOnDisk(bytes, async ({ input, directory }) => {
      const output = join(directory, 'poster.jpg')
      const outcome = await run(paths.ffmpegPath, [
        '-v',
        'error',
        '-y',
        // Before `-i`, so ffmpeg seeks rather than decoding up to the frame.
        '-ss',
        atSeconds.toFixed(3),
        '-i',
        input,
        '-frames:v',
        '1',
        output,
      ])
      if (outcome.code !== 0) return err(`ffmpeg poster extraction failed: ${outcome.stderr.trim()}`)

      return ok(new Uint8Array(await readFile(output)))
    }),
})

/**
 * Reports whether both binaries are on this machine.
 * @returns `true` when `ffmpeg` and `ffprobe` both answer `-version`.
 * @example
 * await clipToolchainAvailable() // false on the authoring machine
 */
export const clipToolchainAvailable = async (): Promise<boolean> => {
  const [ffmpeg, ffprobe] = await Promise.all([run('ffmpeg', [VERSION_ARGUMENT]), run('ffprobe', [VERSION_ARGUMENT])])

  return ffmpeg.code === 0 && ffprobe.code === 0
}

/**
 * The recorded stand-in: enough for the worker adapter's clip arm to be
 * exercised end to end, and honest about being no transcoder.
 *
 * `transcode` is the IDENTITY, deliberately: a stand-in that returned
 * different bytes would invite a reader to believe something was encoded.
 * `poster` returns a real, decodable JPEG because the worker adapter puts the
 * poster back through `runStillPipeline`, which sniffs and re-encodes it -
 * a fake poster would exercise the refusal path instead of the poster path.
 * @returns A toolchain that spawns nothing.
 */
const recordedStandIn = (): ClipToolchain => ({
  probe: () => Promise.resolve(ok({ durationSec: STAND_IN_DURATION_SECONDS })),
  transcode: (bytes) => Promise.resolve(ok(bytes)),
  poster: async () =>
    ok(
      new Uint8Array(
        await sharp({
          create: {
            width: STAND_IN_POSTER.width,
            height: STAND_IN_POSTER.height,
            channels: 3,
            background: { r: 40, g: 70, b: 110 },
          },
        })
          .jpeg()
          .toBuffer(),
      ),
    ),
})

/**
 * Which of the three cases in this module's header applies on this machine.
 *
 * The ONE place the question is asked, by the toolchain below and by the clip
 * FIXTURE alike: a second copy of the probe is how `aClip()` came to ignore
 * `MEDIA_REQUIRE_CLIP_TOOLCHAIN` and hand back a synthetic header under the
 * configuration that forbids one.
 * @returns `'real'` when both binaries answered `-version`, `'stand-in'` when
 *   they did not and their absence is tolerated. A two-valued union rather
 *   than a boolean, so a call site reads as which toolchain it got rather
 *   than as which way round a flag is (CLAUDE.md §3.2).
 * @throws {Error} When the binaries are missing and
 *   `MEDIA_REQUIRE_CLIP_TOOLCHAIN=1` is set. THROWN RATHER THAN RETURNED AS A
 *   REFUSAL, and that is the diagnosability of a CI failure rather than a
 *   style choice: a refusal becomes `'unreadable'` inside the worker adapter,
 *   and the clip case then fails with `expected null to be 'clip'` - a red
 *   build whose log never mentions `ffmpeg`. Thrown, the message naming the
 *   binary is the failure a maintainer reads. It reaches that maintainer
 *   through the FIXTURE and through `clipToolchain.integration.test.ts`, both
 *   outside the worker adapter - which catches everything, because the port's
 *   contract is that `process` never throws.
 * @example
 * await clipEncoderCase() // 'stand-in' on the authoring machine
 */
export const clipEncoderCase = async (): Promise<'real' | 'stand-in'> => {
  if (await clipToolchainAvailable()) return 'real'

  if (process.env[REQUIRE_TOOLCHAIN_VARIABLE] === REQUIRE_TOOLCHAIN_VALUE) {
    throw new Error(
      `${REQUIRE_TOOLCHAIN_VARIABLE}=${REQUIRE_TOOLCHAIN_VALUE} is set, but neither ffmpeg nor ffprobe answered -version on this machine. The worker MediaProcessor's clip arm cannot be exercised without them. Install both (CI does: see .github/workflows/ci.yml), or unset ${REQUIRE_TOOLCHAIN_VARIABLE} to run against the recorded stand-in and accept that the real path is UNRESOLVED.`,
    )
  }

  return 'stand-in'
}

/**
 * The toolchain for whichever case applies, with the stand-in's notice.
 * @returns The toolchain to use.
 */
const chooseToolchain = async (): Promise<ClipToolchain> => {
  if ((await clipEncoderCase()) === 'real') {
    return createFfmpegToolchain({ ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' })
  }

  console.warn(
    `[media] UNRESOLVED: ffmpeg and ffprobe are not installed on this machine, so the worker MediaProcessor's clip arm is running against the recorded stand-in in apps/web/lib/media/clipToolchain.ts. The still cases - which are the shared pipeline both adapters compose - are unaffected. Install ffmpeg to exercise the real path, or set ${REQUIRE_TOOLCHAIN_VARIABLE}=${REQUIRE_TOOLCHAIN_VALUE} to make its absence a failure. Nothing was sent anywhere to be checked (CLAUDE.md §7.1).`,
  )

  return recordedStandIn()
}

/**
 * The toolchain the contract suite uses. See the module header for the three
 * cases and which one this machine gets.
 *
 * Lazy on purpose: the availability probe spawns two processes, and the still
 * cases - which are the ones the phase's exit criterion names - must not pay
 * for it. Nothing is spawned until a clip call is made.
 *
 * RESOLVED ONCE PER TOOLCHAIN, not once per call. The three methods used to
 * re-ask, so one clip case spawned the two-process probe three times and
 * printed the ~500-character notice three times with it - measured at seven
 * notices and fourteen processes per media run. The memo is per returned
 * object rather than module-level state: a module-level cache would be the
 * mutable singleton CLAUDE.md §3.3 rejects, and would outlive a test that
 * changes `MEDIA_REQUIRE_CLIP_TOOLCHAIN`. A rejection is cached with it
 * deliberately, so case 2 reports the same named failure on every call.
 * @returns A toolchain that decides which of the three cases applies on first
 *   use.
 */
export const clipToolchainForTests = (): ClipToolchain => {
  let resolved: Promise<ClipToolchain> | undefined
  const chosen = (): Promise<ClipToolchain> => (resolved ??= chooseToolchain())

  return {
    probe: async (bytes) => (await chosen()).probe(bytes),
    transcode: async (bytes) => (await chosen()).transcode(bytes),
    poster: async (bytes, atSeconds) => (await chosen()).poster(bytes, atSeconds),
  }
}
