/**
 * Notes.test.tsx — what a journey's notes page prints, and what it omits.
 *
 * jsdom performs no layout, so nothing here asserts a measurement — the
 * page's absolute geometry, the elastic ephemera slot and the focal point's
 * effect on the rendered crop are all guarded in a real browser by
 * `e2e/notes.spec.ts`, and its appearance by the visual baselines in
 * `e2e/visual.spec.ts`. What IS testable without layout is every decision the
 * component makes: which glyph it draws, which lines it omits when an editor
 * has cleared them, how many highlights it lets through, which slot it puts
 * in which frame, and whether the focal point reaches the DOM at all.
 *
 * IT COVERS THE FOUR SUB-COMPONENTS THROUGH THE PAGE rather than in four
 * further files. `WeatherBadge`, `MoodBadge`, `TallyTicket` and
 * `EphemeraSlot` have exactly one caller between them, and every branch any
 * of them has — the three weather glyphs, an ephemera slot with and without
 * a photograph — is reachable from `Notes`'s own props. Four separate files
 * would assert the same lines twice and would let the page and its parts
 * drift apart, which is the failure a component test is meant to catch.
 *
 * The copy is asserted verbatim, not by regex. SCREENS.md's copy is final
 * (CLAUDE.md §9, Pass 3), and a test that matched it loosely would let a
 * paraphrase through.
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import type { Journey, JourneyPage, Slot } from '@travel-diary/domain/bookBundle'
import { derivePages } from '@travel-diary/domain/bookBundle'
import { aJourney } from '@travel-diary/domain/testing/factories'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFERRED_PHOTOGRAPH_SRC } from './deferredPhotograph'
import { Notes } from './Notes'

const roots: Root[] = []

/** A hero slot fixture, overridable per field. */
const aHeroSlot = (overrides: Partial<Slot> = {}): Slot => ({
  role: 'hero',
  src: '/api/media/file/tokyo-hero-800x800.png',
  alt: 'Shibuya crossing',
  caption: 'Crossing at Shibuya, second attempt, still blurred',
  focalX: 50,
  focalY: 50,
  ...overrides,
})

/** An ephemera slot fixture, overridable per field. */
const anEphemeraSlot = (overrides: Partial<Slot> = {}): Slot => ({
  role: 'ephemera',
  src: '/api/media/file/tokyo-ephemera-800x800.png',
  alt: 'TOKYO EPHEMERA',
  caption: '',
  focalX: 50,
  focalY: 50,
  ...overrides,
})

/**
 * Builds the notes page a journey derives, so the fixture goes through the
 * same `derivePages` the diary does rather than being hand-assembled into a
 * shape the domain might never produce.
 * @param journey - Fields to override on the default journey.
 * @param slots - The page's resolved slots, or `undefined` for a page with none.
 * @returns The journey's notes page.
 */
const aNotesPage = (journey: Partial<Journey> = {}, slots?: readonly Slot[]): JourneyPage => {
  const page = derivePages([aJourney(journey)]).find((candidate) => candidate.kind === 'notes')
  if (page === undefined || page.kind !== 'notes') throw new Error('derivePages produced no notes page')
  return slots === undefined ? page : { ...page, slots }
}

/**
 * Renders the notes page and hands back the host element.
 * @param page - The journey's notes page.
 * @param showDecorations - The book global's decorations flag.
 * @param loadsImages - Whether this leaf is inside the reader's image window.
 * @returns The host element the page was rendered into.
 */
const renderNotes = (page: JourneyPage, showDecorations = true, loadsImages = true): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<Notes page={page} showDecorations={showDecorations} loadsImages={loadsImages} />)
  })
  return host
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

