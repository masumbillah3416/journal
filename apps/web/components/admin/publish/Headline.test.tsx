/**
 * Headline.test.tsx — what SCREENS.md §2.8's first card prints, and the one
 * control it has.
 *
 * THE LABEL IS NOT RE-DERIVED HERE. `publishButtonLabel`'s own suite owns which
 * words the button reads; this file asserts that the card prints the string it
 * was handed and nothing else — which is what makes "the label is decided in
 * one place" true rather than claimed.
 *
 * THE MISSING CONTROL IS ASSERTED, NOT OMITTED. §2.8 puts "Preview draft"
 * beside the primary button and this card draws none, because the diary serves
 * published rows only and there is no address at which a draft can be seen
 * (`docs/deviations.md` §88). A case counts the controls, so a later task that
 * adds one has to change this file rather than quietly widening the card.
 * Depends on: react, react-dom/client, vitest (jsdom), ./Headline.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Headline, PUBLISH_NOTE } from './Headline'

const roots: Root[] = []

/**
 * Renders the card and hands back the host element.
 * @param props - What the card is drawn from.
 * @returns The host element.
 */
const renderCard = (props: { headline?: string; label?: string; inert?: boolean } = {}): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <Headline
        headline={props.headline ?? '4 changes waiting'}
        label={props.label ?? 'Publish all 4'}
        inert={props.inert ?? false}
      />,
    )
  })
  return host
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('Headline', () => {
  it('prints the headline it was handed as the card’s own heading', () => {
    const host = renderCard({ headline: '1 change waiting' })

    expect(host.querySelector('[data-publish-count]')?.textContent).toBe('1 change waiting')
  })

  it('prints §2.8’s line about what readers can see, in its own words', () => {
    // PINNED TO THE LITERAL, not to `PUBLISH_NOTE`: asserting the render
    // against the constant that produces it is an assertion that cannot fail,
    // because an edit moves both halves together.
    const host = renderCard()

    expect(host.textContent).toContain('Nothing below is visible to readers until you publish.')
  })

  it('exports that line as a constant, so the copy has one home', () => {
    expect(PUBLISH_NOTE).toBe('Nothing below is visible to readers until you publish.')
  })

  it('prints the button’s label exactly as it was given, deciding none of it', () => {
    const host = renderCard({ label: 'Publish 2 of 4' })

    expect(host.querySelector('[data-publish-now]')?.textContent).toBe('Publish 2 of 4')
  })

  it('submits the form it sits in, rather than carrying an action of its own', () => {
    // The card is inside `PublishSelection`'s `<form action={publish}>`, so the
    // button is a plain submit — which is also what makes the Revert buttons'
    // `formAction` the exception rather than the pattern.
    const host = renderCard()

    expect(host.querySelector('[data-publish-now]')?.getAttribute('type')).toBe('submit')
  })

  it('leaves the button live while anything is ticked', () => {
    const host = renderCard({ inert: false })

    expect(host.querySelector<HTMLButtonElement>('[data-publish-now]')?.disabled).toBe(false)
  })

  it('goes inert when nothing is ticked, so a press cannot publish nothing', () => {
    // BOTH SIDES OF THE ONE STATE §2.8 NAMES. The muted ring and `#8f836d` are
    // the stylesheet's, keyed off `:disabled`, so this is the property that
    // carries them — and `e2e/admin.spec.ts` reads the colour in a real engine.
    const host = renderCard({ inert: true })

    expect(host.querySelector<HTMLButtonElement>('[data-publish-now]')?.disabled).toBe(true)
  })

  it('draws the washi strip out of the accessibility tree, because it says nothing', () => {
    const host = renderCard()

    expect(host.querySelector('[data-washi]')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('offers exactly the one control §2.8 gives it here, and no "Preview draft"', () => {
    // docs/deviations.md §88: there is no address at which a draft can be seen,
    // so a second control would go somewhere that shows the published book.
    const host = renderCard()

    expect(host.querySelectorAll('button')).toHaveLength(1)
    expect(host.querySelectorAll('a')).toHaveLength(0)
  })
})
