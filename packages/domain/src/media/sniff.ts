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
 * a fork between markup and binary, then a signature table on the binary
 * side. A Strategy or a registry here would be an abstraction with a single
 * caller, which §4 rejects.
 *
 * ═══ INVARIANTS A FUTURE EDIT COULD BREAK ═══
 *
 *   - **A FILE THAT IS MARKUP NEVER REACHES A BYTE SIGNATURE**, and that is a
 *     correctness requirement rather than a preference. Once the noise is
 *     stripped and the first character is `<`, {@link typeFromMarkup} answers
 *     the file and the signature table below is unreachable — which is why
 *     that function's return type is narrowed to
 *     `'image/svg+xml' | 'unknown'` rather than `SniffedType`: an edit that
 *     tried to answer a container type from markup would not compile.
 *
 *     WHY IT IS STRUCTURAL AND NOT A SCAN. ANY signature read at an offset is
 *     spoofable by a legal prefix of the right width. `<!--` is four bytes,
 *     so `<!--ftypisom…` puts `ftyp` at offset 4 and the brand at offset 8,
 *     exactly where an ISO base media file carries them; so does `<?x `
 *     (a processing instruction, fourteen bytes of prolog and no padding),
 *     and so does `<br>`. The FIRST fix for this asked the markup question
 *     first but let a "no" fall through to the signature table, and a bounded
 *     scan answers "no" for a document that genuinely is markup — pad the
 *     comment past {@link MARKUP_WINDOW_BYTES}, or spell the root
 *     `<s:svg xmlns:s="…">`, and the file came back `'video/mp4'` or
 *     `'video/quicktime'` — and `'image/heic'` by the same arithmetic.
 *     `'video/mp4'` is ACCEPTED under `worker` mode, and the Task 2
 *     review confirmed in this repository's own Chromium that those
 *     documents render and EXECUTE their script. The
 *     bound therefore decides how precisely markup is NAMED, never whether
 *     it can be read as a container.
 *
 *     WHAT IT COSTS, stated rather than implied. A file whose first
 *     non-noise byte is `<` and whose root element is not visible within the
 *     bound is `'unknown'`, which `ingestPolicy.ts` refuses as
 *     `'type-not-allowed'` — a refusal under a name that says "unrecognised"
 *     for what may be an SVG. The one non-markup file this could misname is a
 *     classic QuickTime whose first box is 0x3C000000–0x3CFFFFFF bytes long
 *     (≈1.006–1.02 GB, so byte 0 is `<`); such a file carries no `ftyp` at
 *     offset 4, so it answered `'unknown'` before this fix too. Nothing else
 *     real begins with `<`: a JPEG opens `ff`, a PNG `89`, and every
 *     `ftyp`-first file a four-byte big-endian box length of a 20–30 byte box.
 *     The cases are `sniff.test.ts`'s `on documents that are markup` block.
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
 *   - **The markup window is at most {@link MARKUP_WINDOW_BYTES} bytes.** The
 *     uploader chooses the length, so an unbounded scan of a 50MiB file is
 *     work an attacker picks for us; the size cap alone does not close that,
 *     because a file can be under the cap and still large. Per the invariant
 *     above, running out of window costs a NAME and never a refusal.
 *   - **A UTF-16 document is not detected as markup, and a UTF-16 SVG cannot
 *     be smuggled as a container.** Those are two claims and only the second
 *     one is about SVG, which is the distinction this invariant used to lose.
 *     Decoded as UTF-8 a UTF-16 document's BOM is two replacement characters
 *     rather than `<`, so it never takes the markup branch and falls to the
 *     signature table. For it to come back a CONTAINER type, `ftyp` has to
 *     land at offset 4 — which for a UTF-16 document means its first two
 *     characters are U+7466 and U+7079 (little-endian) or U+6674 and U+7970
 *     (big-endian). No SVG prolog contains those, so no UTF-16 SVG reaches a
 *     container answer.
 *
 *     WHAT THIS DOES NOT SAY, because the earlier wording did say it and it
 *     was false: a UTF-16 document in general absolutely can reach one. The
 *     signature table reads RAW BYTE OFFSETS and knows nothing of encodings,
 *     so `ff fe 3c 00 66 74 79 70 69 00 73 00` — a twelve-byte UTF-16LE
 *     document with a BOM, whose text is `<瑦灹is` — is answered
 *     `'video/mp4'`, and `worker` mode ACCEPTS that type (measured; Task 2
 *     fix re-review, new finding 2). It is not an SVG and no browser renders
 *     it as one, so this is a consequence of what a `'video/mp4'` answer
 *     MEANS rather than a hole: the answer rests on four bytes at offset 4
 *     spelling `ftyp`, and on nothing else about the file.
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
 * How much of a file the markup window holds.
 *
 * A kilobyte is more than any real SVG needs before its root element — an XML
 * declaration and a doctype together are under two hundred bytes — and it is
 * the bound the header's denial-of-service invariant rests on. It bounds how
 * precisely markup is NAMED and nothing else: a document whose root element
 * sits past it is `'unknown'`, never a container type.
 */