describe('Notes — the header', () => {
  it('prints the journey name as the page’s level-one heading', () => {
    const host = renderNotes(aNotesPage({ name: 'Lisbon' }))

    expect(host.querySelector('h1')?.textContent).toBe('Lisbon')
  })

  it('prints the dates and the place beside it', () => {
    const host = renderNotes(aNotesPage({ dates: '3 – 14 September 2025', place: 'Portugal' }))

    expect(host.textContent).toContain('3 – 14 September 2025')
    expect(host.textContent).toContain('Portugal')
  })

  it('omits the dates line rather than printing an empty eyebrow', () => {
    const host = renderNotes(aNotesPage({ dates: '' }))

    expect(host.querySelectorAll('header p')).toHaveLength(1)
  })

  it('omits the place line rather than printing an empty italic', () => {
    const host = renderNotes(aNotesPage({ place: '' }))

    expect(host.querySelectorAll('header p')).toHaveLength(1)
  })

  it('prints the weather line inside the weather badge', () => {
    const host = renderNotes(aNotesPage({ weather: 'HAZY 27C' }))

    expect(host.querySelector('[data-badge="weather"]')?.textContent).toBe('HAZY 27C')
  })

  it('prints the mood line inside the mood badge', () => {
    const host = renderNotes(aNotesPage({ mood: 'UNHURRIED' }))

    expect(host.querySelector('[data-badge="mood"]')?.textContent).toBe('UNHURRIED')
  })

  it('omits the weather badge entirely when a journey has no weather line, rather than drawing an empty circle', () => {
    const host = renderNotes(aNotesPage({ weather: '' }))

    expect(host.querySelector('[data-badge="weather"]')).toBeNull()
  })

  it('omits the mood badge entirely when a journey has no mood line', () => {
    const host = renderNotes(aNotesPage({ mood: '' }))

    expect(host.querySelector('[data-badge="mood"]')).toBeNull()
  })

  it('draws the sun glyph for a journey whose weather glyph is sun', () => {
    const host = renderNotes(aNotesPage({ weatherGlyph: 'sun' }))

    expect(host.querySelector('[data-weather-glyph]')?.getAttribute('data-weather-glyph')).toBe('sun')
  })

  it('draws the haze glyph for a journey whose weather glyph is haze', () => {
    const host = renderNotes(aNotesPage({ weatherGlyph: 'haze' }))

    expect(host.querySelector('[data-weather-glyph]')?.getAttribute('data-weather-glyph')).toBe('haze')
  })

  it('draws the wind glyph for a journey whose weather glyph is wind', () => {
    const host = renderNotes(aNotesPage({ weatherGlyph: 'wind' }))

    expect(host.querySelector('[data-weather-glyph]')?.getAttribute('data-weather-glyph')).toBe('wind')
  })

  it('keeps both badge glyphs out of the accessibility tree, since the label beside each says it in words', () => {
    const host = renderNotes(aNotesPage())
    const glyphs = [...host.querySelectorAll('[data-badge] span')]

    expect(glyphs.filter((glyph) => glyph.getAttribute('aria-hidden') === 'true')).toHaveLength(2)
  })
})

describe('Notes — the highlights', () => {
  it('prints every highlight the journey has, verbatim', () => {
    const highlights = [
      'Tram 28 at seven, before the queue and the pickpockets',
      'Custard tart count: nineteen. Peak: four in one sitting',
      'Sunset at Graca — the whole terrace went quiet at once',
    ]

    const host = renderNotes(aNotesPage({ highlights }))

    expect([...host.querySelectorAll('[data-highlight]')].map((row) => row.textContent)).toEqual(highlights)
  })

  it('caps the list at four, because a fifth would eat the ephemera slot rather than reflow the page', () => {
    const host = renderNotes(aNotesPage({ highlights: ['one', 'two', 'three', 'four', 'five'] }))

    expect(host.querySelectorAll('[data-highlight]')).toHaveLength(4)
  })

  it('prints an empty list rather than failing when a journey has no highlights yet', () => {
    const host = renderNotes(aNotesPage({ highlights: [] }))

    expect(host.querySelectorAll('[data-highlight]')).toHaveLength(0)
    expect(host.querySelector('[data-highlights]')).not.toBeNull()
  })
})

describe('Notes — the note and the tally', () => {
  it('prints the journey’s note, verbatim', () => {
    const note = 'Every street in Lisbon is either up or down.'

    const host = renderNotes(aNotesPage({ note }))

    expect(host.textContent).toContain(note)
  })

  it('omits the note and its rule together, rather than printing a bare rule above nothing', () => {
    const withNote = renderNotes(aNotesPage({ note: 'Every street in Lisbon is either up or down.' }))
    const withoutNote = renderNotes(aNotesPage({ note: '' }))

    const columnChildren = (host: HTMLElement) =>
      host.querySelector('[data-highlights]')?.parentElement?.children.length ?? 0

    // Eyebrow, highlights, note block, tally, ephemera — minus the note block.
    expect(columnChildren(withNote)).toBe(5)
    expect(columnChildren(withoutNote)).toBe(4)
  })

  it('prints each tally cell as a key over its value', () => {
    const host = renderNotes(aNotesPage({ tally: [{ key: 'Custard tarts', value: '19' }] }))
    const cell = host.querySelector('[data-tally-cell]')

    expect(cell?.querySelector('dt')?.textContent).toBe('Custard tarts')
    expect(cell?.querySelector('dd')?.textContent).toBe('19')
  })

  it('keeps a tally value that is a word rather than a number, because several journeys say "plenty"', () => {
    const host = renderNotes(aNotesPage({ tally: [{ key: 'Hills climbed', value: 'plenty' }] }))

    expect(host.querySelector('[data-tally-cell] dd')?.textContent).toBe('plenty')
  })

  it('omits the ticket entirely when a journey has no tally, rather than drawing an empty card', () => {
    const host = renderNotes(aNotesPage({ tally: [] }))

    expect(host.querySelector('[data-tally]')).toBeNull()
  })
})

