import { describe, expect, it } from 'vitest'
import { aBookChrome, aGalleryBundle, aGalleryFrame, anAboutContent, aPortrait, aJourney, galleryFrames } from './factories'

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

describe('aGalleryFrame', () => {
  it('names the frame by the id the call site gave it', () => {
    expect(aGalleryFrame('market').id).toBe('market')
  })

  it('builds a still by default, since no clip can exist yet', () => {
    const frame = aGalleryFrame('market')

    expect(frame.kind).toBe('still')
    expect(frame.durationSec).toBeUndefined()
  })

  it('merges overrides shallowly over the defaults', () => {
    const frame = aGalleryFrame('reel', { kind: 'clip', durationSec: 18 })

    expect(frame).toMatchObject({ id: 'reel', kind: 'clip', durationSec: 18, downloadable: true })
  })
})

describe('aGalleryBundle', () => {
  it('builds the seeded journey’s own header values by default', () => {
    expect(aGalleryBundle().journey).toMatchObject({ slug: 'tokyo', name: 'Tokyo', place: 'Japan' })
  })

  it('merges overrides shallowly over the defaults', () => {
    const bundle = aGalleryBundle({ thumbSize: 300, frames: [] })

    expect(bundle.thumbSize).toBe(300)
    expect(bundle.frames).toEqual([])
    expect(bundle.journey.name).toBe('Tokyo')
  })

  it('gives every call its own journey object, never a shared reference', () => {
    const first = aGalleryBundle()
    const second = aGalleryBundle()

    expect(first.journey).not.toBe(second.journey)
    expect(first.journey).toEqual(second.journey)
  })
})

describe('galleryFrames', () => {
  it('builds as many frames as the case asks for', () => {
    expect(galleryFrames(61)).toHaveLength(61)
  })

  it('gives every frame an id of its own, so an assertion can tell them apart', () => {
    const ids = galleryFrames(61).map((frame) => frame.id)

    expect(new Set(ids).size).toBe(61)
  })
})
