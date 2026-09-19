/**
 * PageRail.test.tsx — SCREENS.md §2.3's left column: the cards, the tool row the
 * selected one reveals, and what each arrow actually posts.
 *
 * ═══ WHAT THE ARROWS CARRY IS THE WHOLE POINT ═══
 *
 * The rail ships no JavaScript: each ↑ and ↓ is a form carrying the WHOLE new
 * sequence of page ids, computed here by the domain's `movePage` while the page
 * renders. So the cases below read that hidden value out of the DOM and compare
 * it against `movePage` asked directly — the left side is what React produced,
 * the right side is the domain module, and neither is a literal typed into this
 * file.
 *
 * WHAT PRODUCED THE FIXTURES: `aRailPage`, the domain's own factory, widened
 * with the `layout` the editor's view adds. A hand-built object would be a shape
 * `readJourneyEditor` does not produce.
 *
 * Depends on: react, react-dom/client, vitest (jsdom),
 * @travel-diary/domain/admin/pageRail, @travel-diary/domain/testing/factories,
 * @travel-diary/domain/ids, `EditorPage` (../../../lib/admin/readJourneyEditor),
 * ./PageRail.
 */
import { movePage } from '@travel-diary/domain/admin/pageRail'
import { journeyId, pageId, type JourneyId, type PageId } from '@travel-diary/domain/ids'
import { aRailPage } from '@travel-diary/domain/testing/factories'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { EditorPage } from '../../../lib/admin/readJourneyEditor'
import { PageRail } from './PageRail'

const roots: Root[] = []

/**
 * A branded journey id.
 * @param raw - The id as Postgres would spell it.
 * @returns The branded id.
 */
const aJourney = (raw: string): JourneyId => {
  const built = journeyId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/**
 * A branded page id.
 * @param raw - The id as Postgres would spell it.
 * @returns The branded id.
 */
const aPage = (raw: string): PageId => {
  const built = pageId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/**
 * One card's page, built from the domain's factory and given a layout.
 * @param id - The page's id.
 * @param order - Where it sits.
 * @param overrides - What this case cares about.
 * @returns A complete {@link EditorPage}.
 */
const anEditorPage = (id: string, order: number, overrides: Partial<EditorPage> = {}): EditorPage => ({
  ...aRailPage(id, order),
  layout: 'three-up',
  // The rail draws a card's name, its meta line and its tool row and reads
  // nothing else; an empty cell list is what a page with no photographs in it
  // really has, and a case that cares sets its own.
  slots: [],
  ...overrides,
})

/** What nothing in these cases does: no form here is ever submitted. */
const noAction = (): Promise<void> => Promise.resolve()

/** The three pages every case below starts from. */
const THREE: readonly EditorPage[] = [
  anEditorPage('5', 0, { title: 'Notes', kind: 'notes', layout: 'text-spread' }),
  anEditorPage('7', 1, { title: 'Frames I' }),
  anEditorPage('9', 2, { title: 'Frames II', layout: 'four-up' }),
]

/**
 * Renders the rail and hands back the host element.
 * @param pages - The rail's pages.
 * @param selected - Which card is open.
 * @returns The host element.
 */
const renderRail = (pages: readonly EditorPage[], selected: PageId | null): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(
      <PageRail
        journey={aJourney('42')}
        journeyName="Kyoto"
        pages={pages}
        selected={selected}
        reorder={noAction}
        copy={noAction}
        remove={noAction}
      />,
    )
  })
  return host
}

/**
 * What an arrow's form would post.
 * @param host - The rendered rail.
 * @param direction - Which arrow.
 * @returns The comma-separated sequence, or `undefined` when there is no arrow.
 */
const sequencePosted = (host: HTMLElement, direction: 'up' | 'down'): string | undefined =>
  host
    .querySelector(`[data-move="${direction}"]`)
    ?.closest('form')
    ?.querySelector<HTMLInputElement>('input[name="pages"]')?.value

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.innerHTML = ''
})

