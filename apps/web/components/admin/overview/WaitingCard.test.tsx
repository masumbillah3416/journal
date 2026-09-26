/**
 * WaitingCard.test.tsx — SCREENS.md §2.1's "Waiting to go out": the washi
 * strip, "Review all", and one row per pending change.
 *
 * THE FIXTURE HOLDS BOTH TONES AND BOTH REVERT STATES, because a card drawn
 * from a single-tone list cannot disagree with itself: every reading would
 * agree with every other and none of them could disagree with the data
 * (standing order 14).
 * Depends on: react, react-dom/client, vitest (jsdom),
 * @travel-diary/domain/admin/pendingChange, @travel-diary/domain/ids,
 * ./WaitingCard.
 */
import type { PendingChange } from '@travel-diary/domain/admin/pendingChange'
import { journeyId, type JourneyId } from '@travel-diary/domain/ids'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WaitingCard } from './WaitingCard'

const roots: Root[] = []

/**
 * A branded journey for a fixture row.
 * @param raw - The row id.
 * @returns The branded id.
 */
const aJourney = (raw: string): JourneyId => {
  const built = journeyId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/** Two changes, one of each tone — see this file's header. */
const TWO: readonly PendingChange[] = [
  {
    id: 'journey:7',
    kind: 'journey',
    tone: 'edited',
    journey: aJourney('7'),
    slug: 'tokyo',
    text: 'Tokyo has been edited since it was published',
    location: 'Tokyo · journey',
    at: '26 Aug 2026',
  },
  {
    id: 'page:41',
    kind: 'page',
    tone: 'added',
    journey: aJourney('9'),
    slug: 'bergen',
    text: 'Frames I has never been published',
    location: 'Bergen · Frames I',
    at: '19 Aug 2026',
  },
]

/**
 * Renders the card and hands back the host element.
 * @param changes - The rows to draw.
 * @param revert - The write a Revert dispatches.
 * @returns The host element.
 */
const renderCard = (changes: readonly PendingChange[] = TWO, revert = vi.fn()): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<WaitingCard changes={changes} revert={revert} />)
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('WaitingCard', () => {
  it('draws one row per change, addressed by the change’s own id', () => {
    const host = renderCard()

    expect([...host.querySelectorAll('[data-waiting-row]')].map((row) => row.getAttribute('data-waiting-row'))).toEqual(
      ['journey:7', 'page:41'],
    )
  })

  it('prints each row’s text over its location and its timestamp', () => {
    const row = renderCard().querySelector('[data-waiting-row="journey:7"]')

    expect([
      row?.querySelector('[data-waiting-text]')?.textContent,
      row?.querySelector('[data-waiting-where]')?.textContent,
      row?.querySelector('[data-waiting-when]')?.textContent,
    ]).toEqual(['Tokyo has been edited since it was published', 'Tokyo · journey', '26 Aug 2026'])
  })

  it('gives the two tones two different chip colours, so the chip says something', () => {
    const host = renderCard()
    const tones = [...host.querySelectorAll<HTMLElement>('[data-waiting-chip]')].map((chip) =>
      chip.style.getPropertyValue('--td-chip-tone'),
    )

    expect(tones).toHaveLength(2)
    expect(new Set(tones).size).toBe(2)
  })

  it('prints the tone as the chip’s word', () => {
    expect([...renderCard().querySelectorAll('[data-waiting-chip]')].map((chip) => chip.textContent)).toEqual([
      'edited',
      'added',
    ])
  })

  it('withholds Revert on a change that has never been published, because there is nothing to go back to', () => {
    const host = renderCard()

    expect(
      [...host.querySelectorAll<HTMLButtonElement>('[data-waiting-revert]')].map((button) => button.disabled),
    ).toEqual([false, true])
  })

  it('sends "Review all" to the Publish screen, which is where the whole list lives', () => {
    expect(renderCard().querySelector('[data-waiting-review]')?.getAttribute('href')).toBe('/admin/publish')
  })

  it('carries the washi strip §2.1 puts on this card, hidden from a reader who cannot see it', () => {
    expect(renderCard().querySelector('[data-waiting-washi]')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('says so in a sentence when nothing is waiting, rather than drawing an empty list', () => {
    const host = renderCard([])

    expect(host.querySelectorAll('[data-waiting-row]')).toHaveLength(0)
    expect(host.querySelector('[data-waiting-empty]')?.textContent).toBe(
      'Everything you have written is already out. Nothing is waiting.',
    )
  })
})
