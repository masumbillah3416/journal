/**
 * testing/factories — fixture factories for domain types.
 *
 * Factory pattern (CLAUDE.md §2.3): every fixture is a function that returns
 * a fresh object, never a shared mutable constant, so two tests that each
 * call `aJourney()` and then mutate their own copy can never see each
 * other's changes. `Partial<Journey>` overrides merge shallowly over
 * sensible defaults, so a test's `aJourney({ slug: 'tokyo' })` names only the
 * field it cares about. Depends on: Journey and BookChrome, from ../bookBundle;
 * GalleryBundle and GalleryFrame, from ../gallery; ChallengeRecord, from
 * ../auth/otpChallenge.
 *
 * THE SIX BYTE-LEVEL FIXTURES AT THE END OF THIS FILE ARE A DIFFERENT KIND
 * OF FIXTURE, and they are here rather than beside `media/sniff.test.ts`
 * because several test files use them (`sniff.test.ts`, `exif.test.ts` and,
 * through the decision the first of them feeds, the upload probes that come
 * after it). The last of them, `anExifJpeg`, builds a whole small FILE rather
 * than a header, because the metadata a reader has to find lives in a segment
 * and not in a signature. They build BYTES rather than a domain object, so
 * each one carries a paragraph saying how those bytes are known to be what a
 * real file holds - measured on this machine where a local encoder or an
 * independent parser could settle it, and named as a specification layout
 * where neither could. That paragraph is the point of them: a fixture that
 * encodes an assumption about the bytes would make every case built on it
 * agree with the implementation rather than with a real upload,
 * and this repository has already shipped two blockers of exactly that shape.
 */
import type { ChallengeRecord } from '../auth/otpChallenge'
import type { AboutContent, BookChrome, Journey, Slot } from '../bookBundle'
import type { GalleryBundle, GalleryFrame } from '../gallery'
import type { JourneyId, MediaId } from '../ids'

// Test-only default id. The literal below is a fixed, non-empty string, so
// routing it through the fallible `journeyId()` constructor would only add a
// branch (the empty-string rejection) that can never fire here - the direct
// cast is safe by construction and keeps this file's coverage meaningful.
const DEFAULT_JOURNEY_ID = 'journey-id' as JourneyId

/**
 * Builds a {@link Journey} for tests, with sensible defaults overridable per field.
 * @param overrides - Fields to override on the default journey. Merged shallowly
 * over the defaults, so an override does not need to repeat sibling fields it does
 * not care about.
 * @returns A fresh journey object. No field, including nested ones like
 * `furniture`, is shared with any other call's result.
 */
export const aJourney = (overrides: Partial<Journey> = {}): Journey => ({
  id: DEFAULT_JOURNEY_ID,
  slug: 'tokyo',
  name: 'Tokyo',
  place: 'Japan',
  dates: '3–9 Mar 2025',
  startsOn: '2025-03-03T00:00:00.000Z',
  hiddenFromBookmarks: false,
  weather: 'CLEAR 14C',
  mood: 'WIDE EYED',
  weatherGlyph: 'sun',
  highlights: ['First train at 05:40 — an empty carriage and a pink sky'],
  note: 'Tokyo is loud in a way that never quite becomes noise.',
  tally: [{ key: 'Days', value: '12' }],
  gallery: { photographs: 47, clips: 7 },
  furniture: {
    accent: '#3d817e',
    signoff: 'twelve days, one corner of it',
    stampCountry: 'NIPPON',
    stampValue: '120',
  },
  ...overrides,
})

/**
 * Builds a {@link BookChrome} for tests, with the seeded book's own values as
 * defaults so a fixture reads like the real book rather than like a stub.
 * @param overrides - Fields to override. Merged shallowly over the defaults.
 * @returns A fresh chrome object, shared with no other call's result.
 */
export const aBookChrome = (overrides: Partial<BookChrome> = {}): BookChrome => ({
  title: 'Wanderings',
  subtitle: 'field notes, photographs and other scraps',
  owner: 'M. Alvarez',
  coverCloth: '#2f4a47',
  yearsShown: '2025 — 2026',
  contentsNote: 'Each journey runs three pages — notes, then two spreads of frames. The rest lives in the galleries.',
  showDecorations: true,
  ...overrides,
})

/**
 * Builds the About page's portrait slot for tests.
 *
 * Its `role` is `'hero'` because that is what the portrait is on that page -
 * the one photograph with a subject - and the role is what chooses the
 * derivative tier `readBookBundle` resolves it at.
 * @param overrides - Fields to override. Merged shallowly over the defaults.
 * @returns A fresh portrait slot, shared with no other call's result.
 */
export const aPortrait = (overrides: Partial<Slot> = {}): Slot => ({
  role: 'hero',
  src: '/api/media/file/portrait-400x400.png',
  alt: 'PORTRAIT',
  caption: 'Somewhere with bad coffee and a good window',
  focalX: 50,
  focalY: 50,
  ...overrides,
})

/**
 * Builds an {@link AboutContent} for tests, with the seeded `about` global's
 * own values as defaults so a fixture reads like the real page rather than
 * like a stub.
 * @param overrides - Fields to override. Merged shallowly over the defaults.
 * @returns A fresh About content object, shared with no other call's result.
 */
