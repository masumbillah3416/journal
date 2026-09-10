/**
 * sniff.test.ts — what a file actually is, decided before anything decodes it.
 *
 * SECURITY.md, "Never serve uploads from the admin's origin", is the binding
 * requirement and it names the source of truth: "Sniff the real type from
 * magic bytes; never trust the extension or the client-declared mime type."
 * So the case that carries this file is not the one that feeds a `.svg` named
 * `.svg` - a name proves nothing here, and a test built on one would pass
 * against an implementation that read the name. It is the one that feeds SVG
 * BYTES and expects `'image/svg+xml'` back regardless of what anything is
 * called, which `ingestPolicy.test.ts` then refuses.
 *
 * WHY THE FIXTURES LIVE IN `../testing/factories`. Each of the four carries a
 * paragraph recording how its bytes are known to be a real file's - two of
 * them measured against files this machine produced. A fixture that guessed
 * at the bytes would make every case below agree with the implementation
 * rather than with an upload, which is the defect species this repository has
 * shipped twice.
 *
 * THE TWO DESCRIBE BLOCKS. `sniffMediaType` holds the signature table's own
 * cases - one per format, plus the truncated and unrecognised files that must
 * answer `'unknown'` rather than a guess. `sniffMediaType, on documents that
 * are markup` holds the second: the shapes that put a container signature's
 * bytes at a container signature's offset inside legal markup. They are their
 * own block because they are one class rather than one case, and the Task 2
 * review defeated a fix that closed a single shape of it (findings 1 and 2).
 *
 * Depends on: vitest, ./sniff, ../testing/factories.
 */
import { describe, expect, it } from 'vitest'
import { sniffMediaType } from './sniff'
import { aJpegHeader, anAvifHeader, anIsoBmffHeader, anSvgDocument, aPngHeader } from '../testing/factories'

