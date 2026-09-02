/**
 * About.test.tsx — what the diary's closing page prints, and what it omits.
 *
 * jsdom performs no layout, so nothing here asserts a measurement — the
 * page's two columns, the portrait's rotation, the three stamps' angles and
 * the focal point's effect on the rendered crop are guarded in a real browser
 * by `e2e/about.spec.ts`, and its appearance by the visual baselines in
 * `e2e/visual.spec.ts`. What IS testable without layout is every decision the
 * component makes, and this page makes more of them than any other: five
 * fields of the `about` global, none of them `required: true`, each of which
 * an editor can clear independently.
 *
 * IT COVERS `PostageStamp` THROUGH THE PAGE rather than in its own file, for
 * the reason `Notes.test.tsx`'s header gives about its four sub-components:
 * the stamp has exactly one caller, every branch it has is reachable from
 * this page's own props, and a separate file would assert the same lines
 * twice while letting the page and its parts drift apart.
 *
 * The copy is asserted verbatim, not by regex. SCREENS.md's copy is final
 * (CLAUDE.md §9, Pass 3).
 * Depends on: react, react-dom/client, @travel-diary/domain, vitest (jsdom).
 */
import { anAboutContent, aPortrait } from '@travel-diary/domain/testing/factories'
import type { AboutContent } from '@travel-diary/domain/bookBundle'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { About } from './About'
import { DEFERRED_PHOTOGRAPH_SRC } from './deferredPhotograph'
import { ImageWindow } from './Photograph'

const roots: Root[] = []

/**
 * Renders the About page on leaf 0 and hands back the host element, with the
 * image window published the way `Book.tsx` publishes it.
 * @param content - The about global's content.
 * @param showDecorations - The book global's decorations flag.
 * @param loadsImages - Whether the window admits the leaf this page is on.
 * @returns The host element the page was rendered into.
 */
const renderAbout = (
  content: AboutContent = anAboutContent(),
  showDecorations = true,
  loadsImages = true,
): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <ImageWindow value={[loadsImages]}>
        <About content={content} showDecorations={showDecorations} leafIndex={0} />
      </ImageWindow>,
    )
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

