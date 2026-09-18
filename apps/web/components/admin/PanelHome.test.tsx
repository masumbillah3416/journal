/**
 * PanelHome.test.tsx — what `/admin` prints while Phase 4's screens are still
 * being built, and where its two controls go.
 *
 * THE ADDRESSES ARE THE POINT. This screen exists because the signed-in pane's
 * primary action pointed at an address nothing was mounted at, so a case here
 * that asserted only the copy would repeat the defect one link along. The two
 * controls are checked against the addresses this repository actually mounts:
 * the diary's cover, and the sign-out endpoint the signed-in pane posts to —
 * imported from that pane rather than re-typed, so the two cannot drift.
 *
 * Depends on: react, react-dom/client, vitest (jsdom), ./PanelHome,
 * ./SignedInStep.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { DIARY_PATH, PANEL_SCREENS, PANEL_STATUS, PanelHome } from './PanelHome'
import { SIGN_OUT_ENDPOINT } from './SignedInStep'

const roots: Root[] = []

/**
 * Renders the pane and hands back the host element.
 * @returns The host element the pane was rendered into.
 */
const renderPanel = (): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<PanelHome />)
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('PanelHome', () => {
  it('titles the pane under the shell’s own heading, never as a second level one', () => {
    const host = renderPanel()

    // Phase 4 Task 3 put `AdminShell` around this pane, and the shell's header
    // carries the screen's `<h1>`. A second one here is the defect
    // `e2e/a11y.spec.ts` reports, so both halves are asserted: the pane has its
    // heading, and it is not a level one.
    expect(host.querySelectorAll('h1')).toHaveLength(0)
    expect(host.querySelector('h2')?.textContent).toBe('Still being furnished')
  })

  it('prints "The back room" eyebrow above it', () => {
    expect(renderPanel().textContent).toContain('The back room')
  })

  it('says what is behind the door today, in the words docs/deviations.md §44 settled', () => {
    // PINNED TO THE LITERAL, not to `PANEL_STATUS`. Asserting the render
    // against the constant that produces it is an assertion that cannot fail:
    // an edit to the copy moves both halves together and the suite stays
    // green, which is exactly how a copy decision stops being reviewed.
    expect(renderPanel().textContent).toContain(
      'The editing screens are still being built. Everything the diary shows is already published.',
    )
    expect(PANEL_STATUS).toContain('still being built')
  })

  it('names what is coming, so a reader knows more than that something is missing', () => {
    const items = [...renderPanel().querySelectorAll('[data-admin-panel-screens] li')]

    expect(items.map((item) => item.textContent)).toEqual([...PANEL_SCREENS])
    expect(items).not.toHaveLength(0)
  })

  it('sends "Read the diary" to the cover, which is an address this repository mounts', () => {
    const link = renderPanel().querySelector('a')

    // `pagePath(0)` is the COVER and it is served at `/p/1`: the diary's page
    // numbering starts at 1 and the cover is its first leaf.
    expect(link?.getAttribute('href')).toBe('/p/1')
    expect(DIARY_PATH).toBe('/p/1')
  })

  it('posts the sign-out rather than linking it', () => {
    // A sign-out reachable by GET is one a prefetch, a crawler or an <img> on
    // another site can perform for a reader who never clicked it.
    const host = renderPanel()
    const button = host.querySelector('button[type="submit"]')

    expect(button?.textContent).toBe('Sign out and start again')
    expect(button?.closest('form')?.getAttribute('method')).toBe('post')
    expect(button?.closest('form')?.getAttribute('action')).toBe(SIGN_OUT_ENDPOINT)
  })

  it('offers exactly two ways on, so nothing on it is a control that does nothing', () => {
    // The defect this screen exists to close was a button pointing at an
    // address nothing served. A control here that led nowhere would be the
    // same defect, one screen along.
    const host = renderPanel()

    expect(host.querySelectorAll('a')).toHaveLength(1)
    expect(host.querySelectorAll('button')).toHaveLength(1)
  })

  it('renders no landmark of its own, because the shell around it owns the main region', () => {
    // It carried the `<main>` until Phase 4 Task 3 put `AdminShell` around it.
    // Two `<main>` elements in one document is the accessibility defect
    // `e2e/a11y.spec.ts` reports, and the shell's is the one that stays.
    expect(renderPanel().querySelectorAll('main')).toHaveLength(0)
    expect(renderPanel().querySelector('[data-admin-panel]')?.tagName).toBe('SECTION')
  })
})
