/**
 * stillPipeline — steps 1 to 6 of the upload pipeline, written ONCE and
 * composed by both MediaProcessor adapters.
 *
 * ═══ WHY THIS MODULE EXISTS RATHER THAN TWO IMPLEMENTATIONS ═══
 *
 * ADR 0004 requires both adapters to pass one contract suite. A suite can only
 * prove the two BEHAVE the same; what makes them the same is that there is one
 * pipeline. `inline-media-processor.ts` is this function plus a type list;
 * `worker-media-processor.ts` is this function plus step 7. So "are the two
 * still pipelines the same?" has an answer a reviewer can check in one place
 * instead of a diff between two files that will drift.
 *
 * ═══ THE ORDER IS THE MECHANISM, NOT A STYLE CHOICE ═══
 *
 * SECURITY.md gives the sequence and this module follows it exactly:
 *
 *   1. {@link sniffMediaType} over the bytes alone - no filename, no declared
 *      type.
 *   2. {@link ingestDecision}, which refuses SVG, HEIC and (under `inline`)
 *      video. **NOTHING HAS REACHED `sharp` YET, AND THAT IS THE POINT.**
 *      This repository's `sharp` 0.35.4 is built against `rsvg` 2.62.91 and
 *      therefore DECODES SVG (measured; `media/sniff.ts`'s header carries the
 *      measurement). An SVG is an HTML document, so one upload that reaches
 *      the store becomes stored XSS with the author's own session attached. A
 *      refusal that ran after the decode would be a check on a file that had
 *      already been rendered. Task 2 was defeated five ways at this seam;
 *      moving step 2 below step 4 reopens all of it, and the contract suite's
 *      SVG case is what fails when someone does.
 *   3. {@link readExifFacts} for the capture time, ONCE, before anything is
 *      stripped - because after step 4 there is nothing left to read.
 *   4. Re-encode. SECURITY.md: "Re-encode stills rather than passing
 *      originals through - that removes metadata and any embedded payload in
 *      one step."
 *   5. Hash the SANITISED bytes.
 *   6. Answer with the encoder's own reported size.
 *
 * ═══ INVARIANTS A FUTURE EDIT COULD BREAK ═══
 *
 *   - **NO `withMetadata()` AND NO `keepExif()` ANYWHERE ON THE CHAIN.**
 *     `sharp` drops metadata by default, so the requirement is discharged by
 *     the absence of a call rather than the presence of one - which is
 *     exactly the kind of thing an edit adds back without noticing. Adding
 *     either publishes the author's home address (SECURITY.md: "Shoot
 *     anything at home and you have published your home address"). The
 *     contract suite's metadata case fails in BOTH adapters' suites when it
 *     is added, which is the single most important mutation in this phase.
 *   - **THE HASH IS TAKEN FROM THE SANITISED BYTES, NEVER THE UPLOAD.** Two
 *     uploads of one photograph, one carrying GPS and one stripped, must hash
 *     alike or duplicate detection reports them as different photographs. The
 *     contract suite has a case for exactly that pair.
 *   - **THE WIDTH AND HEIGHT COME FROM `sharp`'s OWN `info`**, never from the
 *     input: auto-orientation may have swapped them, and a 900x1200 file
 *     recorded as 1200x900 makes every derivative tier crop the wrong way.
 *   - **EVERY `sharp` CALL SITS INSIDE ONE `try`/`catch` RETURNING
 *     `err('unreadable')`.** CLAUDE.md §3.1 forbids an empty `catch`; this
 *     one converts an exception into a typed refusal, which is its opposite.
 *     The bytes are attacker-controlled, so a throw here would be a refusal
 *     path that crashes the request instead of answering it.
 *
 * ═══ WHY ORIENTATION IS APPLIED BY `rotate()` AND NOT BY A DEGREE COUNT ═══
 *
 * `rotate()` with no argument is libvips' EXIF auto-orientation, and it is
 * the only call that expresses all EIGHT EXIF orientations - four of which
 * are MIRRORED (2, 4, 5, 7), which no rotation angle can produce. A
 * hand-written `rotate(degrees)` table would silently get those four wrong,
 * and `rotate(orientation)` would be worse still: it would rotate a
 * photograph by six DEGREES for orientation 6. So the transform is libvips',
 * and the orientation `readExifFacts` reads is what the contract suite
 * asserts as its POSITIVE CONTROL - that the input really is on its side -
 * rather than a number fed to sharp. The two facts SECURITY.md asks to
 * capture are both captured; only one of them is carried in the result,
 * because the other has been baked into the pixels and the tag is gone.
 *
 * PATTERN (CLAUDE.md §3.3): Result type - every refusal is a value, and the
 * `Result` is what forces a caller to handle one. Not Ports & Adapters: this
 * is the shared body the adapters compose, not a port of its own.
 * Depends on: sharp; the domain's sniff, ingest policy, EXIF reader and
 * perceptual hash; the MediaProcessor port's types.
 */