const MARKUP_WINDOW_BYTES = 1024

/**
 * A byte-order mark or whitespace ahead of the root element.
 *
 * `\s` already matches U+FEFF in JavaScript; the escape is written out anyway
 * because the BOM is the case this pattern exists for and a reader should not
 * have to know that to see it covered.
 */
const LEADING_NOISE = /^[\ufeff\s]+/u

/**
 * The character every markup document's first non-noise byte is.
 */
const MARKUP_OPENER = '<'

/**
 * The characters an XML name may be spelled with, as a character class body.
 *
 * The union of XML 1.0's `NameStartChar` and `NameChar` productions, minus
 * `:` (which separates a prefix from a local name) and minus the upper-case
 * ranges, because {@link openingWindow} has already lower-cased the window.
 * Three consecutive source ranges are merged into `\u00f8-\u037d`, which is
 * exactly their union.
 *
 * IT WAS `[a-z0-9._-]`, AND THAT WAS ASCII-ONLY WHILE XML NAMES ARE NOT.
 * The Task 2 fix re-review served `<é:svg xmlns:é="http://www.w3.org/2000/svg">`
 * and a Greek-prefixed `<ν:svg …>` from a loopback origin as `image/svg+xml`
 * and Chromium reported `root=é:svg ns=http://www.w3.org/2000/svg svgRects=1
 * scriptRan=true` for both: live stored-XSS attempts, sniffed `'unknown'`.
 * They were still refused — `'type-not-allowed'`, nothing was accepted — but
 * under a name that says "unrecognised file" for a document that renders and
 * executes, and `ingestPolicy.ts`'s header is the argument for why that name
 * is not interchangeable with the refusal.
 *
 * This class is a strict SUPERSET of the ASCII one it replaced, so no
 * document that was named `image/svg+xml` stopped being named it. Digits and
 * `.`/`-`/`_` are still admitted in the FIRST position, where XML forbids
 * them: `<1:svg …>` is not well-formed, and served as `image/svg+xml` this
 * repository's own Chromium answered it with a parse error at line 1 column
 * 2 and ran nothing (measured) — so naming it an SVG over-refuses in the
 * direction that costs nothing, while narrowing would be this module
 * choosing to be stricter than the parser it protects.
 */
const XML_NAME_CHARACTERS = String.raw`a-z0-9._\-\u00b7\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u037d\u037f-\u1fff\u200c-\u200d\u203f-\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd\u{10000}-\u{effff}`

