/**
 * media/sniff — what an uploaded file actually is, read from its own bytes.
 *
 * SECURITY.md, "Never serve uploads from the admin's origin", states the
 * requirement this module is: "Sniff the real type from magic bytes; never
 * trust the extension or the client-declared mime type." Neither a filename
 * nor a `Content-Type` reaches this function, so no future edit can quietly
 * start believing one — the only argument is the bytes.
 *
 * ═══ WHY THIS RUNS BEFORE ANYTHING DECODES THE FILE ═══
 *
 * Measured on this machine: `sharp` 0.35.4 here is built against `rsvg`
 * 2.62.91, so IT DECODES SVG. That makes this function the only thing between
 * an uploaded SVG and the store, and it makes the ORDER load-bearing rather
 * than tidy — a sniff that ran after the decode would be a check on a file
 * that had already been rendered. The handoff gives the reason in one line:
 * an SVG is an HTML document, so one uploaded file becomes stored XSS with
 * the author's own session attached. `ingestPolicy.ts` is what refuses it;
 * this is what names it, and a caller must call them in that order, before
 * handing the bytes to any decoder.
 *
 * ═══ PATTERN (CLAUDE.md §3.3) ═══
 *
 * None of the seven, deliberately. It is one pure function over a byte array:
 * a signature table and a bounded text scan. A Strategy or a registry here
 * would be an abstraction with a single caller, which §4 rejects.
 *
 * ═══ INVARIANTS A FUTURE EDIT COULD BREAK ═══
 *
 *   - **The MARKUP SCAN RUNS FIRST, ahead of every byte signature**, and that
 *     is a correctness requirement rather than a preference. Found by this
 *     task's own self-review: an XML comment ahead of the root element is
 *     legal in an SVG a browser renders, and `<!--` is four bytes wide, so
 *     `<!--ftyp--><svg …>` puts `ftyp` exactly where an ISO base media file
 *     carries it. Read in the other order, that file came back
 *     `'video/mp4'` — and `'video/mp4'` is ACCEPTED under `worker` mode.
 *     ANY signature read at an offset is spoofable that way. Asking the
 *     markup question first costs nothing and misreads nothing, because no
 *     JPEG, PNG, HEIC, MP4 or QuickTime file begins with `<`: their first
 *     bytes are `ff`, `89`, or a big-endian box length. The case is
 *     `sniff.test.ts`'s "names an SVG whose leading comment spoofs an ftyp
 *     box header".
 *   - **Then longest signature first.** PNG's eight bytes, then the `ftyp`
 *     box (which needs twelve to carry a brand), then JPEG's three. A
 *     shorter signature checked earlier could shadow a longer one.
 *   - **JPEG is three bytes, not four.** `ff d8 ff` is SOI plus the opening
 *     byte of whatever marker follows. A camera writes `ff e0` (JFIF) next
 *     and this machine's `sharp` writes `ff db` (a quantisation table), so a
 *     four-byte match would refuse the derivatives this pipeline itself
 *     produces. Both headers are cases in `sniff.test.ts`.
 *   - **The brand is read at offset 8 and must be complete.** A file that
 *     carries `ftyp` but is cut off before four brand bytes is `'unknown'`,
 *     never the `'video/mp4'` default — the brand is what the answer rests
 *     on, and defaulting without one is guessing.
 *   - **`mif1` and `msf1` are HEIF-generic rather than HEIC proper**, and are
 *     answered `'image/heic'` anyway, because the only thing this repository
 *     does with either is refuse it (`ingestPolicy.ts`, `'heic-unsupported'`).
 *     Naming a second type for an identical refusal would be an untested
 *     branch dressed as precision.
 *   - **The SVG scan reads at most {@link SVG_SCAN_BYTES} bytes.** The
 *     uploader chooses the length, so an unbounded scan of a 50MiB file is
 *     work an attacker picks for us; the size cap alone does not close that,
 *     because a file can be under the cap and still large.
 *   - **A major brand this table does not name answers `'video/mp4'`.** So an
 *     AVIF (major brand `avif`) is named `video/mp4` here. It is still
 *     refused for every real upload — a client declaring `image/avif` gets
 *     `'declared-mismatch'`, and inline mode defers video outright — but a
 *     caller must not read `'video/mp4'` as "this decodes as video".
 *
 * Depends on: nothing.
 */

/** Every type this repository can tell apart from a file's own bytes. */
export type SniffedType =
  'image/jpeg' | 'image/png' | 'image/heic' | 'image/svg+xml' | 'video/mp4' | 'video/quicktime' | 'unknown'

/** PNG's signature, whose last four bytes are its line-ending canary. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const

/** JPEG's start-of-image marker plus the first byte of the marker after it. */
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const

/** What an ISO base media file spells after its four-byte box length. */
const FTYP_TAG = 'ftyp'

/** Where that tag sits. */
const FTYP_OFFSET = 4

