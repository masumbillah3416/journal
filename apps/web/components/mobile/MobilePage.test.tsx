/**
 * MobilePage.test.tsx — what each of the four mobile page kinds prints.
 *
 * The book's `PageFace.test.tsx` asserts a dispatch to six designed pages;
 * this asserts a dispatch to FOUR, which is SCREENS.md §1.10's own structure -
 * a journey's Notes, Frames I and Frames II are one page kind here, differing
 * only in their photographs and in whether the notes block is drawn. All six
 * `BookPage` kinds are exercised, because the `switch` is what stands between
 * a new page kind and a blank screen.
 *
 * IT ALSO ASSERTS THE THINGS THAT MAKE THIS SURFACE WORK WITHOUT SCRIPT: that
 * "Start reading", every Contents row and the gallery button are real `<a>`
 * elements pointing at real paths, and that every kind renders exactly one
 * `<h1>` - including the Cover of a book whose title an editor has cleared,
 * which is the one case that would otherwise leave a mobile document with no
 * level-one heading at all (axe's `page-has-heading-one`).
 *
 * The focal point is asserted rather than assumed, for the reason SCREENS.md
 * gives about the admin's picker: if it does not reach `object-position`, the
 * picker is decorative.
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import {
  deriveContents,
  derivePages,
  type BookPage,
  type ContentsEntry,
  type JourneyPage,
  type Slot,
} from '@travel-diary/domain/bookBundle'
import { journeyId, type JourneyId } from '@travel-diary/domain/ids'
import { aBookChrome, anAboutContent, aJourney, aPortrait } from '@travel-diary/domain/testing/factories'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { MobilePage } from './MobilePage'

/** Brands a test journey id, so two fixtures in one book are never the same journey (CLAUDE.md §7). */
const anId = (raw: string): JourneyId => {
  const branded = journeyId(raw)
  if (!branded.ok) throw new Error(branded.error)
  return branded.value
}

const hero: Slot = {
  role: 'hero',
  src: '/media/tokyo-hero.jpg',
  alt: 'A wet crossing at night',
  caption: 'Shibuya, in the rain',
  focalX: 30,
  focalY: 70,
}
const ephemera: Slot = { ...hero, role: 'ephemera', src: '/media/tokyo-scrap.jpg', caption: 'a ticket stub' }
const frameOne: Slot = { ...hero, role: 'frame', src: '/media/tokyo-a.jpg', caption: 'Bright signs' }
const frameTwo: Slot = { ...hero, role: 'frame', src: '/media/tokyo-b.jpg', caption: '' }

const journeys = [
  aJourney({
    id: anId('tokyo'),
    slug: 'tokyo',
    name: 'Tokyo',
    place: 'Japan',
    dates: '12 – 24 March 2025',
    weather: 'CLEAR 14C',
    mood: 'WIDE EYED',
    weatherGlyph: 'haze',
    highlights: ['a shrine at dawn', 'nineteen tarts'],
    note: 'The notes are written the same evening.',
    tally: [
      { key: 'trains', value: '31' },
      { key: 'tarts', value: 'nineteen' },
    ],
    gallery: { photographs: 24, clips: 3 },
  }),
  aJourney({ id: anId('lisbon'), slug: 'lisbon', name: 'Lisbon', place: 'Portugal' }),
]
const pages = derivePages(journeys)
const contents: readonly ContentsEntry[] = deriveContents(pages)

/** The fixture book's page of a given kind. */
const pageOf = (kind: BookPage['kind']): BookPage => {
  const found = pages.find((page) => page.kind === kind)
  if (found === undefined) throw new Error(`the fixture book has no ${kind} page`)
  return found
}

/**
 * One of Tokyo's three pages, with whatever this case needs changed about it.
 * Narrowed to {@link JourneyPage} because the journey fields do not exist on
 * the union's three book-wide arms - which is the type doing its job.
 */
