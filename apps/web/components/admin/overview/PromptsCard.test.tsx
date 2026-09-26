/**
 * PromptsCard.test.tsx — SCREENS.md §2.1's "Needs a look": the terracotta
 * eyebrow, the 8px rotated square, the sentence and the action link.
 *
 * THE HREFS ARE READ AS HREFS. §2.1's bold rule is that these deep-link to the
 * exact screen AND selection, and a card that printed the action's WORDS while
 * dropping its query string would look perfect.
 * Depends on: react, react-dom/client, vitest (jsdom),
 * @travel-diary/domain/admin/prompts, ./PromptsCard.
 */
import type { Prompt } from '@travel-diary/domain/admin/prompts'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { PromptsCard } from './PromptsCard'

const roots: Root[] = []

/** Two prompts, so nothing here is a statement about a list of one. */
const TWO: readonly Prompt[] = [
  {
    kind: 'pick-posters',
    text: '2 clips in the Marrakech gallery have no poster frame chosen.',
    action: 'Pick posters',
    href: '/admin/galleries?journey=3&frame=41',
  },
  {
    kind: 'caption-them',
    text: 'Bergen has 6 uncaptioned frames in its gallery.',
    action: 'Caption them',
    href: '/admin/galleries?journey=9&captionAll=1&frame=12',
  },
]

/**
 * Renders the card and hands back the host element.
 * @param prompts - The rows to draw.
 * @returns The host element.
 */
const renderCard = (prompts: readonly Prompt[] = TWO): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<PromptsCard prompts={prompts} />)
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('PromptsCard', () => {
  it('draws one row per prompt, keyed by which request it is', () => {
    expect([...renderCard().querySelectorAll('[data-prompt]')].map((row) => row.getAttribute('data-prompt'))).toEqual([
      'pick-posters',
      'caption-them',
    ])
  })

  it('prints each prompt’s sentence', () => {
    expect(renderCard().querySelector('[data-prompt="caption-them"] [data-prompt-text]')?.textContent).toBe(
      'Bergen has 6 uncaptioned frames in its gallery.',
    )
  })

  it('links each action at the prompt’s own address, query string and all', () => {
    // NOT `toContain('/admin/galleries')`: the selection is the half §2.1 puts
    // in bold, and a card that dropped the query string would pass that.
    expect([...renderCard().querySelectorAll('[data-prompt-action]')].map((link) => link.getAttribute('href'))).toEqual(
      TWO.map((prompt) => prompt.href),
    )
  })

  it('prints each action’s own words, which is what a reader presses', () => {
    expect([...renderCard().querySelectorAll('[data-prompt-action]')].map((link) => link.textContent)).toEqual([
      'Pick posters',
      'Caption them',
    ])
  })

  it('gives every prompt the 8px mark §2.1 draws, hidden from a reader who cannot see it', () => {
    const marks = renderCard().querySelectorAll('[data-prompt-mark]')

    expect(marks).toHaveLength(2)
    expect([...marks].every((mark) => mark.getAttribute('aria-hidden') === 'true')).toBe(true)
  })

  it('says the diary is in good order when there is nothing to look at', () => {
    const host = renderCard([])

    expect(host.querySelectorAll('[data-prompt]')).toHaveLength(0)
    expect(host.querySelector('[data-prompts-empty]')?.textContent).toBe('Nothing needs a look. The diary is in order.')
  })
})
