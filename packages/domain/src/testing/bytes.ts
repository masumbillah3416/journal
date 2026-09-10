/**
 * testing/bytes — fixture factories that build FILE BYTES rather than domain
 * objects.
 *
 * Factory pattern (CLAUDE.md §2.3): every fixture is a function returning a
 * fresh `Uint8Array`, never a shared mutable buffer, so a test that writes
 * into its own copy cannot corrupt another's.
 *
 * ═══ WHY THIS IS A SEPARATE MODULE FROM `testing/factories.ts` ═══
 *
 * These six are a different KIND of fixture from the domain-object factories
 * beside them, and the split is CLAUDE.md §3.2's ~300-line mark being
 * honoured rather than deferred a fourth time: `factories.ts` had grown to
 * 511 lines, of which these were 315. The seam is not arbitrary. A
 * domain-object factory's whole job is a shallow merge over defaults and its
 * correctness is obvious from reading it; a byte fixture's job is to be
 * INDISTINGUISHABLE FROM A REAL FILE, which is not obvious from reading it at
 * all — so each one below carries a paragraph saying how those bytes are
 * known to be what a real file holds, certified by a committed test where an
 * independent parser installed on this machine could settle it, and named as
 * a specification layout where none could.
 *
 * That paragraph is the point of this module: a fixture that encodes an
 * assumption about the bytes would make every case built on it agree with the
 * implementation rather than with a real upload, and this repository has
 * already shipped two blockers of exactly that shape.
 *
 * ═══ WHAT LIVES HERE AND WHAT DOES NOT ═══
 *
 * A fixture belongs here when it builds a header or a whole small FILE for
 * the upload boundary to read — `media/sniff.test.ts`, `media/exif.test.ts`,
 * `media/ingestPolicy.test.ts` and, in `apps/web`, the EXIF certification
 * test and the `MediaProcessor` contract suite all consume these.
 *
 * A fixture does NOT belong here once it needs an ENCODER. `anExifJpeg`
 * below carries no pixel data, because nothing that consumes it decodes the
 * image, and `packages/domain` must depend on no encoder at all — it is
 * pure, runs in Node with no native module, and is gated at 100%. The real,
 * `sharp`-encoded photographs live in
 * `apps/web/lib/adapters/contract/media-fixtures.ts`, on the other side of
 * that boundary.
 *
 * Depends on: nothing.
 */
/**
 * A JPEG's start-of-image marker followed by a JFIF APP0 segment header.
 *
 * HOW THESE BYTES ARE KNOWN TO BE A REAL FILE'S. `ff d8` is JPEG's SOI marker
 * and `ff e0` opens the JFIF APP0 segment a camera or an encoder writes next,
 * with `4a 46 49 46 00` spelling `JFIF\0` as its identifier. Measured against
 * this machine's own encoder for the part that matters: `sharp` 0.35.4 here
 * writes `ff d8 ff db` - SOI, then a quantisation table, NOT an APP0 segment.
 * Both are JPEGs, which is exactly why `sniffMediaType` keys on the three
 * bytes the two share (`ff d8 ff`) rather than on this fixture's fourth one;
 * a four-byte match would refuse every derivative this pipeline itself writes.
 * `sniff.test.ts` holds that second header as its own case.
 * @returns Eleven bytes: SOI, then a JFIF APP0 segment header.
 */
export const aJpegHeader = (): Uint8Array =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00])

/**
 * The eight-byte PNG signature.
 *
 * HOW THESE BYTES ARE KNOWN TO BE A REAL FILE'S. Read off two real PNGs on
 * this machine rather than transcribed from the specification: the seeded
 * `apps/web/media/bergen-b4-28.png` opens `89 50 4e 47 0d 0a 1a 0a`, and so
 * does a PNG `sharp` encodes here. The trailing `0d 0a 1a 0a` is the part
 * that earns the length - it is what a transfer that mangles line endings
 * destroys, which is the whole reason PNG's signature is eight bytes and not
 * four.
 * @returns The eight signature bytes, with no IHDR chunk after them.
 */
