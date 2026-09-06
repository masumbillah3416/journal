/**
 * SignInShell.test.tsx — what the sign-in screen's frame prints, and what it
 * leaves out.
 *
 * The copy is asserted verbatim against SCREENS.md §3 and the handoff's own
 * login prototype (`Travel Diary Login.dc.html`): "Travel Diary", the book's
 * fitted name, its subtitle, "The back room", and the "PRIVATE / 01" stamp.
 * The two fitted sizes are asserted as NUMBERS rather than as "some size",
 * because a title that silently fell back to a stylesheet default is exactly
 * what this component's one computed value exists to prevent.
 *
 * THE HEADING CASE IS THE ONE THAT WOULD OTHERWISE ROT. Both cloth blocks
 * print the book's name, and the obvious way to write either is as an `<h1>`
 * or an `<h2>`. Either would collide with the pane's own `<h1>` and produce a
 * real axe finding on a screen this phase is required to keep axe-clean, so
 * the absence of a heading here is asserted rather than left to a comment.
 * Depends on: react, react-dom/client, vitest (jsdom), ./SignInShell.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { SignInShell, type SignInShellProps } from './SignInShell'

const roots: Root[] = []

/** The seeded `book` global's own cover fields (`apps/web/scripts/seed-data.ts`). */
const SEEDED_BOOK: SignInShellProps['book'] = {
  title: 'Wanderings',
  subtitle: 'field notes, photographs and other scraps',
  coverCloth: '#2f4a47',
}

/**
 * Renders the shell around a recognisable pane and hands back the host.
 * @param book - Fields to override on the seeded book.
 * @returns The host element the shell was rendered into.
 */
const renderShell = (book: Partial<SignInShellProps['book']> = {}): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <SignInShell book={{ ...SEEDED_BOOK, ...book }}>
        <p data-test-pane>the pane</p>
      </SignInShell>,
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

describe('SignInShell', () => {
  it('is the route’s main landmark, so nothing on the screen sits outside one', () => {
    const host = renderShell()

    expect(host.querySelectorAll('main')).toHaveLength(1)
    expect(host.querySelector('main')?.querySelector('[data-sign-in-shell]')).not.toBeNull()
  })

  it('draws the step it is given inside the form panel', () => {
    expect(renderShell().querySelector('[data-test-pane]')?.textContent).toBe('the pane')
  })

  it('paints both cloth blocks in the cloth colour the editor chose', () => {
    const shell = renderShell({ coverCloth: '#7a3b32' }).querySelector<HTMLElement>('[data-sign-in-shell]')

    expect(shell?.style.getPropertyValue('--sign-in-cloth')).toBe('#7a3b32')
  })

  it('names the product above the book on the cloth panel', () => {
    expect(renderShell().querySelector('[data-sign-in-cloth-eyebrow]')?.textContent).toBe('Travel Diary')
  })

  it('prints the book’s name on the cloth panel at the size it fits', () => {
    const title = renderShell().querySelector<HTMLElement>('[data-sign-in-cloth-title]')

    expect(title?.textContent).toBe('Wanderings')
    expect(title?.style.fontSize).toBe('75px')
  })

  it('prints the book’s name on the narrow masthead at its own smaller fitted size', () => {
    const title = renderShell().querySelector<HTMLElement>('[data-sign-in-masthead-title]')

    expect(title?.textContent).toBe('Wanderings')
    expect(title?.style.fontSize).toBe('44px')
  })

  it('prints the book’s subtitle under its name', () => {
    expect(renderShell().querySelector('[data-sign-in-cloth-subtitle]')?.textContent).toBe(
      'field notes, photographs and other scraps',
    )
  })

  it('closes both cloth blocks with the line that says which door this is', () => {
    const host = renderShell()

    expect(host.querySelector('[data-sign-in-cloth-footer]')?.textContent).toBe('The back room')
    expect(host.querySelector('[data-sign-in-masthead]')?.textContent).toContain('The back room')
  })

  it('stamps the cloth panel PRIVATE 01', () => {
    const stamp = renderShell().querySelector('[data-sign-in-stamp]')

    expect(stamp?.textContent).toBe('PRIVATE01')
    expect(stamp?.getAttribute('aria-hidden')).toBe('true')
  })

  it('prints no heading of its own, so the pane owns the screen’s only level one', () => {
    const host = renderShell()

    expect(host.querySelector('[data-sign-in-cloth]')?.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull()
    expect(host.querySelector('[data-sign-in-masthead]')?.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull()
  })

  it('omits the book’s name from both blocks when an editor has cleared it', () => {
    const host = renderShell({ title: '' })

    expect(host.querySelector('[data-sign-in-cloth-title]')).toBeNull()
    expect(host.querySelector('[data-sign-in-masthead-title]')).toBeNull()
    // The rest of the block still prints: an empty title is an editorial
    // state, not a broken screen.
    expect(host.querySelector('[data-sign-in-cloth-eyebrow]')?.textContent).toBe('Travel Diary')
  })

  it('omits the subtitle when an editor has cleared it', () => {
    expect(renderShell({ subtitle: '' }).querySelector('[data-sign-in-cloth-subtitle]')).toBeNull()
  })
})