describe('Notes — the ephemera slot', () => {
  it('draws the slot even when the journey has no ephemera photograph, because the box is what absorbs the leftover height', () => {
    const host = renderNotes(aNotesPage({}, [aHeroSlot()]))

    expect(host.querySelector('[data-ephemera]')).not.toBeNull()
    expect(host.querySelector('[data-ephemera] img')).toBeNull()
  })

  it('draws the scrap’s photograph when the journey has one', () => {
    const host = renderNotes(aNotesPage({}, [aHeroSlot(), anEphemeraSlot()]))

    expect(host.querySelector('[data-ephemera] img')?.getAttribute('src')).toBe(
      '/api/media/file/tokyo-ephemera-800x800.png',
    )
  })

  it('gives the scrap an empty alt, since it is a texture rather than a photograph with a subject', () => {
    const host = renderNotes(aNotesPage({}, [anEphemeraSlot()]))

    expect(host.querySelector('[data-ephemera] img')?.getAttribute('alt')).toBe('')
  })
})

describe('Notes — the hero photograph', () => {
  it('renders the hero slot found by its role, not by its position in the editor-ordered array', () => {
    // The ephemera slot deliberately comes FIRST here: a component reading
    // `slots[0]` would put the texture in the photo mount.
    const host = renderNotes(aNotesPage({}, [anEphemeraSlot(), aHeroSlot()]))

    expect(host.querySelector('[data-hero]')?.getAttribute('src')).toBe('/api/media/file/tokyo-hero-800x800.png')
  })

  it('applies the slot’s focal point as the image’s object-position', () => {
    const host = renderNotes(aNotesPage({}, [aHeroSlot({ focalX: 18, focalY: 82 })]))

    expect(host.querySelector<HTMLElement>('[data-hero]')?.style.objectPosition).toBe('18% 82%')
  })

  it('carries the slot’s alt text through to the image', () => {
    const host = renderNotes(aNotesPage({}, [aHeroSlot({ alt: 'The towers, minute three of eleven' })]))

    expect(host.querySelector('[data-hero]')?.getAttribute('alt')).toBe('The towers, minute three of eleven')
  })

  it('prints the hero caption under the mount', () => {
    const host = renderNotes(aNotesPage({}, [aHeroSlot()]))

    expect(host.querySelector('figcaption')?.textContent).toBe('Crossing at Shibuya, second attempt, still blurred')
  })

  it('omits the caption rather than printing an empty line when the slot has none', () => {
    const host = renderNotes(aNotesPage({}, [aHeroSlot({ caption: '' })]))

    expect(host.querySelector('figcaption')).toBeNull()
  })

  it('omits the mount entirely when the page has no hero slot at all', () => {
    const host = renderNotes(aNotesPage({}, []))

    expect(host.querySelector('[data-hero]')).toBeNull()
  })

  it('omits the mount when the page carries no slots, which is what an unmatched page row produces', () => {
    const host = renderNotes(aNotesPage())

    expect(host.querySelector('[data-hero]')).toBeNull()
  })
})

describe('Notes — the decorations', () => {
  it('draws both washi strips and the stamp when the book global allows decorations', () => {
    const host = renderNotes(aNotesPage({}, [aHeroSlot(), anEphemeraSlot()]), true)

    expect(host.querySelectorAll('[data-decoration="washi"]')).toHaveLength(2)
    expect(host.querySelector('[data-decoration="stamp"]')).not.toBeNull()
  })

  it('draws none of them when the book global turns decorations off', () => {
    const host = renderNotes(aNotesPage({}, [aHeroSlot(), anEphemeraSlot()]), false)

    expect(host.querySelectorAll('[data-decoration]')).toHaveLength(0)
  })

  it('prints the stamp’s country and value from the journey’s own furniture', () => {
    const host = renderNotes(
      aNotesPage({ furniture: { accent: '#a06b3e', signoff: 'x', stampCountry: 'PORTUGAL', stampValue: '85' } }),
    )
    const stamp = host.querySelector('[data-decoration="stamp"]')

    expect(stamp?.textContent).toBe('PORTUGAL85')
  })

  it('tints the stamp with the journey’s own accent', () => {
    const host = renderNotes(
      aNotesPage({ furniture: { accent: '#5a72a8', signoff: 'x', stampCountry: 'CHILE', stampValue: '600' } }),
    )
    const face = host.querySelector<HTMLElement>('[data-decoration="stamp"] > div')

    expect(face?.style.getPropertyValue('--stamp-accent')).toBe('#5a72a8')
  })

  it('keeps every decoration out of the accessibility tree', () => {
    const host = renderNotes(aNotesPage({}, [aHeroSlot(), anEphemeraSlot()]))

    expect(
      [...host.querySelectorAll('[data-decoration]')].every((node) => node.getAttribute('aria-hidden') === 'true'),
    ).toBe(true)
  })
})