const journeyPageOf = (kind: JourneyPage['kind'], overrides: Partial<JourneyPage> = {}): JourneyPage => {
  const found = pages.find((page) => page.kind === kind)
  if (found === undefined || found.kind === 'cover' || found.kind === 'contents' || found.kind === 'about') {
    throw new Error(`the fixture book has no ${kind} page`)
  }
  return { ...found, ...overrides }
}

const roots: Root[] = []

const render = (page: BookPage, overrides: Partial<React.ComponentProps<typeof MobilePage>> = {}): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(
      <MobilePage
        page={page}
        contents={contents}
        chrome={aBookChrome()}
        about={anAboutContent()}
        leafIndex={pages.findIndex((candidate) => candidate.kind === page.kind)}
        totalPages={pages.length}
        {...overrides}
      />,
    )
  })
  return container
}

const one = (container: HTMLElement, selector: string): HTMLElement => {
  const found = container.querySelector(selector)
  if (!(found instanceof HTMLElement)) throw new Error(`no ${selector} on the page`)
  return found
}

afterEach(() => {
  for (const root of roots) {
    act(() => {
      root.unmount()
    })
  }
  roots.length = 0
  document.body.innerHTML = ''
})

describe('MobilePage', () => {
  it('draws the Cover for a cover page', () => {
    const container = render(pageOf('cover'))

    expect(one(container, '[data-mobile-page]').dataset['mobilePage']).toBe('cover')
  })

  it('draws the Contents for a contents page', () => {
    const container = render(pageOf('contents'))

    expect(one(container, '[data-mobile-page]').dataset['mobilePage']).toBe('contents')
  })

  it('draws the About page for an about page', () => {
    const container = render(pageOf('about'))

    expect(one(container, '[data-mobile-page]').dataset['mobilePage']).toBe('about')
  })

  it('draws the journey page for all three of a journey’s kinds', () => {
    const kinds = (['notes', 'frames-i', 'frames-ii'] as const).map(
      (kind) => one(render(pageOf(kind)), '[data-mobile-page]').dataset['mobilePage'],
    )

    expect(kinds).toEqual(['notes', 'frames-i', 'frames-ii'])
  })

  it('gives every page kind exactly one level-one heading', () => {
    const headings = (['cover', 'contents', 'notes', 'frames-i', 'frames-ii', 'about'] as const).map(
      (kind) => render(pageOf(kind)).querySelectorAll('h1').length,
    )

    expect(headings).toEqual([1, 1, 1, 1, 1, 1])
  })

  it('still gives the Cover a heading when an editor has cleared the book’s title', () => {
    // Without this the mobile document has no h1 at all, since it carries one
    // page rather than the book's thirty-three.
    const container = render(pageOf('cover'), { chrome: aBookChrome({ title: '' }) })

    expect({ headings: container.querySelectorAll('h1').length, text: one(container, 'h1').textContent }).toEqual({
      headings: 1,
      text: 'Travel Diary',
    })
  })

  it('sizes the cover title to the phone rather than to the book’s 124px', () => {
    const container = render(pageOf('cover'), { chrome: aBookChrome({ title: 'Wanderings' }) })

    expect(one(container, 'h1').style.fontSize).toBe('65px')
  })

  it('offers a real link into the first page of the book from the cover', () => {
    const container = render(pageOf('cover'))

    expect(one(container, '[data-start-reading]').getAttribute('href')).toBe('/p/2')
  })

  it('offers no way to start reading a book of one page', () => {
    const container = render(pageOf('cover'), { totalPages: 1 })

    expect(container.querySelector('[data-start-reading]')).toBe(null)
  })

  it('prints the cover’s subtitle, owner and cloth as the editor set them', () => {
    const container = render(pageOf('cover'), {
      chrome: aBookChrome({ subtitle: 'field notes', owner: 'M. Alvarez', coverCloth: '#7a3b32' }),
    })

    expect({
      keptBy: one(container, '[data-mobile-page]').textContent.includes('Kept by M. Alvarez'),
      subtitle: one(container, '[data-mobile-page]').textContent.includes('field notes'),
      cloth: one(container, '[data-mobile-page] > div').style.getPropertyValue('--cover-cloth'),
    }).toEqual({ keptBy: true, subtitle: true, cloth: '#7a3b32' })
  })

  it('prints the years line the book’s own Cover prints, so the two surfaces show one book', () => {
    // PH1-004. `Cover.tsx` prints five of SCREENS.md §1.1's six lines here and
    // dropped the sixth: `yearsShown` is an editor-supplied field on the `book`
    // global, so an owner who edited it saw it change on a laptop and not on a
    // phone, with nothing in the product or in docs/deviations.md saying it
    // should. §12 revisits that line's alpha and keeps the line.
    const container = render(pageOf('cover'), { chrome: aBookChrome({ yearsShown: '2025 — 2026' }) })

    expect(one(container, '[data-mobile-page]').textContent).toContain('2025 — 2026')
  })

  it('prints nothing for a cover whose subtitle, owner and years an editor has cleared', () => {
    const container = render(pageOf('cover'), {
      chrome: aBookChrome({ subtitle: '', owner: '', yearsShown: '' }),
    })

    expect({
      keptBy: one(container, '[data-mobile-page]').textContent.includes('Kept by'),
      // The same rule the book's Cover follows and the project's standing
      // policy for an optional line (docs/deviations.md §19): an empty
      // optional line prints nothing, not an empty element.
      years: container.querySelector('[data-cover-years]') !== null,
    }).toEqual({ keptBy: false, years: false })
  })

  it('makes every Contents row a real link to the page it names', () => {
    const container = render(pageOf('contents'))

    expect([...container.querySelectorAll('[data-contents-row]')].map((row) => row.getAttribute('href'))).toEqual([
      '/p/3',
      '/p/6',
    ])
  })

  it('numbers the Contents rows from one, zero-padded', () => {
    const container = render(pageOf('contents'))

    expect([...container.querySelectorAll('[data-contents-row] > span:first-child')].map((n) => n.textContent)).toEqual(
      ['01', '02'],
    )
  })

  it('prints no contents note for a book whose note an editor has cleared', () => {
    const container = render(pageOf('contents'), { chrome: aBookChrome({ contentsNote: '' }) })

    expect(container.querySelector('[data-contents-note]')).toBe(null)
  })

  it('prints a journey’s dates, name and place', () => {
    const container = render(pageOf('notes'))

    expect(one(container, 'h1').textContent).toBe('Tokyo')
  })

  it('draws both badge bars with the journey’s own weather glyph', () => {
    const container = render(pageOf('notes'))

    expect({
      weather: one(container, '[data-badge="weather"]').textContent,
      glyph: one(container, '[data-weather-glyph]').dataset['weatherGlyph'],
      mood: one(container, '[data-badge="mood"]').textContent,
    }).toEqual({ weather: 'CLEAR 14C', glyph: 'haze', mood: 'WIDE EYED' })
  })

  it('draws no badge an editor has left empty', () => {
    const container = render(journeyPageOf('notes', { weather: '', mood: '' }))

    expect(container.querySelectorAll('[data-badge]').length).toBe(0)
  })

  it('draws the highlights, the note and the tally on a notes page', () => {
    const container = render(pageOf('notes'))

    expect({
      highlights: [...container.querySelectorAll('[data-highlight]')].map((line) => line.textContent),
      tally: one(container, '[data-tally]').textContent,
    }).toEqual({
      highlights: ['a shrine at dawn', 'nineteen tarts'],
      tally: 'trains31tartsnineteen',
    })
  })

  it('caps the highlights at four, whatever reached the database', () => {
    const container = render(journeyPageOf('notes', { highlights: ['one', 'two', 'three', 'four', 'five'] }))

    expect(container.querySelectorAll('[data-highlight]').length).toBe(4)
  })

  it('draws no notes block on a frames page, whose journey carries the same fields', () => {
    const container = render(pageOf('frames-i'))

    expect(container.querySelector('[data-highlights]')).toBe(null)
  })

  it('draws no notes block at all for a journey with nothing written in it yet', () => {
    const container = render(journeyPageOf('notes', { highlights: [], note: '', tally: [] }))

    expect(container.querySelector('[data-highlights]')).toBe(null)
  })

  it('prints the hero photograph on a notes page and leaves the ephemera scrap out', () => {
    const container = render(journeyPageOf('notes', { slots: [ephemera, hero] }))

    expect([...container.querySelectorAll('[data-photo]')].map((photo) => photo.getAttribute('src'))).toEqual([
      '/media/tokyo-hero.jpg',
    ])
  })

  it('prints every frame on a frames page, in the order the slots arrive', () => {
    const container = render(journeyPageOf('frames-i', { slots: [frameOne, frameTwo] }))

    expect([...container.querySelectorAll('[data-photo]')].map((photo) => photo.getAttribute('src'))).toEqual([
      '/media/tokyo-a.jpg',
      '/media/tokyo-b.jpg',
    ])
  })

  it('carries each slot’s focal point through to the crop, which is the whole point of the picker', () => {
    const container = render(journeyPageOf('notes', { slots: [hero] }))

    expect(one(container, '[data-photo]').style.objectPosition).toBe('30% 70%')
  })

  it('prints a caption under a photograph, and none where the editor wrote none', () => {
    const container = render(journeyPageOf('frames-i', { slots: [frameOne, frameTwo] }))

    expect([...container.querySelectorAll('figcaption')].map((caption) => caption.textContent)).toEqual([
      'Bright signs',
    ])
  })

  it('draws no photographs at all for a page whose slots could not be resolved', () => {
    // `derivePages` never populates `slots`; `readBookBundle` merges them in
    // afterwards from the matching `pages` row, and this is the page it could
    // not match.
    const container = render(journeyPageOf('frames-ii'))

    expect(container.querySelectorAll('[data-photo]').length).toBe(0)
  })

  it('links a journey page’s gallery button at the journey, carrying the page to return to', () => {
    const container = render(pageOf('frames-i'))

    // Leaf 3 is Tokyo's Frames I, and `galleryPath` writes the reader's
    // 1-based page number so the gallery's back control returns them here.
    expect(one(container, '[data-gallery-link]').getAttribute('href')).toBe('/gallery/tokyo?from=4')
  })

  it('prints the journey’s derived gallery census under the button', () => {
    const container = render(pageOf('notes'))

    expect(one(container, '[data-gallery-count]').textContent).toBe('24 photographs and 3 clips in the gallery')
  })

  it('prints the About page’s portrait, paragraphs and address', () => {
    const container = render(pageOf('about'), {
      about: anAboutContent({
        portrait: aPortrait({ src: '/media/portrait.jpg', caption: 'bad coffee, good window' }),
        paragraphs: ['A paper habit.', 'Nothing here is a recommendation.'],
        replyTo: 'hello@wanderings.travel',
      }),
    })

    expect({
      portrait: one(container, '[data-photo]').getAttribute('src'),
      paragraphs: [...container.querySelectorAll('[data-about-paragraph]')].map((p) => p.textContent),
      replyTo: one(container, '[data-reply-to]').textContent,
    }).toEqual({
      portrait: '/media/portrait.jpg',
      paragraphs: ['A paper habit.', 'Nothing here is a recommendation.'],
      replyTo: 'hello@wanderings.travel',
    })
  })

  it('draws no portrait mount at all where no portrait has been uploaded', () => {
    const container = render(pageOf('about'), { about: anAboutContent({ portrait: undefined }) })

    expect(container.querySelectorAll('[data-photo]').length).toBe(0)
  })

  it('draws no reply-to block at all where the address has been cleared', () => {
    const container = render(pageOf('about'), { about: anAboutContent({ replyTo: '' }) })

    expect(container.querySelector('[data-reply-to]')).toBe(null)
  })
})