export const aPngHeader = (): Uint8Array => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * An ISO base media file's `ftyp` box, whose brand is what separates HEIC
 * from MP4 from QuickTime - all three share these first eight bytes.
 *
 * HOW THIS LAYOUT IS KNOWN TO BE A REAL FILE'S. Measured, not assumed: an
 * AVIF written by this machine's `sharp` opens
 * `00 00 00 1c 66 74 79 70 61 76 69 66 00 00 00 00 mif1avifmiaf` - a
 * four-byte big-endian box length, then `ftyp` at offset 4, then the major
 * brand (`avif`) at offset 8, then a four-byte minor version, then the
 * compatible brands. That is the offset this fixture writes its brand at and
 * the offset `sniffMediaType` reads one from. The four bytes at offset 12 are
 * the minor version, which nothing reads; the real file's are zeroes and this
 * fixture's are the ASCII `'0000'`, deliberately different so a reader cannot
 * mistake them for a brand.
 * @param overrides - `brand` defaults to `'isom'`, MP4's own.
 * @returns Sixteen bytes: a complete `ftyp` box header carrying that brand.
 */
export const anIsoBmffHeader = (overrides: { readonly brand?: string } = {}): Uint8Array => {
  const brand = overrides.brand ?? 'isom'
  const header = new Uint8Array(16)
  header.set([0x00, 0x00, 0x00, 0x10], 0)
  header.set(new TextEncoder().encode('ftyp'), 4)
  header.set(new TextEncoder().encode(brand.padEnd(4, ' ').slice(0, 4)), 8)
  header.set(new TextEncoder().encode('0000'), 12)
  return header
}

/**
 * The opening bytes of a real AVIF, copied verbatim from a file rather than
 * assembled from fields.
 *
 * HOW THESE BYTES ARE KNOWN TO BE A REAL FILE'S: they ARE one's. `sharp`
 * 0.35.4 on this machine was asked for an AVIF and wrote
 * `00 00 00 1c 66 74 79 70 61 76 69 66 00 00 00 00 6d 69 66 31 61 76 69 66
 * 6d 69 61 66` - a 0x1c-byte box, `ftyp`, the major brand `avif`, a zero
 * minor version, then the compatible brands `mif1 avif miaf`. It is a
 * separate fixture from {@link anIsoBmffHeader} on purpose: that one is a
 * layout with a brand poured into it, and the two cases this one carries are
 * about what happens to a file this repository's own encoder produces.
 * @returns The twenty-eight bytes above, fresh per call.
 */
export const anAvifHeader = (): Uint8Array =>
  new Uint8Array([
    0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00, 0x6d, 0x69, 0x66,
    0x31, 0x61, 0x76, 0x69, 0x66, 0x6d, 0x69, 0x61, 0x66,
  ])

/**
 * An SVG that is also an HTML document, which is the whole objection to it
 * (SECURITY.md: "One uploaded file becomes stored XSS with your own session
 * attached"). The script tag is the payload a rejection has to stop.
 *
 * HOW THIS IS KNOWN TO BE WHAT A REAL FILE LOOKS LIKE. An SVG has no magic
 * number at all - it is XML, so the only thing on disk that identifies one is
 * its root element, which is why this fixture is text rather than a byte
 * array. The `xmlns` attribute is what every real SVG carries and what makes
 * a browser treat the document as SVG rather than as unknown markup, and the
 * `<script>` element inside it is legal SVG content that browsers execute -
 * so this fixture is not a caricature of a hostile file, it is the shortest
 * complete one.
 * WHY IT TAKES A PROLOGUE AND A PREFIX. Both are what the Task 2 review used
 * to defeat the first version of the sniff, and both were measured to render
 * and execute in this repository's own Chromium rather than reasoned about: a
 * `prologue` of `<!--ftypisom` + padding puts an ISO base media file's box
 * tag at its own offset and pushes the root element out of a bounded window,
 * and a `namespacePrefix` of `s` spells that root `<s:svg xmlns:s="…">`,
 * which is legal XML in the SVG namespace and carries no literal `<svg`.
 * They live here rather than in the two test files that need them so the
 * evidence for them is written once.
 * @param overrides - `leadingWhitespace` defaults to `''`; a real uploader can
 *   send a BOM or newlines before the root element. `prologue` defaults to
 *   `''` and goes between that whitespace and the root element - a comment,
 *   an XML declaration or a processing instruction. `namespacePrefix`
 *   defaults to `''`, meaning the default namespace; anything else qualifies
 *   the `svg` and `script` elements with it and binds it with `xmlns:<it>`.
 * @returns The document's UTF-8 bytes.
 * @example
 * anSvgDocument({ prologue: `<!--ftypisom${'.'.repeat(1100)}-->` })
 * anSvgDocument({ namespacePrefix: 's' }) // <s:svg xmlns:s="…"><s:script>…
 */