/**
 * An `svg` element, with or without a namespace prefix.
 *
 * `<s:svg xmlns:s="http://www.w3.org/2000/svg">` is a legal SVG root — the
 * prefix is bound to the SVG namespace by the attribute, Chromium parses it
 * into that namespace and runs the `<s:script>` inside it (measured in the
 * Task 2 review) — so a test for the literal text `<svg` misses a live
 * document. The prefix is {@link XML_NAME_CHARACTERS} rather than ASCII for
 * the reason that constant records.
 *
 * ═══ THE TRAILING LOOKAHEAD IS ASCII ON PURPOSE, AND THAT IS MEASURED ═══
 *
 * It is what keeps `<svgsprite …>` from answering as an SVG: a name that
 * merely BEGINS with `svg` is a different element. Widening it to
 * {@link XML_NAME_CHARACTERS} would be tidier, and was rejected because it
 * would make one answer WORSE. Served as `image/svg+xml` in this
 * repository's own Chromium, `<svgλ xmlns="http://www.w3.org/2000/svg">`
 * wrapping an SVG-namespace `<script>` reported `root=svgλ
 * ns=http://www.w3.org/2000/svg parseError=false scriptRan=true` — and so
 * did `<svg̈ …>`, an `svg` with a combining diaeresis. The ASCII lookahead
 * does not know U+03BB is a NameChar, so it names both `'image/svg+xml'`,
 * which is the accurate name for a document that executes. A wider lookahead
 * would answer `'unknown'` for them.
 *
 * WHAT THAT LEAVES, STATED EXACTLY RATHER THAN IMPLIED.
 * `<svgsprite xmlns="http://www.w3.org/2000/svg">` around an SVG-namespace
 * `<script>` ALSO executes (same run: `root=svgsprite scriptRan=true`) and is
 * answered `'unknown'`. That is a naming limit and not a bypass —
 * `'unknown'` is refused as `'type-not-allowed'`, so nothing is stored either
 * way — and it cannot be closed by this regex, which reads element names and
 * never the `xmlns` that decides whether they are in the SVG namespace:
 * dropping the lookahead would name `<svgsprite
 * xmlns="http://example.test/sprite"/>`, which executes nothing, an SVG
 * instead. Both directions mis-name one document, and the one kept mis-names
 * the inert one. Closing it properly needs a namespace-aware read of the
 * root element, which is a parser and not a sniff.
 */
const SVG_ROOT_ELEMENT = new RegExp(String.raw`<(?:[${XML_NAME_CHARACTERS}]+:)?svg(?![a-z0-9._-])`, 'u')

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
 * The file's opening window as markup would be read: decoded, lowercased,
 * with a byte-order mark and leading whitespace removed.
 *
 * Lowercased because `<SVG XMLNS="…">` is the same document as `<svg
 * xmlns="…">` to an HTML parser; noise-stripped because a rejection that
 * only catches a file starting exactly at the angle bracket is one an
 * uploader gets past by pressing return.
 * @param bytes - The file's bytes.
 * @returns At most {@link MARKUP_WINDOW_BYTES} bytes of text, possibly empty.
 */
const openingWindow = (bytes: Uint8Array): string =>
  textAt(bytes, 0, MARKUP_WINDOW_BYTES).toLowerCase().replace(LEADING_NOISE, '')

/**
 * The type a markup document is, which is one of exactly two.
 *
 * An SVG has no magic number — it is XML — so its root element is the only
 * evidence a file holds. The return type is deliberately NARROWER than
 * {@link SniffedType}: this is the function the markup branch answers from,
 * and a container type must not be reachable from it (see the header's first
 * invariant). Widening this signature is the defect, not the fix.
 * @param opening - The window {@link openingWindow} produced, already known
 * to begin with `<`.
 * @returns `'image/svg+xml'` when an `svg` root element is visible in the
 * window, and `'unknown'` for all other markup — an HTML document that draws
 * nothing, or a document whose root element the window does not reach.
 */
const typeFromMarkup = (opening: string): 'image/svg+xml' | 'unknown' =>
  SVG_ROOT_ELEMENT.test(opening) ? 'image/svg+xml' : 'unknown'

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
  const opening = openingWindow(bytes)

  // THE FORK, and it is exhaustive by construction rather than by scanning:
  // a file that is markup is answered from its markup, and both answers to
  // that question are inside this branch. Nothing below is reachable for it,
  // which is what stops a legal prefix from placing a container signature's
  // bytes at a container signature's offset (see the header's first
  // invariant). A bounded window that ran out used to fall through to
  // exactly that, and accepted a script-executing SVG as `'video/mp4'`.
  if (opening.startsWith(MARKUP_OPENER)) return typeFromMarkup(opening)

  if (opensWith(bytes, PNG_SIGNATURE)) return 'image/png'
  if (textAt(bytes, FTYP_OFFSET, FOUR_BYTE_FIELD) === FTYP_TAG) return typeFromBrand(bytes)
  if (opensWith(bytes, JPEG_SIGNATURE)) return 'image/jpeg'

  return 'unknown'
}
