import { describe, expect, it } from 'vitest'
import { aBookChrome, anAboutContent, aPortrait, aJourney } from './factories'

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

describe('aBookChrome', () => {
  it('builds the seeded book’s own chrome when called with no overrides', () => {
    const chrome = aBookChrome()

    expect(chrome).toMatchObject({ title: 'Wanderings', owner: 'M. Alvarez', showDecorations: true })
  })

  it('merges overrides shallowly over the defaults', () => {
    const chrome = aBookChrome({ title: '', showDecorations: false })

    expect(chrome).toMatchObject({ title: '', showDecorations: false, owner: 'M. Alvarez' })
  })
})

describe('aPortrait', () => {
  it('builds the About page’s portrait as a hero-role slot at the centre', () => {
    const portrait = aPortrait()

    expect(portrait).toMatchObject({ role: 'hero', focalX: 50, focalY: 50 })
  })

  it('merges overrides shallowly over the defaults', () => {
    const portrait = aPortrait({ focalX: 34, focalY: 22 })

    expect(portrait).toMatchObject({ focalX: 34, focalY: 22, role: 'hero' })
  })
})

describe('anAboutContent', () => {
  it('builds the seeded about global’s own content when called with no overrides', () => {
    const about = anAboutContent()

    expect(about).toMatchObject({ replyTo: 'hello@wanderings.travel' })
    expect(about.paragraphs).toHaveLength(2)
    expect(about.kit).toHaveLength(3)
  })

  it('merges overrides shallowly over the defaults', () => {
    const about = anAboutContent({ portrait: undefined, kit: [] })

    expect(about.portrait).toBeUndefined()
    expect(about.kit).toEqual([])
    expect(about.replyTo).toBe('hello@wanderings.travel')
  })

  it('gives every call its own portrait object, never a shared reference', () => {
    const first = anAboutContent()
    const second = anAboutContent()

    expect(first.portrait).not.toBe(second.portrait)
    expect(first.portrait).toEqual(second.portrait)
  })
})