describe('Notes — the footer', () => {
  it('links to the journey’s own gallery by a real path, not a click handler', () => {
    const host = renderNotes(aNotesPage({ slug: 'patagonia' }))
    const link = host.querySelector('footer a')

    expect(link?.getAttribute('href')).toBe('/gallery/patagonia')
    expect(link?.textContent).toContain('See full gallery')
  })

  it('prints the derived gallery census, not a stored total', () => {
    const host = renderNotes(aNotesPage({ gallery: { photographs: 41, clips: 6 } }))

    expect(host.querySelector('footer')?.textContent).toContain('41 photographs and 6 clips in the gallery')
  })

  it('prints the journey’s sign-off, verbatim', () => {
    const host = renderNotes(
      aNotesPage({
        furniture: { accent: '#a06b3e', signoff: 'nineteen tarts, no regrets', stampCountry: '', stampValue: '' },
      }),
    )

    expect(host.querySelector('footer')?.textContent).toContain('nineteen tarts, no regrets')
  })

  it('omits the sign-off when a journey has none, rather than printing an empty line', () => {
    const host = renderNotes(
      aNotesPage({ furniture: { accent: '#a06b3e', signoff: '', stampCountry: '', stampValue: '' } }),
    )

    expect(host.querySelectorAll('footer p')).toHaveLength(1)
  })
})

describe('Notes — the image window', () => {
  // Task 10 measured `/p/1` fetching all twenty of the seeded book's
  // photographs — 1,820,504 bytes — with the reader on the Cover, because
  // every leaf is in the document and stacked at `inset: 0`, so
  // `loading="lazy"` considers all of them in the viewport. The window that
  // fixes it is `leafPresentation.loadsImages`; what is asserted here is that
  // this page HONOURS it, and that honouring it costs the page none of the
  // text the design spec's §8 requires to stay indexable.

  it('withholds the source of a photograph on a leaf the reader is nowhere near', () => {
    const host = renderNotes(aNotesPage({}, [aHeroSlot(), anEphemeraSlot()]), true, false)

    expect(host.querySelector('[data-hero]')?.getAttribute('src')).toBe(DEFERRED_PHOTOGRAPH_SRC)
  })

  it('withholds the ephemera scrap the same way', () => {
    const host = renderNotes(aNotesPage({}, [aHeroSlot(), anEphemeraSlot()]), true, false)

    const scrap = host.querySelector('[data-ephemera] img')
    expect(scrap?.getAttribute('src')).toBe(DEFERRED_PHOTOGRAPH_SRC)
  })

  it('keeps every word of a deferred page in the markup, so the deep link stays indexable', () => {
    // The bytes are what is withheld, never the text: the heading, the place,
    // the highlight, the note, the tally, the caption and the alt text are
    // all still here for a crawler that runs no JavaScript.
    const page = aNotesPage(
      {
        name: 'Lisbon',
        place: 'Portugal',
        highlights: ['Tram 28 at dawn'],
        note: 'Lisbon is a city of staircases.',
        tally: [{ key: 'Days', value: '11' }],
      },
      [aHeroSlot(), anEphemeraSlot()],
    )

    const deferred = renderNotes(page, true, false)

    expect(deferred.querySelector('h1')?.textContent).toBe('Lisbon')
    expect(deferred.textContent).toContain('Portugal')
    expect(deferred.textContent).toContain('Tram 28 at dawn')
    expect(deferred.textContent).toContain('Lisbon is a city of staircases.')
    expect(deferred.textContent).toContain('11')
    expect(deferred.textContent).toContain('Crossing at Shibuya, second attempt, still blurred')
    expect(deferred.querySelector('[data-hero]')?.getAttribute('alt')).toBe('Shibuya crossing')
  })

  it('still draws the focal point on a deferred photograph, so nothing shifts when it arrives', () => {
    const page = aNotesPage({}, [aHeroSlot({ focalX: 18, focalY: 82 })])

    const host = renderNotes(page, true, false)

    expect(host.querySelector<HTMLElement>('[data-hero]')?.style.objectPosition).toBe('18% 82%')
  })

  it('carries the real source once the leaf is inside the window', () => {
    const host = renderNotes(aNotesPage({}, [aHeroSlot(), anEphemeraSlot()]), true, true)

    expect(host.querySelector('[data-hero]')?.getAttribute('src')).toBe('/api/media/file/tokyo-hero-800x800.png')
    expect(host.querySelector('[data-ephemera] img')?.getAttribute('src')).toBe(
      '/api/media/file/tokyo-ephemera-800x800.png',
    )
  })
})