import sharp from 'sharp'
import { readExifFacts } from '@travel-diary/domain/media/exif'
import type { AcceptedType, PipelineMode } from '@travel-diary/domain/media/ingestPolicy'
import { ingestDecision } from '@travel-diary/domain/media/ingestPolicy'
import { DHASH_HEIGHT, DHASH_WIDTH, dHash } from '@travel-diary/domain/media/perceptualHash'
import { sniffMediaType } from '@travel-diary/domain/media/sniff'
import type { Result } from '@travel-diary/domain/result'
import { err, ok } from '@travel-diary/domain/result'
import type { ProcessedStill, ProcessingRefusal, UploadedBytes } from '../ports/mediaProcessor'

/** The quality every stored still is re-encoded at. */
const JPEG_QUALITY = 88

/** The two accepted types this pipeline can decode. Clips are step 7's. */
const STILL_TYPES: readonly AcceptedType[] = ['image/jpeg', 'image/png']

/** The extension every stored still gets, since every stored still is a JPEG. */
const STORED_EXTENSION = '.jpg'

/**
 * The filename a re-encoded still is stored under.
 *
 * Re-extensioned rather than kept: a PNG that comes out of this pipeline as a
 * JPEG must not be stored as `.png`, or every consumer that trusts the
 * extension - a download handler's `Content-Type`, an operator reading a
 * bucket listing - is looking at a lie.
 * @param filename - What the client called the file.
 * @returns The same name with a `.jpg` extension.
 * @example
 * storedName('bergen.png') // 'bergen.jpg'
 */
const storedName = (filename: string): string => {
  const lastDot = filename.lastIndexOf('.')
  // A dot at position 0 is a dotfile's leading dot, not an extension.
  return lastDot > 0 ? `${filename.slice(0, lastDot)}${STORED_EXTENSION}` : `${filename}${STORED_EXTENSION}`
}

/** Whether a decided type is one this pipeline can decode. */
const isStill = (accepted: AcceptedType): boolean => STILL_TYPES.some((still) => still === accepted)

/**
 * Sniffs, refuses, strips, re-encodes and hashes one still.
 *
 * Never throws, whatever the bytes are - see this module's invariants.
 * @param upload - The bytes a client sent, with what it called them. The
 *   declared type is used only to refuse a disagreement; the filename only
 *   for the stored name.
 * @param options - `mode` is the configured `MEDIA_PIPELINE`, passed to the
 *   ingest policy. An options object rather than a bare string so the call
 *   site says what the value means (CLAUDE.md §3.2).
 * @returns `ok` with the processed still, or `err` naming the refusal.
 * @example
 * await runStillPipeline(upload, { mode: 'inline' })
 * // { ok: false, error: 'svg-rejected' }, for SVG bytes named holiday.jpg
 */
export const runStillPipeline = async (
  upload: UploadedBytes,
  options: { readonly mode: PipelineMode },
): Promise<Result<ProcessedStill, ProcessingRefusal>> => {
  const sniffed = sniffMediaType(upload.bytes)
  const decision = ingestDecision({ sniffed, declared: upload.declaredType, mode: options.mode })
  if (!decision.ok) return err(decision.error)

  // A clip that reaches the STILL pipeline is a ROUTING mistake rather than an
  // upload problem: `inline` refused it at the decision above, and `worker`'s
  // adapter sends clips to the toolchain and never here. Answered
  // `'unreadable'` because no policy refused these bytes - they are simply not
  // a still this function can decode - and refused HERE rather than left for
  // sharp to fail on, so no path exists where a decoder is handed bytes
  // nothing has decided are a still.
  if (!isStill(decision.value)) return err('unreadable')

  // Once, and before step 4 removes everything there is to read.
  const facts = readExifFacts(upload.bytes)

  try {
    const sanitised = await sharp(Buffer.from(upload.bytes))
      // libvips' EXIF auto-orientation. See this module's header for why it
      // is not a degree count, and why adding `withMetadata()` or
      // `keepExif()` to this chain publishes the author's home address.
      .rotate()
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })

    const grid = await sharp(sanitised.data)
      .resize(DHASH_WIDTH, DHASH_HEIGHT, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer()
    const hashed = dHash([...grid])
    // A GUARD RATHER THAN DEAD CODE: dHash's contract permits this refusal,
    // and it refuses exactly one thing - a grid that is not
    // DHASH_WIDTH * DHASH_HEIGHT samples. A greyscale raw buffer of that
    // resize is one byte per sample, pinned at 72 by
    // `stillPipeline.integration.test.ts`, so reaching the false arm needs
    // sharp to return a different shape - which cannot be arranged without
    // mocking sharp, and sharp is not ours to mock (CLAUDE.md §2.3).
    /* c8 ignore next -- see the comment above: no organic trigger short of mocking sharp */
    if (!hashed.ok) return err('unreadable')

    return ok({
      kind: 'still',
      bytes: new Uint8Array(sanitised.data),
      contentType: 'image/jpeg',
      filename: storedName(upload.filename),
      capturedAt: facts.capturedAt,
      contentHash: hashed.value,
      width: sanitised.info.width,
      height: sanitised.info.height,
    })
  } catch {
    // Not an empty catch (CLAUDE.md §3.1): a decoder failure on
    // attacker-controlled bytes is a typed refusal, not an exception for a
    // request handler to crash on.
    return err('unreadable')
  }
}
