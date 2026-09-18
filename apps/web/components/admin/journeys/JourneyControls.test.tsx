/**
 * JourneyControls.test.tsx — the search box and the five status chips
 * SCREENS.md §2.2 puts above the table.
 *
 * ═══ THE POINT OF EVERY CASE HERE IS THAT NONE OF IT IS JAVASCRIPT ═══
 *
 * The search is a `GET` form and each chip is a link, so both survive a reload,
 * can be sent to somebody, and cost nothing against CLAUDE.md §6's 320KB admin
 * ceiling. What that buys has to be asserted, because a client component would
 * look identical in jsdom: the cases below read the input's rendered `value`
 * and each chip's `href`, which is where a `useState` version would have
 * nothing at all.
 *
 * THE FIVE WORDS COME FROM THE DOMAIN, not from a literal here:
 * `JOURNEY_STATUS_FILTERS` is what the screen filters by, and a case spelling
 * five strings of its own would pass while the chips selected something else.
 *
 * Depends on: react, react-dom/client, vitest (jsdom), ./JourneyControls,
 * `@travel-diary/domain/admin/journeyStatus`.
 */
import { JOURNEY_STATUS_FILTERS } from '@travel-diary/domain/admin/journeyStatus'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { JourneyControls, JOURNEYS_PATH } from './JourneyControls'

const roots: Root[] = []

/**
 * Renders the controls and hands back the host element.
 * @param request - What the screen was asked for.
 * @returns The host element.
 */
const renderControls = (request: Parameters<typeof JourneyControls>[0]): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<JourneyControls search={request.search} filter={request.filter} />)
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('JourneyControls', () => {
  it('keeps what was typed in the box, because the search is an address and not a keystroke', () => {
    const host = renderControls({ search: 'bergen', filter: 'all' })

    expect(host.querySelector<HTMLInputElement>('input[name="q"]')?.value).toBe('bergen')
  })

  it('submits the search as a GET to the screen’s own address, so a reload keeps it', () => {
    const form = renderControls({ search: '', filter: 'all' }).querySelector('form')

    expect(form?.getAttribute('method')).toBe('get')
    expect(form?.getAttribute('action')).toBe(JOURNEYS_PATH)
  })

  it('draws one chip per filter the domain declares, in the domain’s own order', () => {
    const host = renderControls({ search: '', filter: 'all' })

    expect([...host.querySelectorAll('[data-chip]')].map((chip) => chip.getAttribute('data-chip'))).toEqual([
      ...JOURNEY_STATUS_FILTERS,
    ])
  })

  it('marks exactly one chip current, and it is the one the screen was given', () => {
    const host = renderControls({ search: '', filter: 'edited' })
    const current = host.querySelectorAll('[aria-current="page"]')

    expect(current).toHaveLength(1)
    expect(current[0]?.getAttribute('data-chip')).toBe('edited')
  })

  it('carries the search along in every chip’s address, so choosing a chip does not discard it', () => {
    const host = renderControls({ search: 'bergen', filter: 'all' })

    const addresses = [...host.querySelectorAll('[data-chip]')].map((chip) => chip.getAttribute('href') ?? '')
    expect(addresses.every((address) => address.includes('q=bergen'))).toBe(true)
    expect(addresses.find((address) => address.includes('filter=draft'))).toBe(`${JOURNEYS_PATH}?q=bergen&filter=draft`)
  })

  it('gives All the bare address, because a filter of everything is not a filter', () => {
    const host = renderControls({ search: '', filter: 'published' })

    expect(host.querySelector('[data-chip="all"]')?.getAttribute('href')).toBe(JOURNEYS_PATH)
  })

  it('keeps the current filter on the search form, so searching does not silently widen it', () => {
    // Without this the `GET` form would post `q` alone and drop `filter`, which
    // reads as the chip resetting itself the moment somebody types.
    const host = renderControls({ search: '', filter: 'draft' })

    expect(host.querySelector<HTMLInputElement>('form input[name="filter"]')?.value).toBe('draft')
    expect(renderControls({ search: '', filter: 'all' }).querySelector('form input[name="filter"]')).toBeNull()
  })
})
