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
 * THE FOUR BYTE-LEVEL FIXTURES AT THE END OF THIS FILE ARE A DIFFERENT KIND
 * OF FIXTURE, and they are here rather than beside `media/sniff.test.ts`
 * because two test files use them (`sniff.test.ts` and, through the decision
 * it feeds, the upload probes that come after it). They build the FIRST BYTES
 * OF A FILE rather than a domain object, so each one carries a paragraph
 * saying how those bytes are known to be what a real file holds - measured on
 * this machine where a local encoder could produce one, and named as a
 * specification layout where none could. That paragraph is the point of them:
 * a fixture that encodes an assumption about the bytes would make every case
 * built on it agree with the implementation rather than with a real upload,
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
 * @param overrides - `leadingWhitespace` defaults to `''`; a real uploader can
 *   send a BOM or newlines before the root element.
 * @returns The document's UTF-8 bytes.
 */
export const anSvgDocument = (overrides: { readonly leadingWhitespace?: string } = {}): Uint8Array =>
  new TextEncoder().encode(
    `${overrides.leadingWhitespace ?? ''}<svg xmlns="http://www.w3.org/2000/svg">` +
      `<script>fetch("/admin/sign-out",{method:"POST"})</script></svg>`,
  )
