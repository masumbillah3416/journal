/**
 * testing/factories — fixture factories for domain types.
 *
 * Factory pattern (CLAUDE.md §2.3): every fixture is a function that returns
 * a fresh object, never a shared mutable constant, so two tests that each
 * call `aJourney()` and then mutate their own copy can never see each
 * other's changes. `Partial<Journey>` overrides merge shallowly over
 * sensible defaults, so a test's `aJourney({ slug: 'tokyo' })` names only the
 * field it cares about. Depends on: Journey and BookChrome, from ../bookBundle.
 */
import type { BookChrome, Journey } from '../bookBundle'
import type { JourneyId } from '../ids'

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
