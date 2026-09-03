/**
 * Ribbon.test.tsx — the spine ribbon, as markup rather than as a picture.
 *
 * Almost everything that matters about the ribbon is CSS in a real layout
 * engine: it is 22px wide and a third of the page tall, it hangs 7px above the
 * board, and — the rule this task was told twice not to lose — it is
 * `pointer-events: none`, because it lies OVER the page and must never
 * intercept a click. jsdom performs no layout and no hit-testing, so it
 * cannot judge any of that; `e2e/chrome.spec.ts` hit-tests the real element in
 * a real browser, which is the only place that assertion means anything.
 *
 * What is left for jsdom is the one thing a browser test would be a slow way
 * to check: the ribbon is decoration, so it must carry no accessible name and
 * no text — a screen reader should not announce a strip of cloth.
 * Depends on: react, react-dom/client, vitest (jsdom).
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Ribbon } from './Ribbon'

const roots: Root[] = []

/** Renders the ribbon and hands back the element it drew. */
const renderRibbon = (): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<Ribbon />)
  })

  const ribbon = host.querySelector<HTMLElement>('[data-ribbon]')
  if (ribbon === null) throw new Error('the ribbon rendered no element carrying data-ribbon')
  return ribbon
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

describe('Ribbon', () => {
  it('publishes itself under a stable selector, so a browser test can hit-test it', () => {
    expect(renderRibbon().tagName).toBe('DIV')
  })

  it('carries no text, so a screen reader has nothing to announce', () => {
    expect(renderRibbon().textContent).toBe('')
  })

  it('is hidden from assistive technology, being decoration rather than content', () => {
    expect(renderRibbon().getAttribute('aria-hidden')).toBe('true')
  })
})