describe('PageRail', () => {
  it('draws one card per page, in the order it was given them', () => {
    const host = renderRail(THREE, aPage('7'))

    expect([...host.querySelectorAll('[data-page-id]')].map((card) => card.getAttribute('data-page-id'))).toEqual([
      '5',
      '7',
      '9',
    ])
  })

  it('names the journey in the eyebrow, which is what the column is for', () => {
    const host = renderRail(THREE, aPage('7'))

    expect(host.textContent).toContain('Pages in Kyoto')
  })

  it('reveals the tool row under exactly the selected card, and under no other', () => {
    const host = renderRail(THREE, aPage('7'))

    const tools = [...host.querySelectorAll('[data-page-tools]')]
    expect(tools).toHaveLength(1)
    expect(tools[0]?.closest('[data-page-id]')?.getAttribute('data-page-id')).toBe('7')
  })

  it('posts the sequence the domain says a move produces, not an instruction', () => {
    const host = renderRail(THREE, aPage('7'))

    // The right side is `movePage` asked directly. A rail that posted "page 7,
    // up" and let the server work it out would have nothing here to compare.
    expect(sequencePosted(host, 'up')).toBe(
      movePage(THREE, aPage('7'), 'up')
        .map((page) => page.id)
        .join(','),
    )
    expect(sequencePosted(host, 'down')).toBe(
      movePage(THREE, aPage('7'), 'down')
        .map((page) => page.id)
        .join(','),
    )
  })

  it('disables the arrow at the end of the rail rather than posting a move that does nothing', () => {
    const first = renderRail(THREE, aPage('5'))
    const last = renderRail(THREE, aPage('9'))

    expect(first.querySelector<HTMLButtonElement>('[data-move="up"]')?.disabled).toBe(true)
    expect(first.querySelector<HTMLButtonElement>('[data-move="down"]')?.disabled).toBe(false)
    expect(last.querySelector<HTMLButtonElement>('[data-move="up"]')?.disabled).toBe(false)
    expect(last.querySelector<HTMLButtonElement>('[data-move="down"]')?.disabled).toBe(true)
  })

  it('links each card to its own address, so selecting a page survives a reload', () => {
    const host = renderRail(THREE, aPage('7'))

    const links = [...host.querySelectorAll<HTMLAnchorElement>('[data-page-id] a')].map((link) =>
      link.getAttribute('href'),
    )
    expect(links).toEqual(['/admin/journeys/42?page=5', '/admin/journeys/42?page=7', '/admin/journeys/42?page=9'])
  })

  it('marks the selected card current for a screen reader, once', () => {
    const host = renderRail(THREE, aPage('9'))

    const current = [...host.querySelectorAll('[aria-current="page"]')]
    expect(current).toHaveLength(1)
    expect(current[0]?.closest('[data-page-id]')?.getAttribute('data-page-id')).toBe('9')
  })

  it('carries the page’s id in Copy and Delete, never its place', () => {
    const host = renderRail(THREE, aPage('7'))

    const copy = host.querySelector('[data-page-copy]')?.closest('form')
    const remove = host.querySelector('[data-page-delete]')?.closest('form')
    expect(copy?.querySelector<HTMLInputElement>('input[name="page"]')?.value).toBe('7')
    expect(remove?.querySelector<HTMLInputElement>('input[name="page"]')?.value).toBe('7')
  })

  it('disables Delete on a journey with one page, because that delete is refused', () => {
    // BOTH SIDES OF THE SAME BOUNDARY, in one case: one page refuses, two
    // permit. Disabled rather than absent, so the tool row keeps its width as
    // the selection moves — the treatment the arrows already get.
    const one = renderRail(THREE.slice(0, 1), aPage('5'))
    const two = renderRail(THREE.slice(0, 2), aPage('5'))

    expect(one.querySelector<HTMLButtonElement>('[data-page-delete]')?.disabled).toBe(true)
    expect(two.querySelector<HTMLButtonElement>('[data-page-delete]')?.disabled).toBe(false)
    expect(one.querySelector('[data-page-copy]')).not.toBeNull()
  })

  it('prints each page’s kind and layout in the meta line, in the design’s own words', () => {
    const host = renderRail(THREE, aPage('7'))

    const metas = [...host.querySelectorAll('[data-page-id]')].map((card) => card.textContent)
    expect(metas[0]).toContain('notes · Text spread')
    expect(metas[2]).toContain('frames · Four up')
  })

  it('prints the default layout for a page with none of its own, so the meta and the picker agree', () => {
    // A page created outside `pageMutations.ts` can have no `layout` column at
    // all. The picker still has to press a button, so both read `activeLayout`.
    const host = renderRail([anEditorPage('5', 0, { title: 'Notes', kind: 'notes', layout: null })], aPage('5'))

    expect(host.querySelector('[data-page-id]')?.textContent).toContain('notes · Text spread')
  })

  it('draws an empty rail rather than throwing for a journey with no pages', () => {
    const host = renderRail([], null)

    expect(host.querySelectorAll('[data-page-id]')).toHaveLength(0)
    expect(host.textContent).toContain('Pages in Kyoto')
  })
})