export const anAboutContent = (overrides: Partial<AboutContent> = {}): AboutContent => ({
  portrait: aPortrait(),
  paragraphs: [
    'This is a paper habit that ended up on a screen.',
    'Nothing here is a recommendation. If a page looks crooked, that is the tape.',
  ],
  kit: ['35mm rangefinder, one lens', 'Pocket notebook, blue ink', 'Roll of washi tape, always'],
  replyTo: 'hello@wanderings.travel',
  ...overrides,
})

/**
 * Builds a {@link GalleryFrame} for tests.
 *
 * `id` is the ONLY parameter that is not an override, because it is the
 * fixture's identity: every case that matters in the gallery is about which
 * frame is open, and naming that frame at the call site is what makes those
 * cases readable (`aGalleryFrame('market')` rather than an anonymous frame
 * whose id has to be looked up).
 * @param id - The media id this frame is addressed by, e.g. `'market'`.
 * @param overrides - Fields to override on the default frame.
 * @returns A fresh frame, shared with no other call's result.
 */
export const aGalleryFrame = (id: string, overrides: Partial<GalleryFrame> = {}): GalleryFrame => ({
  // As DEFAULT_JOURNEY_ID above: a non-empty literal cannot fail the
  // fallible constructor, so the direct cast adds no unreachable branch.
  id: id as MediaId,
  tileSrc: `/api/media/file/tokyo-${id}-400x400.png`,
  tileSrcSet: `/api/media/file/tokyo-${id}-400x400.png 400w, /api/media/file/tokyo-${id}-800x800.png 800w`,
  fullSrc: `/api/media/file/tokyo-${id}-2000x1500.png`,
  downloadHref: `/gallery/tokyo/download/${id}`,
  alt: `Tokyo, ${id}`,
  caption: `A ${id} in the rain`,
  kind: 'still',
  durationSec: undefined,
  focalX: 50,
  focalY: 50,
  downloadable: true,
  ...overrides,
})

/**
 * Builds a {@link GalleryBundle} for tests, with the seeded Tokyo journey's
 * own header values as defaults so a fixture reads like the real gallery.
 * @param overrides - Fields to override. Merged shallowly over the defaults.
 * @returns A fresh bundle, shared with no other call's result.
 */
export const aGalleryBundle = (overrides: Partial<GalleryBundle> = {}): GalleryBundle => ({
  journey: {
    id: DEFAULT_JOURNEY_ID,
    slug: 'tokyo',
    name: 'Tokyo',
    place: 'Japan',
    dates: '4 - 13 Apr 2024',
  },
  frames: [aGalleryFrame('doorway'), aGalleryFrame('market'), aGalleryFrame('ferry')],
  thumbSize: 200,
  ...overrides,
})

/**
 * Builds a gallery of `count` frames, numbered so each one is distinguishable
 * in an assertion - the shape SCREENS.md §1.8's "Verified with 61 tiles" case
 * needs.
 * @param count - How many frames the gallery holds.
 * @returns That many frames, in order.
 */
export const galleryFrames = (count: number): readonly GalleryFrame[] =>
  Array.from({ length: count }, (_unused, index) => aGalleryFrame(`frame-${String(index + 1)}`))

/**
 * Builds a {@link ChallengeRecord} for tests, with defaults for a challenge
 * freshly issued at `createdAt: 0`, with no attempts spent and not consumed.
 * @param overrides - Fields to override. Merged shallowly over the defaults.
 * @returns A fresh challenge record, shared with no other call's result.
 */
export const aChallenge = (overrides: Partial<ChallengeRecord> = {}): ChallengeRecord => ({
  createdAt: 0,
  attempts: 0,
  consumedAt: null,
  ...overrides,
})

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
 * fixture decodes the image. `apps/web/lib/adapters/contract/media-fixtures.ts`
 * has the real, `sharp`-encoded one, and Task 6 Step 4 is what proves this
 * hand-built layout agrees with a real encoder rather than with its own reader.
 *
 * HOW THIS LAYOUT IS KNOWN TO CARRY REAL EXIF, and not merely to satisfy
 * this repository's own reader. Measured on this machine, with the one
 * independent EXIF parser installed here: the APP1 segment below was spliced
 * in behind the SOI of an 8x8 JPEG that `sharp` 0.35.4 had just encoded, and
 * `sharp(spliced).metadata()` came back `format: 'jpeg'`, `orientation: 6`
 * for a fixture built with `{ orientation: 6 }`, and an `exif` block of 119
 * bytes - the six identifier bytes plus this block's 113 - containing both
 * the canary and the literal `2025:03:14 09:26:53`. So libvips/exiv2, which
 * shares no code with `media/exif.ts`, reads these bytes as EXIF. The
 * converse was measured too: `readExifFacts` was run against JPEGs `sharp`
 * itself wrote, whose TIFF blocks are LITTLE-endian (`II`), and agreed with
 * `sharp` on the orientation of all three - 1 where `withExif`'s 6 is
 * overridden by libvips, 6 and 8 where `withMetadata` sets them - and read
 * `withExif`'s `DateTimeOriginal` back as `2025-03-14T09:26:53`. Neither
 * measurement is a committed test, because this package must not depend on
 * an encoder; Task 6 Step 4 is where the same comparison lands as one, in
 * the workspace that already has `sharp`.
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