export const anSvgDocument = (
  overrides: {
    readonly leadingWhitespace?: string
    readonly prologue?: string
    readonly namespacePrefix?: string
  } = {},
): Uint8Array => {
  const prefix = overrides.namespacePrefix ?? ''
  const qualified = (element: string): string => (prefix === '' ? element : `${prefix}:${element}`)
  const namespaceAttribute = prefix === '' ? 'xmlns' : `xmlns:${prefix}`

  return new TextEncoder().encode(
    `${overrides.leadingWhitespace ?? ''}${overrides.prologue ?? ''}` +
      `<${qualified('svg')} ${namespaceAttribute}="http://www.w3.org/2000/svg">` +
      `<${qualified('script')}>fetch("/admin/sign-out",{method:"POST"})</${qualified('script')}>` +
      `</${qualified('svg')}>`,
  )
}

/**
 * The ASCII string the EXIF fixture hides in Copyright, so an absence
 * assertion can look for something specific rather than for a marker.
 *
 * Declared here and imported everywhere else. It was written twice during
 * planning, and two copies drift apart silently while every absence
 * assertion built on either one still passes.
 */
export const EXIF_CANARY = 'TRAVEL-DIARY-EXIF-CANARY'

/** EXIF's own capture-time form, `YYYY:MM:DD HH:MM:SS`, colons and all. */
const DEFAULT_CAPTURED_AT = '2025:03:14 09:26:53'

/**
 * TIFF/EXIF tag numbers and field types, spelled out here rather than
 * imported from `media/exif.ts`. THE DUPLICATION IS THE POINT: a fixture
 * that took its tag numbers from the reader under test would agree with a
 * typo in the reader, and every case built on it would pass while a real
 * camera's file read as nothing.
 */
const TAG_ORIENTATION = 0x0112
const TAG_COPYRIGHT = 0x8298
const TAG_EXIF_SUB_IFD = 0x8769
const TAG_DATE_TIME_ORIGINAL = 0x9003
const TYPE_ASCII = 2
const TYPE_SHORT = 3
const TYPE_LONG = 4

/**
 * Offsets inside {@link anExifJpeg}'s TIFF block, all relative to the block's
 * own first byte, which is what every offset stored inside a TIFF block is
 * relative to. An IFD is a two-byte entry count, then twelve bytes per
 * entry, then a four-byte pointer to the next IFD; the fixed offsets below
 * are that arithmetic carried out once.
 */
const TIFF_HEADER_BYTES = 8
const IFD_ENTRY_BYTES = 12
const IFD0_AT = TIFF_HEADER_BYTES
const ORIENTATION_ENTRY_AT = IFD0_AT + 2
const COPYRIGHT_ENTRY_AT = ORIENTATION_ENTRY_AT + IFD_ENTRY_BYTES
const SUB_IFD_ENTRY_AT = COPYRIGHT_ENTRY_AT + IFD_ENTRY_BYTES
const IFD0_NEXT_POINTER_AT = SUB_IFD_ENTRY_AT + IFD_ENTRY_BYTES
const COPYRIGHT_VALUE_AT = IFD0_NEXT_POINTER_AT + 4
/** Where an entry's four-byte value-or-offset field sits, within the entry. */
const ENTRY_VALUE_FIELD_AT = 8

