/**
 * TrashCard.test.tsx — SCREENS.md §2.10's card: its header and count, its
 * empty state, and a row per journey waiting to go.
 * Depends on: react, react-dom/client, vitest (jsdom),
 * @travel-diary/domain/ids, ../../../lib/admin/readTrashScreen, ./TrashCard.
 */
import { journeyId, type JourneyId } from '@travel-diary/domain/ids'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { TrashRow } from '../../../lib/admin/readTrashScreen'
import { TrashCard } from './TrashCard'

const roots: Root[] = []

/**
 * A branded journey id for a row id.
 * @param raw - The id as Postgres spells it.
 * @returns The branded id.
 */
const aJourney = (raw: string): JourneyId => {
  const built = journeyId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/**
 * Two rows, as `readTrashScreen` returns them.
 *
 * TWO, NOT ONE, and the two differ in the things the card distinguishes: one
 * has a cover and one does not, one is on its first day and one is past the
 * window. A single-row fixture cannot see a per-row defect (standing orders
 * §14).
 */
const TWO: readonly TrashRow[] = [
  {
    id: aJourney('41'),
    name: 'Reykjavik',
    summary: 'Iceland · 3 pages · 12 photographs',
    goesForGood: 'goes for good in 30 days',
    daysLeft: 30,
    thumbSrc: '/media/reykjavik-thumb.jpg',
  },
  {
    id: aJourney('42'),
    name: 'Porto',
    summary: 'Portugal · 1 page · 0 photographs',
    goesForGood: 'still here until you delete it',
    daysLeft: 0,
    thumbSrc: null,
  },
]

/** A write that records nothing: the card is forms, and jsdom submits none. */
const noWrite = (): Promise<void> => Promise.resolve()

/**
 * Renders the card and hands back the host element.
 * @param rows - The rows to draw.
 * @returns The host element.
 */
const renderCard = (rows: readonly TrashRow[] = TWO): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<TrashCard rows={rows} putBack={noWrite} deleteForGood={noWrite} />)
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('TrashCard', () => {
  it('draws one row per journey, keyed by the journey’s own id', () => {
    expect(
      [...renderCard().querySelectorAll('[data-trash-row]')].map((row) => row.getAttribute('data-trash-row')),
    ).toEqual(['41', '42'])
  })

  it('prints each row’s name over §2.10’s summary line', () => {
    const row = renderCard().querySelector('[data-trash-row="41"]')

    expect([
      row?.querySelector('[data-trash-name]')?.textContent,
      row?.querySelector('[data-trash-summary]')?.textContent,
    ]).toEqual(['Reykjavik', 'Iceland · 3 pages · 12 photographs'])
  })

  it('prints each row’s own countdown, which is not the same sentence on every row', () => {
    const host = renderCard()
    const countdownOf = (id: string): string | undefined =>
      host.querySelector(`[data-trash-row="${id}"] [data-trash-countdown]`)?.textContent ?? undefined

    // TWO OF THE THING BEING DISTINGUISHED. A card printing one row's
    // countdown on every row passes any single-row fixture.
    expect([countdownOf('41'), countdownOf('42')]).toEqual([
      'goes for good in 30 days',
      'still here until you delete it',
    ])
  })

  it('draws the cover at the size the read gave it, and an empty square when there is none', () => {
    const host = renderCard()

    expect(host.querySelector('[data-trash-row="41"] [data-trash-thumb]')?.getAttribute('src')).toBe(
      '/media/reykjavik-thumb.jpg',
    )
    expect(host.querySelector('[data-trash-row="42"] [data-trash-thumb]')).toBeNull()
    expect(host.querySelector('[data-trash-row="42"] [data-trash-thumb-empty]')).not.toBeNull()
  })

  it('gives each row two controls, each posting the journey’s id and nothing positional', () => {
    const host = renderCard()
    const row = host.querySelector('[data-trash-row="42"]')

    expect(row?.querySelector('[data-put-back="42"]')?.textContent).toBe('Put back')
    expect(row?.querySelector('[data-delete-for-good="42"]')?.textContent).toBe('Delete for good')
    expect([...(row?.querySelectorAll<HTMLInputElement>('input[name="journey"]') ?? [])].map((i) => i.value)).toEqual([
      '42',
      '42',
    ])
  })

  it('gives the two controls separate forms, so the destructive one shares nothing with its undo', () => {
    const host = renderCard()

    expect(host.querySelectorAll('[data-trash-row="41"] form')).toHaveLength(2)
  })

  it('counts what is waiting, in the header, beside §2.10’s own line', () => {
    const host = renderCard()

    expect(host.querySelector('[data-trash-count]')?.textContent).toContain('nothing here is gone until you say so')
    expect(host.querySelector('[data-trash-count]')?.textContent).toContain('2 journeys waiting')
  })

  it('writes the singular for one journey, because “1 journeys” is not a sentence', () => {
    const host = renderCard([TWO[0] ?? TWO[0]].filter((row): row is TrashRow => row !== undefined))

    expect(host.querySelector('[data-trash-count]')?.textContent).toContain('1 journey waiting')
  })

  it('draws §2.10’s empty state instead of an empty list', () => {
    const host = renderCard([])

    expect(host.querySelectorAll('[data-trash-row]')).toHaveLength(0)
    expect(host.querySelector('[data-trash-empty]')?.textContent).toContain('Nothing thrown away')
  })

  it('titles the card in §2.10’s own words', () => {
    expect(renderCard().querySelector('h2')?.textContent).toBe('Kept for thirty days')
  })
})