describe('About — the colophon column', () => {
  it('prints "About" as the page’s level-one heading', () => {
    const host = renderAbout()

    expect(host.querySelector('h1')?.textContent).toBe('About')
  })

  it('keeps that heading even when every field of the about global is empty', () => {
    // The heading is the page's NAME, not editor content — and it is what
    // keeps axe's `page-has-heading-one` satisfied on a book whose `about`
    // global has never been filled in.
    const host = renderAbout({ portrait: undefined, paragraphs: [], kit: [], replyTo: '' })

    expect(host.querySelector('h1')?.textContent).toBe('About')
  })

  it('prints the "Colophon" eyebrow above it, verbatim', () => {
    const host = renderAbout()

    expect(host.textContent).toContain('Colophon')
  })

  it('prints every biography paragraph the global carries, in order', () => {
    const host = renderAbout(anAboutContent({ paragraphs: ['First paragraph.', 'Second paragraph.'] }))

    expect([...host.querySelectorAll('[data-about-paragraph]')].map((node) => node.textContent)).toEqual([
      'First paragraph.',
      'Second paragraph.',
    ])
  })

  it('prints no paragraphs at all rather than an empty one when the biography is cleared', () => {
    const host = renderAbout(anAboutContent({ paragraphs: [] }))

    expect(host.querySelectorAll('[data-about-paragraph]')).toHaveLength(0)
  })

  it('hides the rule under the heading from assistive technology, since it is a line', () => {
    const host = renderAbout()

    expect(host.querySelector('[data-about-rule]')?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('About — the portrait', () => {
  it('renders the portrait as a mount with its caption under it', () => {
    const host = renderAbout(
      anAboutContent({ portrait: aPortrait({ caption: 'Somewhere with bad coffee and a good window' }) }),
    )

    expect(host.querySelector('[data-mount="portrait"] figcaption')?.textContent).toBe(
      'Somewhere with bad coffee and a good window',
    )
  })

  it('applies the media item’s focal point as the portrait’s object-position', () => {
    // This is the one photograph in the book whose focal point comes from the
    // media item rather than from a `pages` slot — see `About.tsx`'s header.
    const host = renderAbout(anAboutContent({ portrait: aPortrait({ focalX: 34, focalY: 22 }) }))

    expect(host.querySelector<HTMLElement>('[data-mount="portrait"] img')?.style.objectPosition).toBe('34% 22%')
  })

  it('carries the media item’s alt text, so the portrait is described rather than skipped', () => {
    const host = renderAbout(anAboutContent({ portrait: aPortrait({ alt: 'The keeper of this diary' }) }))

    expect(host.querySelector('[data-mount="portrait"] img')?.getAttribute('alt')).toBe('The keeper of this diary')
  })

  it('withholds the portrait’s bytes while this leaf is outside the image window', () => {
    const host = renderAbout(anAboutContent(), true, false)

    expect(host.querySelector('[data-mount="portrait"] img')?.getAttribute('src')).toBe(DEFERRED_PHOTOGRAPH_SRC)
  })

  it('omits the mount entirely rather than drawing an empty one when no portrait is uploaded', () => {
    // Unlike the Notes page's ephemera slot, this mount is not load-bearing
    // layout: the kit block below it simply moves up.
    const host = renderAbout(anAboutContent({ portrait: undefined }))

    expect(host.querySelectorAll('[data-mount]')).toHaveLength(0)
  })

  it('tapes a washi strip to the portrait, and drops it when decorations are switched off', () => {
    expect(renderAbout().querySelectorAll('[data-decoration="washi"]')).toHaveLength(1)
    expect(renderAbout(anAboutContent(), false).querySelectorAll('[data-decoration="washi"]')).toHaveLength(0)
  })
})

describe('About — the kit list', () => {
  it('prints every kit line the global carries, in order, as a list', () => {
    const host = renderAbout(anAboutContent({ kit: ['One lens', 'Blue ink'] }))

    expect([...host.querySelectorAll('[data-kit] li')].map((node) => node.textContent)).toEqual([
      'One lens',
      'Blue ink',
    ])
  })

  it('omits the whole block, eyebrow included, when the kit list is cleared', () => {
    // An eyebrow with nothing under it is worse than no eyebrow.
    const host = renderAbout(anAboutContent({ kit: [] }))

    expect(host.querySelectorAll('[data-kit]')).toHaveLength(0)
    expect(host.textContent).not.toContain('Kit')
  })
})

describe('About — the reply-to footer', () => {
  it('prints the address under its own eyebrow', () => {
    const host = renderAbout(anAboutContent({ replyTo: 'hello@wanderings.travel' }))

    expect(host.textContent).toContain('Write to me')
    expect(host.querySelector('[data-reply-to]')?.textContent).toBe('hello@wanderings.travel')
  })

  it('omits the whole block, eyebrow included, when the address is cleared', () => {
    const host = renderAbout(anAboutContent({ replyTo: '' }))

    expect(host.querySelectorAll('[data-reply-to]')).toHaveLength(0)
    expect(host.textContent).not.toContain('Write to me')
  })

  it('prints the address as text rather than as a link, which SCREENS.md §1.6 gives it no behaviour for', () => {
    const host = renderAbout()

    expect(host.querySelectorAll('a')).toHaveLength(0)
  })
})

describe('About — the three mini stamps', () => {
  it('draws all three, with the country and value the design gives each', () => {
    const host = renderAbout()

    expect([...host.querySelectorAll('[data-stamp-face]')].map((node) => node.textContent)).toEqual([
      'NIPPON120',
      'CHILE600',
      'MAROC9.0',
    ])
  })

  it('draws none of them when the book global switches decorations off', () => {
    const host = renderAbout(anAboutContent(), false)

    expect(host.querySelectorAll('[data-stamp-face]')).toHaveLength(0)
  })

  it('hides them from assistive technology, since they are printed furniture', () => {
    const host = renderAbout()

    expect(
      [...host.querySelectorAll('[data-decoration="stamp"]')].map((node) => node.getAttribute('aria-hidden')),
    ).toEqual(['true', 'true', 'true'])
  })
})