/**
 * A JPEG carrying exactly the EXIF this repository reads and strips.
 *
 * NOT A PHOTOGRAPH: it has no pixel data, because nothing that consumes this
 * fixture decodes the image. Task 6 lands the real, `sharp`-encoded fixtures,
 * in `apps/web/lib/adapters/contract/media-fixtures.ts`, for the pipeline
 * that re-encodes; this one exists so the READER can be tested without one.
 *
 * HOW THIS LAYOUT IS KNOWN TO CARRY REAL EXIF, and not merely to satisfy
 * this repository's own reader. It is a committed test, not a measurement:
 * `apps/web/lib/media/exifFixtureCertification.test.ts`, which lives over
 * there because the independent parser is `sharp` 0.35.4 / libvips / exiv2
 * and this package must depend on no encoder. It splices the APP1 segment
 * below in behind the SOI of an 8x8 JPEG `sharp` just encoded, and then:
 *
 *   - **ORIENTATION IS CERTIFIED IN BOTH DIRECTIONS.** libvips reports
 *     `orientation: 6` for a fixture built `{ orientation: 6 }` and 8 for a
 *     LITTLE-endian one built `{ orientation: 8 }`; and `readExifFacts` reads
 *     6 back out of a JPEG `sharp` itself wrote, whose TIFF block is
 *     little-endian (`II`) - the opposite of this fixture's default.
 *   - **THE CANARY AND THE CAPTURE TIME ARE CERTIFIED IN ONE DIRECTION**, by
 *     re-serialisation rather than by a byte search. `keepExif()` makes exiv2
 *     re-emit every tag it managed to PARSE, in a layout of its own choosing
 *     - different entry counts, different value offsets - and both values are
 *     still there afterwards, the capture time read back by `readExifFacts`
 *     at an offset it did not write. A byte search over `metadata().exif`
 *     would have been weaker than it looks: that buffer comes back at its
 *     full length even when this block's byte-order mark and magic number are
 *     corrupted, so it certifies that libvips found the segment, not that it
 *     parsed a directory.
 *
 * THE CAPTURE TIME IS CERTIFIED THE OTHER WAY ROUND TOO, AND IT TOOK THE
 * RIGHT DIRECTORY NUMBER RATHER THAN A DIFFERENT ENCODER. `DateTimeOriginal`
 * (0x9003) belongs in the Exif sub-IFD that IFD0 reaches through 0x8769,
 * which is where `media/exif.ts` looks. `sharp`'s public `withExif` takes a
 * map keyed by numbered TIFF directory and writes each tag into the
 * directory NAMED, and the one to name is IFD2 - libvips' own `ExifIfd`
 * ordinal for that sub-IFD. Naming IFD0 puts 0x9003 in IFD0 instead:
 * hand-decoding the block it emits shows IFD0's seven entries ending
 * `69 87 04 00` (the sub-IFD pointer) and `03 90 02 00` (the tag itself),
 * and the sub-IFD they point at holding 0x9000, 0x9101 and 0xa000-0xa003 -
 * and a key named `Exif` is accepted and written nowhere. TWO earlier
 * versions of this paragraph were wrong in opposite directions: the first
 * claimed the round trip succeeded when the fixture named IFD0, and the
 * second called the failure `sharp`'s limit. It is neither - the round trip
 * succeeds through IFD2, measured by
 * `apps/web/lib/adapters/contract/media-fixtures.integration.test.ts`, and
 * `apps/web/lib/media/exifFixtureCertification.test.ts` pins what naming
 * IFD0 costs. `exiftool` would settle the layout against a third-party tool
 * and is not installed here.
 *
 * THE LAYOUT, offset by offset. Absolute offsets in the returned array first:
 * `ff d8` SOI, `ff e1` APP1, a two-byte big-endian segment length that counts
 * itself, then the six bytes `Exif\0\0`, then the TIFF block at offset 12,
 * then `ff d9` EOI. Inside the TIFF block, at offsets relative to its own
 * first byte:
 *
 * ```
 *   0  byte-order mark, `MM` (big-endian) or `II` (little-endian)
 *   2  42, the number that says "this is a TIFF block"
 *   4  offset of IFD0, always 8 here
 *   8  IFD0's entry count, 3
 *  10  Orientation      (0x0112, SHORT, 1)  value inline at offset 18
 *  22  Copyright        (0x8298, ASCII, n)  offset to the canary, at 50
 *  34  Exif sub-IFD     (0x8769, LONG,  1)  offset to the sub-IFD
 *  46  offset of the next IFD, 0 - there is none
 *  50  the canary, NUL-terminated
 *      the sub-IFD: entry count 1, then
 *        DateTimeOriginal (0x9003, ASCII, 20) offset to the value
 *      the next-IFD pointer, 0, then the capture time, NUL-terminated
 * ```
 *
 * Entries appear in ascending tag order, which TIFF requires of an IFD.
 * @param overrides - `capturedAt` is EXIF's own `YYYY:MM:DD HH:MM:SS` form.
 *   `byteOrder` defaults to `'big-endian'`; both exist in real files, and a
 *   reader that handled only one would miss most cameras, so a fixture that
 *   could only build one would leave that half of the reader unproven.
 * @returns The file's bytes, fresh per call.
 * @example
 * anExifJpeg({ orientation: 6 }) // a photograph shot on its side
 */
