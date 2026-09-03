/**
 * testing/factories — fixture factories for domain types.
 *
 * Factory pattern (CLAUDE.md §2.3): every fixture is a function that returns
 * a fresh object, never a shared mutable constant, so two tests that each
 * call `aJourney()` and then mutate their own copy can never see each
 * other's changes. `Partial<Journey>` overrides merge shallowly over
 * sensible defaults, so a test's `aJourney({ slug: 'tokyo' })` names only the
 * field it cares about. Depends on: Journey and BookChrome, from ../bookBundle;
 * GalleryBundle and GalleryFrame, from ../gallery.
 */
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
