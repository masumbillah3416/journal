import { describe, expect, it } from 'vitest'
import { aJourney } from './factories.js'

describe('aJourney', () => {
  it('builds a journey with sensible defaults when called with no overrides', () => {
    const journey = aJourney()

    expect(journey).toMatchObject({ slug: 'tokyo', name: 'Tokyo', hiddenFromBookmarks: false })
  })

  it('merges overrides shallowly over the defaults', () => {
    const journey = aJourney({ slug: 'lisbon', hiddenFromBookmarks: true })

    expect(journey).toMatchObject({ slug: 'lisbon', hiddenFromBookmarks: true, name: 'Tokyo' })
  })

  it('gives every call its own furniture object, never a shared reference', () => {
    // CLAUDE.md §2.3: fixtures are factories with overridable defaults, never
    // shared mutable objects. A factory that hoisted its nested defaults to a
    // module-level constant would fail this - two journeys would alias the
    // same `furniture` object, and mutating one's accent would silently mutate
    // the other's too.
    const first = aJourney()
    const second = aJourney()

    expect(first).not.toBe(second)
    expect(first.furniture).not.toBe(second.furniture)
    expect(first.furniture).toEqual(second.furniture)
  })
})
