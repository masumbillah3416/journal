/**
 * testing/factories — fixture factories for domain types.
 *
 * Factory pattern (CLAUDE.md §2.3): every fixture is a function that returns
 * a fresh object, never a shared mutable constant, so two tests that each
 * call `aJourney()` and then mutate their own copy can never see each
 * other's changes. `Partial<Journey>` overrides merge shallowly over
 * sensible defaults, so a test's `aJourney({ slug: 'tokyo' })` names only the
 * field it cares about. Depends on: Journey, from ../bookBundle.js.
 */
import type { Journey } from '../bookBundle.js'
import type { JourneyId } from '../ids.js'

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
  hiddenFromBookmarks: false,
  furniture: { accent: '#3d817e' },
  ...overrides,
})
