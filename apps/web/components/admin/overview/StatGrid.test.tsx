/**
 * StatGrid.test.tsx — SCREENS.md §2.1's four stat cards: the label, the figure,
 * the note and the 3px tick.
 *
 * THE FOUR TICKS ARE READ AS FOUR, not sampled. A grid that gave every card
 * one colour, or none, would pass a `toContain` on any single one — which is
 * the shape standing order 14 names: a comparison only moves when the fixture
 * holds two of the thing being distinguished.
 * Depends on: react, react-dom/client, vitest (jsdom),
 * @travel-diary/domain/admin/overviewStats, ./StatGrid.
 */
import { overviewStats } from '@travel-diary/domain/admin/overviewStats'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { StatGrid } from './StatGrid'

const roots: Root[] = []

/** The prototype's own four figures, run through the domain that shapes them. */
const FOUR = overviewStats({
  journeys: 10,
  journeysInDraft: 1,
  pages: 33,
  pagesInDraft: 2,
  photographs: 512,
  photographsInBook: 96,
  clips: 68,
  clipsWithPoster: 9,
})

/**
 * Renders the grid and hands back the host element.
 * @param stats - The cards to draw.
 * @returns The host element.
 */
const renderGrid = (stats = FOUR): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<StatGrid stats={stats} />)
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('StatGrid', () => {
  it('draws one card per stat it is given, keyed by what the card is about', () => {
    const host = renderGrid()

    expect([...host.querySelectorAll('[data-stat-id]')].map((card) => card.getAttribute('data-stat-id'))).toEqual([
      'journeys',
      'pages',
      'photographs',
      'clips',
    ])
  })

  it('prints each card’s label, figure and note, in that card', () => {
    const card = renderGrid().querySelector('[data-stat-id="photographs"]')

    expect([
      card?.querySelector('[data-stat-label]')?.textContent,
      card?.querySelector('[data-stat-value]')?.textContent,
      card?.querySelector('[data-stat-note]')?.textContent,
    ]).toEqual(['Photographs', '512', '96 placed in the book'])
  })

  it('gives every card its own tick colour, all four of them different', () => {
    const ticks = [...renderGrid().querySelectorAll('[data-stat-id]')].map((card) =>
      card.querySelector<HTMLElement>('[data-stat-tick]')?.style.getPropertyValue('--td-stat-tone'),
    )

    expect(ticks).toEqual(FOUR.map((stat) => stat.tone))
    // FOUR OF THEM, ALL DISTINCT: a grid painting one colour four times would
    // satisfy the comparison above only because `overviewStats` happens to
    // answer four values, so the distinctness is asserted rather than assumed.
    expect(new Set(ticks).size).toBe(4)
  })

  it('draws a tick on every card, not only on the ones a fixture looked at', () => {
    expect(renderGrid().querySelectorAll('[data-stat-tick]')).toHaveLength(4)
  })

  it('draws nothing at all when it is given nothing, rather than an empty frame', () => {
    expect(renderGrid([]).querySelectorAll('[data-stat-id]')).toHaveLength(0)
  })
})