describe('sniffMediaType', () => {
  it('names a JPEG from its start-of-image marker', () => {
    expect(sniffMediaType(aJpegHeader())).toBe('image/jpeg')
  })

  it('names a JPEG whose fourth byte opens a quantisation table, not a JFIF segment', () => {
    // MEASURED, not imagined: `sharp` 0.35.4 on this machine encodes a JPEG
    // that opens `ff d8 ff db` - SOI then DQT - where a camera writes
    // `ff d8 ff e0`. Both are JPEGs. A four-byte signature would refuse
    // every derivative this repository's own pipeline writes, so this case
    // is what pins the match to the three bytes they share.
    expect(sniffMediaType(new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00]))).toBe('image/jpeg')
  })

  it('names a PNG from its eight-byte signature', () => {
    expect(sniffMediaType(aPngHeader())).toBe('image/png')
  })

  it('separates HEIC from MP4 by the ftyp brand, not by the box header they share', () => {
    expect(sniffMediaType(anIsoBmffHeader({ brand: 'heic' }))).toBe('image/heic')
    expect(sniffMediaType(anIsoBmffHeader({ brand: 'isom' }))).toBe('video/mp4')
  })

  it('names every HEIC and HEIF brand a still can arrive under', () => {
    // All five refuse identically downstream, so all five have to arrive at
    // the same answer here rather than three of them falling through to
    // `'video/mp4'` and being handed to a video pipeline.
    // The expectation is five literals rather than `brands.map(() =>
    // 'image/heic')`: an expectation derived from the array it iterates
    // passes vacuously if the array is ever emptied.
    const brands = ['heic', 'heix', 'hevc', 'mif1', 'msf1']

    expect(brands.map((brand) => sniffMediaType(anIsoBmffHeader({ brand })))).toEqual([
      'image/heic',
      'image/heic',
      'image/heic',
      'image/heic',
      'image/heic',
    ])
  })

  it('names QuickTime from the qt brand', () => {
    expect(sniffMediaType(anIsoBmffHeader({ brand: 'qt' }))).toBe('video/quicktime')
  })

  it('names an SVG, which no byte signature announces, from its root element', () => {
    expect(sniffMediaType(anSvgDocument())).toBe('image/svg+xml')
  })

  it('names an SVG that leads with whitespace and a byte-order mark', () => {
    // A rejection that only catches a file starting exactly at the angle
    // bracket is a rejection an uploader gets past by pressing return.
    expect(sniffMediaType(anSvgDocument({ leadingWhitespace: '\ufeff\n  ' }))).toBe('image/svg+xml')
  })

  it('names an SVG wrapped in an XML declaration', () => {
    const declared = new TextEncoder().encode(
      `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"/>`,
    )

    expect(sniffMediaType(declared)).toBe('image/svg+xml')
  })

  it('names an SVG whose leading comment spoofs an ftyp box header', () => {
    // THE SHAPE THAT STARTED THE CLASS. An XML comment before the root
    // element is legal in an SVG a browser renders, and `<!--` is four bytes
    // - so a comment opening with `ftyp` puts that tag exactly where an ISO
    // base media file carries it, and this document came back `'video/mp4'`,
    // a type worker mode ACCEPTS. Any signature read at an OFFSET is
    // spoofable this way, which is why a file that is markup is answered
    // from its markup and cannot reach the signature table at all. The
    // shapes that defeated the first, scan-shaped fix for this are in the
    // `on documents that are markup` block below.
    const spoof = new TextEncoder().encode(
      '<!--ftyp--><svg xmlns="http://www.w3.org/2000/svg"><script>0</script></svg>',
    )

    expect(sniffMediaType(spoof)).toBe('image/svg+xml')
  })

  it('reports unknown for markup that is not an SVG, rather than refusing all markup as one', () => {
    const html = new TextEncoder().encode('<!doctype html><html><body>not a drawing</body></html>')

    expect(sniffMediaType(html)).toBe('unknown')
  })

  it('reports unknown rather than guessing, for bytes it does not recognise', () => {
    expect(sniffMediaType(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe('unknown')
  })

  it('reports unknown for an empty upload rather than throwing', () => {
    expect(sniffMediaType(new Uint8Array())).toBe('unknown')
  })

  it('reports unknown for a file too short to carry any signature', () => {
    expect(sniffMediaType(new Uint8Array([0xff]))).toBe('unknown')
  })

  it('names a real AVIF an mp4, because avif is not a brand this table separates', () => {
    // MEASURED, not synthesised: `anAvifHeader` is a transcription of an
    // AVIF this machine's `sharp` 0.35.4 wrote, and its docstring holds the
    // bytes. The brief's table names every unrecognised
    // brand `'video/mp4'` and `SniffedType` has no AVIF member, so this is
    // the answer, and it is the invariant Phase 3 Task 6 has to honour: a
    // `'video/mp4'` from here means "an ISO base media file whose brand this
    // table does not know", NEVER "this decodes as video".
    expect(sniffMediaType(anAvifHeader())).toBe('video/mp4')
  })

  it('answers video/mp4 behind any four bytes that do not decode to a leading angle bracket', () => {
    // M15's MECHANISM, in the tree rather than only in a gitignored review
    // file - which is where it was, and a disclosure a fresh clone does not
    // carry is one Phase 3 Task 6 will not read. A `'video/mp4'` from this
    // table means ONLY that bytes 4-7 spell `ftyp`: the box length at offset
    // 0 is never read, and nothing past offset 11 is looked at.
    //
    // THE CLASS IS ANY FOUR SUCH BYTES, NOT "FOUR SPACES". Each prefix below
    // was measured through the shipped build (Task 2 fix re-review §B): four
    // spaces; U+00A0 twice, which `LEADING_NOISE` strips because JavaScript's
    // `\s` matches it although XML forbids it before a prolog; U+3000 plus
    // one filler byte, three noise BYTES to one string character while the
    // table reads raw offsets; VT and FF, which XML 1.0 forbids outright;
    // invalid UTF-8, four replacement characters; and a UTF-32LE byte-order
    // mark, which needs no noise-stripping at all. The UTF-16LE member of the
    // same class has its own case in the markup block below.
    //
    // None of them is markup and none renders as anything, so this is a
    // recorded meaning rather than a hole - but `worker` mode ACCEPTS
    // `'video/mp4'`, so Task 6 must not read this answer as "this decodes as
    // video". The expectation is six literals rather than a map over the
    // prefixes: an expectation derived from the array it iterates passes
    // vacuously if the array is ever emptied.
    const behind = (prefix: readonly number[]): Uint8Array =>
      new Uint8Array([...prefix, ...new TextEncoder().encode('ftypisom0000')])

    expect([
      sniffMediaType(behind([0x20, 0x20, 0x20, 0x20])),
      sniffMediaType(behind([0xc2, 0xa0, 0xc2, 0xa0])),
      sniffMediaType(behind([0xe3, 0x80, 0x80, 0x71])),
      sniffMediaType(behind([0x0b, 0x0c, 0x0b, 0x0c])),
      sniffMediaType(behind([0xc2, 0xc2, 0xc2, 0xc2])),
      sniffMediaType(behind([0xff, 0xfe, 0x00, 0x00])),
    ]).toEqual(['video/mp4', 'video/mp4', 'video/mp4', 'video/mp4', 'video/mp4', 'video/mp4'])
  })

  it('reports unknown for an ftyp box cut off before its brand', () => {
    // A truncated upload must not fall through to the `'video/mp4'` default:
    // the brand is what the answer rests on, and eight bytes carry none.
    expect(sniffMediaType(new Uint8Array([0x00, 0x00, 0x00, 0x10, 0x66, 0x74, 0x79, 0x70]))).toBe('unknown')
  })
})