/** Where the major brand sits. */
const BRAND_OFFSET = 8

/** How wide the brand field is. Both it and the tag are four bytes. */
const FOUR_BYTE_FIELD = 4

/** The brands a still arrives under. See this module's header on `mif1`. */
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'mif1', 'msf1'] as const

/** QuickTime's brand, padded to the four bytes the field is wide. */
const QUICKTIME_BRAND = 'qt  '

/**
 * How much of a file the SVG scan reads.
 *
 * A kilobyte is more than any real SVG needs before its root element — an XML
 * declaration and a doctype together are under two hundred bytes — and it is
 * the bound the header's denial-of-service invariant rests on.
 */
const SVG_SCAN_BYTES = 1024

/**
 * A byte-order mark or whitespace ahead of the root element.
 *
 * `\s` already matches U+FEFF in JavaScript; the escape is written out anyway
 * because the BOM is the case this pattern exists for and a reader should not
 * have to know that to see it covered.
 */
const LEADING_NOISE = /^[\ufeff\s]+/u

/**
 * Whether these bytes open with this signature.
 * @param bytes - The file's bytes.
 * @param signature - The bytes a file of that type opens with.
 * @returns True only when every signature byte is present and equal, so a
 * file shorter than the signature answers false rather than throwing.
 */
const opensWith = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  signature.every((byte, index) => bytes[index] === byte)

/**
 * The text a run of bytes spells, decoded lossily.
 *
 * Lossy on purpose (`fatal: false`): a JPEG's bytes are not valid UTF-8, and
 * an exception on the way to answering "this is not markup" would be a
 * refusal path that throws instead of refusing.
 * @param bytes - The file's bytes.
 * @param offset - Where the run starts.
 * @param length - How many bytes to read at most.
 * @returns The decoded text, which is shorter than `length` when the file is.
 */
const textAt = (bytes: Uint8Array, offset: number, length: number): string =>
  new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(offset, offset + length))

/**
 * The type an ISO base media file's major brand names.
 * @param bytes - The file's bytes, already known to carry an `ftyp` box.
 * @returns The still or clip type the brand names, or `'unknown'` when the
 * file is cut off before a complete brand.
 */
const typeFromBrand = (bytes: Uint8Array): SniffedType => {
  if (bytes.length < BRAND_OFFSET + FOUR_BYTE_FIELD) return 'unknown'

  const brand = textAt(bytes, BRAND_OFFSET, FOUR_BYTE_FIELD)
  if (HEIC_BRANDS.some((heic) => heic === brand)) return 'image/heic'
  if (brand === QUICKTIME_BRAND) return 'video/quicktime'

  return 'video/mp4'
}

/**
 * Whether the file's opening kilobyte is markup carrying an `svg` root.
 *
 * An SVG has no magic number — it is XML — so its root element is the only
 * evidence a file holds.
 * @param bytes - The file's bytes.
 * @returns True when the file begins as markup and names an `svg` element
 * within {@link SVG_SCAN_BYTES}.
 */
const looksLikeSvgMarkup = (bytes: Uint8Array): boolean => {
  const opening = textAt(bytes, 0, SVG_SCAN_BYTES).toLowerCase().replace(LEADING_NOISE, '')

  // Both halves are load-bearing, and each rejects a different file: the
  // first, a binary file that happens to contain the text `<svg` somewhere
  // inside it; the second, an HTML document that draws nothing. A file that
  // is markup AND names an svg element is an SVG for this pipeline's
  // purposes, whether an XML declaration, a doctype or a comment came first.
  return opening.startsWith('<') && opening.includes('<svg')
}

/**
 * Names what a file is, from its bytes alone.
 *
 * Never from a filename, an extension or a client-declared type — none of
 * which this function is given (SECURITY.md, Uploads). Must be called BEFORE
 * the bytes reach any decoder: this build of `sharp` renders SVG, so the
 * order is the control rather than a convention (see this module's header).
 * @param bytes - The uploaded file's bytes. May be empty, truncated, or not a
 * media file at all.
 * @returns The type the bytes identify, or `'unknown'` — which the ingest
 * policy refuses, so an unrecognised file is a refused file by default.
 * @example
 * sniffMediaType(svgBytesStoredUnderAJpgName) // 'image/svg+xml'
 */
export const sniffMediaType = (bytes: Uint8Array): SniffedType => {
  // Markup first. See the header's spoofing invariant: an offset-based
  // signature can be spoofed by a document that is markup all the way down,
  // and nothing real begins with `<`.
  if (looksLikeSvgMarkup(bytes)) return 'image/svg+xml'

  if (opensWith(bytes, PNG_SIGNATURE)) return 'image/png'
  if (textAt(bytes, FTYP_OFFSET, FOUR_BYTE_FIELD) === FTYP_TAG) return typeFromBrand(bytes)
  if (opensWith(bytes, JPEG_SIGNATURE)) return 'image/jpeg'

  return 'unknown'
}
