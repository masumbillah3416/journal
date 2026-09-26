/**
 * ScreenHeader.test.tsx — the 96px header SCREENS.md §2 puts above every admin
 * screen, and the three widths it drops controls at.
 *
 * ═══ WHY THE WIDTHS ARE ASKED OF THE STYLESHEET AND NOT OF A PROP ═══
 *
 * The three numbers are a PAINT-TIME behaviour: SCREENS.md §2 writes "hidden
 * below 1040px", and a server render has never seen a viewport —
 * `packages/domain/src/readingSurface.ts`'s header is this repository's own
 * statement of that, and the diary pays for a client component to correct its
 * guess. The admin shell does not: it ships no client JavaScript at all, and
 * CLAUDE.md §6's 320KB ceiling is what this whole task exists to measure. So
 * the hiding is `shell.module.css`'s, and the header renders whatever it is
 * given.
 *
 * That leaves one number in TypeScript and the same number in CSS, which is
 * this repository's most repeated defect. So the pin below is executable: for
 * each control, the width the STYLESHEET hides it below is read off disk, and
 * `headerControls` is asked what it says at that width and one pixel above it.
 * Neither number is written in this file. A media query moved by a pixel fails
 * here, and so does a constant moved by a pixel.
 *
 * Depends on: node:fs, node:path, node:url, react, react-dom/client, vitest
 * (jsdom), ./ScreenHeader, `@travel-diary/domain/admin/breakpoints`,
 * `@travel-diary/domain/admin/navigation`.
 */
import { headerControls, type HeaderControls } from '@travel-diary/domain/admin/breakpoints'
import { ADMIN_NAV, type NavEntry } from '@travel-diary/domain/admin/navigation'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { draftJourneysChipLabel } from '@travel-diary/domain/admin/journeyStatus'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ScreenHeader } from './ScreenHeader'

const roots: Root[] = []

/** The stylesheet whose media queries are the other half of every pin below. */
const STYLESHEET = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'shell.module.css'), 'utf8')

/** The entry every render below draws the header for. */
const SCREEN: NavEntry = ADMIN_NAV[0] ?? {
  id: 'overview',
  label: 'Overview',
  subLabel: 'The desk',
  href: '/admin',
  section: 'overview',
}

/** Each droppable control's DOM name, beside the flag the domain answers for it. */
const CONTROLS: readonly { readonly control: string; readonly field: keyof HeaderControls }[] = [
  { control: 'saved', field: 'savedChip' },
  { control: 'unpublished', field: 'unpublishedChip' },
  { control: 'preview-draft', field: 'previewDraft' },
]

/**
 * The width at and below which `shell.module.css` hides one named control.
 *
 * Read out of the stylesheet rather than written down here — see this file's
 * header. Every hide rule is one `display: none` inside one `max-width` media
 * block, which is the shape this reads.
 * @param control - The control's `data-control` name.
 * @returns The largest width at which the stylesheet still hides it.
 * @throws When the stylesheet hides that control nowhere, which is the failure
 *   a deleted media query has to produce.
 */
const hiddenAtOrBelow = (control: string): number => {
  const pattern = new RegExp(
    String.raw`@media \(max-width: (\d+)px\) \{[^}]*\[data-control=['"]${control}['"]\][^}]*display: none`,
  )
  const found = pattern.exec(STYLESHEET)
  if (found?.[1] === undefined) throw new Error(`shell.module.css hides no control named ${control}`)
  return Number(found[1])
}

/** What {@link renderHeader} is asked; the header draws only what it is given. */
interface HeaderRequest {
  /** How many journeys are waiting to go out. */
  readonly unpublished: number
  /** What the "Saved just now" chip says, or `null` for a screen that saves nothing. */
  readonly savedAt: string | null
  /** Where "Preview draft" leads, or `null` for a screen with no draft. */
  readonly previewHref: string | null
}

/**
 * Renders the header and hands back the host element.
 * @param request - See {@link HeaderRequest}.
 * @returns The host element the header was rendered into.
 */
const renderHeader = ({ unpublished, savedAt, previewHref }: HeaderRequest): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <ScreenHeader
        screen={SCREEN}
        crumb="The back room"
        unpublished={unpublished}
        savedAt={savedAt}
        previewHref={previewHref}
      />,
    )
  })
  return host
}

/** A header drawn for a screen that has every control there is. */
const renderFullHeader = (): HTMLElement =>
  renderHeader({ unpublished: 7, savedAt: 'Saved just now', previewHref: '/p/1' })

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('ScreenHeader', () => {
  it('prints the crumb over the screen’s own title, taken from the entry it was given', () => {
    const host = renderFullHeader()

    expect(host.querySelector('[data-crumb]')?.textContent).toBe('The back room')
    expect(host.querySelectorAll('h1')).toHaveLength(1)
    expect(host.querySelector('h1')?.textContent).toBe(SCREEN.label)
  })

  it('draws every control a screen hands it, under the names the stylesheet hides', () => {
    const host = renderFullHeader()

    const drawn = CONTROLS.map(({ control }) => host.querySelector(`[data-control="${control}"]`) !== null)
    expect(drawn).toEqual([true, true, true])
  })

  it('counts the journeys that have never gone out, rather than printing a fixed word', () => {
    expect(renderHeader({ unpublished: 7, savedAt: null, previewHref: null }).textContent).toContain(
      draftJourneysChipLabel(7),
    )
    expect(renderHeader({ unpublished: 1, savedAt: null, previewHref: null }).textContent).toContain(
      draftJourneysChipLabel(1),
    )
  })

  it('says what the chip counts, so it cannot be read as the number the Publish screen prints', () => {
    // PUB-001 (`docs/deviations.md` §91): this chip and §2.8's headline count
    // DIFFERENT things and were both labelled as if they counted one — "1
    // unpublished" beside "4 changes waiting" on the same screen. Asserted
    // against the literal here rather than only against the domain function, so
    // a relabel that kept the ambiguous word fails at the surface a reader sees.
    const chip = renderHeader({ unpublished: 4, savedAt: null, previewHref: null }).querySelector(
      '[data-control="unpublished"]',
    )

    expect(chip?.textContent).toBe('4 journeys never published')
  })

  it('draws no control a screen did not hand it, so the shell invents no chrome', () => {
    const host = renderHeader({ unpublished: 0, savedAt: null, previewHref: null })

    const drawn = CONTROLS.map(({ control }) => host.querySelector(`[data-control="${control}"]`) !== null)
    expect(drawn).toEqual([false, false, false])
  })

  it('sends "Preview draft" to the address the screen named, not to one it made up', () => {
    const host = renderFullHeader()

    expect(host.querySelector('[data-control="preview-draft"]')?.getAttribute('href')).toBe('/p/1')
  })

  it('hides each control at exactly the width the domain drops it at, and not one pixel early', () => {
    // BOTH SIDES OF ALL THREE, derived: the stylesheet names the width, and
    // `headerControls` is asked at that width and one pixel above it. No
    // number in this case comes from this file.
    const pinned = CONTROLS.map(({ control, field }) => {
      const boundary = hiddenAtOrBelow(control)
      return {
        control,
        hiddenAt: headerControls(boundary)[field],
        shownJustAbove: headerControls(boundary + 1)[field],
      }
    })

    expect(pinned).toEqual(CONTROLS.map(({ control }) => ({ control, hiddenAt: false, shownJustAbove: true })))
  })
})