describe('sniffMediaType, on documents that are markup', () => {
  it('refuses to read an ftyp box out of a comment long enough to hide the root element', () => {
    // THE WHOLE CLASS, in one case. `<!--` is four bytes wide, so a comment
    // opening `<!--ftypisom` puts `ftyp` at offset 4 and the brand at offset
    // 8 - exactly where an ISO base media file carries them. Pad the comment
    // past the scan's bound and the root element is out of sight, so a scan
    // that answers "not an SVG" hands the file to the very offset signature
    // the padding was built for. The Task 2 review measured this document in
    // this repository's own Chromium, served as `image/svg+xml`: it parses
    // into the SVG namespace, renders, and EXECUTES its script. `'video/mp4'`
    // is a type `worker` mode accepts, so that answer was a live bypass.
    // `'unknown'` is the refusal; a container type is the defect.
    const spoof = anSvgDocument({ prologue: `<!--ftypisom${'.'.repeat(1100)}-->` })

    expect(sniffMediaType(spoof)).toBe('unknown')
  })

  it('refuses to read a QuickTime brand out of one either, since the brand is a second signature', () => {
    const spoof = anSvgDocument({ prologue: `<!--ftypqt  ${'.'.repeat(1100)}-->` })

    expect(sniffMediaType(spoof)).toBe('unknown')
  })

  it('refuses to read one out of a padded comment followed by a stylesheet instruction', () => {
    const spoof = anSvgDocument({
      prologue: `<!--ftypmp42${'.'.repeat(1100)}--><?xml-stylesheet href="s.css" type="text/css"?>`,
    })

    expect(sniffMediaType(spoof)).toBe('unknown')
  })

  it('refuses to read one out of any four-byte markup prefix, not only a comment', () => {
    // The comment and the processing instruction are not the class - four
    // bytes of ANY legal markup are. `<br>` is four bytes too, so a document
    // opening `<br>ftypisom` lands the tag and the brand on the same offsets.
    // A fix that enumerated `<!--` and `<?` would pass every other case in
    // this block and fail this one.
    const spoof = anSvgDocument({ prologue: `<br>ftypisom${'.'.repeat(1100)}` })

    expect(sniffMediaType(spoof)).toBe('unknown')
  })

  it('names an SVG whose root element carries a namespace prefix', () => {
    // `<s:svg xmlns:s="…">` is a legal SVG root: the prefix is bound to the
    // SVG namespace by the attribute, and `<s:script>` inside it runs. The
    // Task 2 review served this document from a loopback origin and Chromium
    // reported `{"rootName":"s:svg","ns":"http://www.w3.org/2000/svg"}` with
    // the script executed. A test for the literal text `<svg` never sees it.
    expect(sniffMediaType(anSvgDocument({ namespacePrefix: 's' }))).toBe('image/svg+xml')
  })

  it('names an SVG whose namespace prefix is not ASCII, because XML names are not either', () => {
    // The Task 2 fix re-review served this exact document from a loopback
    // origin as `image/svg+xml` and Chromium reported
    // `root=é:svg ns=http://www.w3.org/2000/svg svgRects=1 scriptRan=true` -
    // a live stored-XSS attempt. It sniffed `'unknown'`, so it was refused as
    // `'type-not-allowed'`: still refused, under a name that says
    // "unrecognised file" for a document that renders and executes.
    // `ingestPolicy.ts`'s own header is the argument for why the name is not
    // interchangeable with the refusal.
    expect(sniffMediaType(anSvgDocument({ namespacePrefix: 'é' }))).toBe('image/svg+xml')
  })

  it('names one whose prefix is Greek, since the class is a character range and not a list', () => {
    expect(sniffMediaType(anSvgDocument({ namespacePrefix: 'ν' }))).toBe('image/svg+xml')
  })

  it('names one whose prefix is outside the basic multilingual plane', () => {
    // XML NameStartChar reaches U+EFFFF, so a prefix can be a surrogate pair.
    // A character class written without the `u` flag would match half of one.
    expect(sniffMediaType(anSvgDocument({ namespacePrefix: '𝔞' }))).toBe('image/svg+xml')
  })

  it('names one whose prefix carries a name character that cannot start a name', () => {
    // U+00B7 is an XML NameChar but not a NameStartChar, so a legal prefix can
    // hold it anywhere but first. Chromium reported `root=a·b:svg
    // ns=http://www.w3.org/2000/svg scriptRan=true` for this document, so the
    // class has to admit the continuation characters and not only the start.
    expect(sniffMediaType(anSvgDocument({ namespacePrefix: 'a·b' }))).toBe('image/svg+xml')
  })

  it('still names one whose prefix begins with a digit, which XML forbids and no parser accepts', () => {
    // `<1:svg xmlns:1="…">` is not well-formed: served as `image/svg+xml`,
    // Chromium answered a parse error at line 1 column 2 and ran nothing.
    // The class admits it anyway - it is the ASCII class's own behaviour,
    // kept rather than narrowed, because over-refusing a document no parser
    // will run costs nothing and being stricter than the parser we protect
    // buys nothing. This case is what makes that a decision instead of an
    // accident.
    expect(sniffMediaType(anSvgDocument({ namespacePrefix: '1' }))).toBe('image/svg+xml')
  })

  it('names a root element whose name merely begins with svg when the extra character is not ASCII', () => {
    // MEASURED, and the reason the trailing lookahead is NOT widened to the
    // XML name class: served as `image/svg+xml`, this document reported
    // `root=svgλ ns=http://www.w3.org/2000/svg parseError=false
    // scriptRan=true` in this repository's own Chromium. The ASCII lookahead
    // does not know U+03BB is a NameChar, so it answers `'image/svg+xml'` -
    // which is the accurate name for a document that executes. A tidier,
    // wider lookahead would answer `'unknown'` and name it worse.
    const lambda = new TextEncoder().encode('<svgλ xmlns="http://www.w3.org/2000/svg"><script>0</script></svgλ>')

    expect(sniffMediaType(lambda)).toBe('image/svg+xml')
  })

  it('answers unknown for an svg-prefixed root in the SVG namespace, which is a naming limit and not a bypass', () => {
    // THE COST OF THAT LOOKAHEAD, pinned rather than left implicit. Chromium
    // reported `root=svgsprite ns=http://www.w3.org/2000/svg scriptRan=true`
    // for this document in the same run: an SVG-namespace `<script>` executes
    // even under an element that is not `svg`. `'unknown'` is refused as
    // `'type-not-allowed'`, so nothing is stored either way - but the refusal
    // says "unrecognised" for a live one. It cannot be closed here: this
    // module reads element names and never the `xmlns` that decides whether
    // they are in the SVG namespace, and dropping the lookahead would name
    // the inert foreign-namespace sprite below an SVG instead. Closing it
    // properly needs a namespace-aware parse, not a sniff.
    const sprite = new TextEncoder().encode(
      '<svgsprite xmlns="http://www.w3.org/2000/svg"><script>0</script></svgsprite>',
    )

    expect(sniffMediaType(sprite)).toBe('unknown')
  })

  it('names an SVG whose processing instruction spoofs an ftyp box header, prefix and all', () => {
    // Fourteen bytes of prolog and no padding at all: `<?x ` is four bytes,
    // so `ftyp` sits at offset 4, and the prefixed root then defeated the
    // literal scan. Both halves of the old answer were wrong at once, which
    // is why this shape needed neither a long comment nor a big file.
    const spoof = anSvgDocument({ prologue: '<?x ftypisom?>', namespacePrefix: 's' })

    expect(sniffMediaType(spoof)).toBe('image/svg+xml')
  })

  it('names an SVG whose root element and prolog are spelled in capitals', () => {
    const shouty = new TextEncoder().encode('<?XML VERSION="1.0"?><SVG XMLNS="http://www.w3.org/2000/svg"/>')

    expect(sniffMediaType(shouty)).toBe('image/svg+xml')
  })

  it('answers unknown for markup whose root element sits past the scan bound', () => {
    // The scan is bounded because the uploader controls the length and a full
    // pass over a 50MiB upload is work an attacker chooses for us; the size
    // cap does not close that, since a file can be under the cap and still
    // large. So the bound stays, and what changes is the answer when it is
    // reached: this document IS markup, Chromium DOES render it as an SVG
    // (measured - the earlier claim that no renderer would was false), and
    // naming it `'unknown'` refuses it as `'type-not-allowed'`. What must
    // never happen is the fall-through to a byte signature, which is the case
    // above with `ftypisom` in the same comment.
    const padded = anSvgDocument({ prologue: `<!--${'.'.repeat(1200)}-->` })

    expect(sniffMediaType(padded)).toBe('unknown')
  })

  it('answers unknown when the leading whitespace alone runs past the scan bound', () => {
    // Nothing is left to read once the noise is stripped, and no signature
    // can be hiding behind it: offsets 0 and 4 are whitespace bytes, and no
    // signature this table holds is whitespace.
    const padded = anSvgDocument({ leadingWhitespace: ' '.repeat(1100) })

    expect(sniffMediaType(padded)).toBe('unknown')
  })

  it('answers unknown for a UTF-16 SVG, whose bytes carry no signature this table reads', () => {
    // Not detected as markup, and not smuggleable as a container EITHER -
    // but only because it is an SVG, which is the part the earlier wording
    // here lost. For `ftyp` to land at offset 4 this document's first two
    // characters would have to be U+7466 and U+7079 in UTF-16LE (or U+6674
    // and U+7970 big-endian), which no SVG prolog contains. A BOM's `ff fe`
    // is neither `ff d8 ff` nor PNG's `89`, so the answer is a refusal. The
    // case below is the same encoding WITHOUT the SVG, and it does reach a
    // container type.
    const codeUnits = Array.from('<svg xmlns="http://www.w3.org/2000/svg"/>').flatMap((character) => [
      character.charCodeAt(0),
      0x00,
    ])
    const utf16 = new Uint8Array([0xff, 0xfe, ...codeUnits])

    expect(sniffMediaType(utf16)).toBe('unknown')
  })

  it('answers video/mp4 for a UTF-16 document whose bytes put ftyp at offset four', () => {
    // THE FALSIFICATION of an invariant this module used to state: "a UTF-16
    // document is not detected as markup, and cannot be smuggled as a
    // container either". The proof it offered was SVG-scoped and correct; the
    // sentence was about any UTF-16 document and was not. These twelve bytes
    // are a UTF-16LE document with a BOM whose text is `<瑦灹is`, and the
    // signature table reads RAW OFFSETS with no idea of encodings, so `ftyp`
    // at offset 4 is `ftyp` at offset 4. `'video/mp4'` is a type `worker`
    // mode ACCEPTS.
    //
    // This is not a hole and the case is not a complaint: the document is not
    // an SVG, no browser renders it as one, and the answer means exactly what
    // this module says a `'video/mp4'` means - four bytes at offset 4 spell
    // `ftyp`. It is here so that the sentence in the header stays true, and
    // so that a future edit which narrowed the signature table by encoding
    // would have to change a case rather than a comment.
    const utf16Container = new Uint8Array([0xff, 0xfe, 0x3c, 0x00, 0x66, 0x74, 0x79, 0x70, 0x69, 0x00, 0x73, 0x00])

    expect(sniffMediaType(utf16Container)).toBe('video/mp4')
  })

  it('does not read an svg root out of an element whose name merely begins with svg', () => {
    const notSvg = new TextEncoder().encode('<svgsprite xmlns="http://example.test/sprite"/>')

    expect(sniffMediaType(notSvg)).toBe('unknown')
  })
})