export const anExifJpeg = (
  overrides: {
    readonly capturedAt?: string
    readonly orientation?: number
    readonly canary?: string
    readonly byteOrder?: 'big-endian' | 'little-endian'
  } = {},
): Uint8Array => {
  const encoder = new TextEncoder()
  const canary = encoder.encode(`${overrides.canary ?? EXIF_CANARY}\u0000`)
  const capturedAt = encoder.encode(`${overrides.capturedAt ?? DEFAULT_CAPTURED_AT}\u0000`)
  const littleEndian = overrides.byteOrder === 'little-endian'

  const subIfdAt = COPYRIGHT_VALUE_AT + canary.length
  const capturedAtValueAt = subIfdAt + 2 + IFD_ENTRY_BYTES + 4
  const tiff = new Uint8Array(capturedAtValueAt + capturedAt.length)
  const field = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength)
  const writeEntry = (entry: {
    readonly at: number
    readonly tag: number
    readonly type: number
    readonly count: number
  }): void => {
    field.setUint16(entry.at, entry.tag, littleEndian)
    field.setUint16(entry.at + 2, entry.type, littleEndian)
    field.setUint32(entry.at + 4, entry.count, littleEndian)
  }

  tiff.set(encoder.encode(littleEndian ? 'II' : 'MM'), 0)
  field.setUint16(2, 42, littleEndian)
  field.setUint32(4, IFD0_AT, littleEndian)

  field.setUint16(IFD0_AT, 3, littleEndian)
  writeEntry({ at: ORIENTATION_ENTRY_AT, tag: TAG_ORIENTATION, type: TYPE_SHORT, count: 1 })
  // A SHORT with a count of one is stored in the first two bytes of the
  // entry's own value field, not at an offset - the field is four bytes wide
  // and the value fits.
  field.setUint16(ORIENTATION_ENTRY_AT + ENTRY_VALUE_FIELD_AT, overrides.orientation ?? 1, littleEndian)
  writeEntry({ at: COPYRIGHT_ENTRY_AT, tag: TAG_COPYRIGHT, type: TYPE_ASCII, count: canary.length })
  field.setUint32(COPYRIGHT_ENTRY_AT + ENTRY_VALUE_FIELD_AT, COPYRIGHT_VALUE_AT, littleEndian)
  writeEntry({ at: SUB_IFD_ENTRY_AT, tag: TAG_EXIF_SUB_IFD, type: TYPE_LONG, count: 1 })
  field.setUint32(SUB_IFD_ENTRY_AT + ENTRY_VALUE_FIELD_AT, subIfdAt, littleEndian)
  field.setUint32(IFD0_NEXT_POINTER_AT, 0, littleEndian)
  tiff.set(canary, COPYRIGHT_VALUE_AT)

  field.setUint16(subIfdAt, 1, littleEndian)
  writeEntry({ at: subIfdAt + 2, tag: TAG_DATE_TIME_ORIGINAL, type: TYPE_ASCII, count: capturedAt.length })
  field.setUint32(subIfdAt + 2 + ENTRY_VALUE_FIELD_AT, capturedAtValueAt, littleEndian)
  field.setUint32(subIfdAt + 2 + IFD_ENTRY_BYTES, 0, littleEndian)
  tiff.set(capturedAt, capturedAtValueAt)

  const identifier = encoder.encode('Exif\u0000\u0000')
  // The segment's length field counts itself but not the two marker bytes.
  const segmentLength = 2 + identifier.length + tiff.length
  const jpeg = new Uint8Array(4 + segmentLength + 2)
  jpeg.set([0xff, 0xd8, 0xff, 0xe1], 0)
  new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength).setUint16(4, segmentLength)
  jpeg.set(identifier, 6)
  jpeg.set(tiff, 6 + identifier.length)
  jpeg.set([0xff, 0xd9], jpeg.length - 2)
  return jpeg
}
