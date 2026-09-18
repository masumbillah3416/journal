/**
 * JourneyTable.test.tsx — the table SCREENS.md §2.2 puts in one card, and the
 * four widths its columns appear at.
 *
 * ═══ WHY THE WIDTHS ARE ASKED OF THE STYLESHEET AND NOT OF A PROP ═══
 *
 * The same argument `ScreenHeader.test.tsx` makes, one screen along: a server
 * render has never seen a viewport, and the admin surface buys its CLAUDE.md §6
 * headroom by shipping no client JavaScript for chrome. So the dropping is
 * `journeys.module.css`'s, and the table renders every cell whatever the width.
 *
 * That leaves four numbers in TypeScript and the same four in CSS, which is
 * this repository's most repeated defect. The pin below reads the widths OFF
 * the stylesheet and asks `visibleJourneyColumns` what it says one pixel either
 * side of each. Neither number is written in this file.
 *
 * WHAT PRODUCED EACH SIDE OF THE ROW COUNT AND THE SUMMARY: the rows are a
 * factory's, and the assertions read the rendered DOM rather than the props —
 * a case comparing a prop against itself would pass for a component that
 * rendered nothing.
 *
 * Depends on: node:fs, node:path, node:url, react, react-dom/client, vitest
 * (jsdom), ./JourneyTable, `@travel-diary/domain/admin/journeyColumns`,
 * `@travel-diary/domain/ids`, `JourneyRow` (../../../lib/admin/readJourneysScreen).
 */
import { visibleJourneyColumns } from '@travel-diary/domain/admin/journeyColumns'
import { journeyId, type JourneyId } from '@travel-diary/domain/ids'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { JourneyRow } from '../../../lib/admin/readJourneysScreen'
import { JourneyTable, journeysSummary } from './JourneyTable'

const roots: Root[] = []

/** The stylesheet whose media queries are the other half of the ladder pin. */
const STYLESHEET = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'journeys.module.css'), 'utf8')

/**
 * A branded journey id.
 * @param raw - The id as Postgres would spell it.
 * @returns The branded id.
 */
const anId = (raw: string): JourneyId => {
  const built = journeyId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/**
 * One row, with every field stated and the interesting ones overridable.
 * @param overrides - What this case cares about.
 * @returns A complete {@link JourneyRow}.
 */
const aRow = (overrides: Partial<JourneyRow> = {}): JourneyRow => ({
  id: anId('7'),
  name: 'Seville',
  place: 'Spain',
  dates: '2 – 9 May 2025',
  pages: 3,
  media: 58,
  editedAt: '2 May 2025',
  status: 'published',
  coverSrc: '/api/media/file/seville-400x400.png',
  ...overrides,
})

/** What nothing in these cases does: the strip's forms are never submitted. */
const noAction = (): Promise<void> => Promise.resolve()

/**
 * Renders the table and hands back the host element.
 * @param rows - What to draw.
 * @returns The host element.
 */
const renderTable = (rows: readonly JourneyRow[]): HTMLElement => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(<JourneyTable rows={rows} duplicate={noAction} archive={noAction} trash={noAction} />)
  })
  return host
}

/**
 * The widths at which `journeys.module.css` changes the TABLE's shape.
 *
 * Read out of the stylesheet rather than written down — see this file's header.
 * CONTAINER queries, not media queries, and that is the subject rather than a
 * detail: the ladder is about the width the TABLE has, not the window's, which
 * is what the prototype measures too. Only the blocks that touch `.row` count —
 * SCREENS.md §2.2 gives the create panel a threshold of its own at 820px, which
 * is a different element and no part of the column ladder.
 * @returns Every such `min-width`, ascending, deduplicated.
 * @throws When the stylesheet declares none, which is the failure a deleted
 *   media query block has to produce rather than a silently empty comparison.
 */
const stylesheetWidths = (): readonly number[] => {
  const found = STYLESHEET.split('@container td-journeys-table (min-width: ')
    .slice(1)
    // Each piece runs to the next query, so this is the block's own body.
    .filter((block) => (block.split('@container')[0] ?? '').includes('.row'))
    .map((block) => Number(/^(\d+)px/.exec(block)?.[1]))
  if (found.length === 0) throw new Error('journeys.module.css declares no container query touching .row')
  return [...new Set(found)].sort((left, right) => left - right)
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
})

describe('JourneyTable', () => {
  it('draws one row per journey, addressed by id and never by position', () => {
    const host = renderTable([aRow({ id: anId('7') }), aRow({ id: anId('12'), name: 'Bergen' })])

    expect([...host.querySelectorAll('[data-journey-id]')].map((row) => row.getAttribute('data-journey-id'))).toEqual([
      '7',
      '12',
    ])
  })

  it('prints the name over the place and the status the row was given', () => {
    const host = renderTable([aRow({ name: 'Bergen', place: 'Norway', status: 'edited' })])

    expect(host.querySelector('[data-cell="name"]')?.textContent).toBe('BergenNorway')
    expect(host.querySelector('[data-cell="status"]')?.textContent).toBe('Edited')
  })

  it('draws the cover from the thumbnail it was handed, and an empty square when there is none', () => {
    const withCover = renderTable([aRow({ coverSrc: '/api/media/file/seville-400x400.png' })])
    const without = renderTable([aRow({ coverSrc: null })])

    expect(withCover.querySelector('[data-cell="thumb"]')?.getAttribute('style')).toContain('seville-400x400.png')
    expect(without.querySelector('[data-cell="thumb"]')?.getAttribute('style') ?? '').not.toContain('url(')
  })

  it('draws a cell for every column the table declares, so no heading is left without one', () => {
    // The headings and the cells are two lists in one file, and a grid whose
    // tracks outnumber its cells slides every row one column left.
    const host = renderTable([aRow()])
    const headings = [...host.querySelectorAll('[data-heading]')].map((cell) => cell.getAttribute('data-heading'))
    const cells = [...host.querySelectorAll('[data-journey-id] [data-cell]')].map((cell) =>
      cell.getAttribute('data-cell'),
    )

    expect(headings).toEqual([...visibleJourneyColumns(1400)])
    expect(cells).toEqual(headings)
  })

  it('keeps the row actions behind the ⋯ until it is pressed, which is the whole client island', () => {
    const host = renderTable([aRow({ name: 'Bergen' })])
    const more = host.querySelector<HTMLButtonElement>('[data-row-more]')

    expect(host.querySelector('[data-journey-strip]')).toBeNull()
    expect(more?.getAttribute('aria-expanded')).toBe('false')

    act(() => {
      more?.click()
    })

    expect(host.querySelector('[data-journey-strip]')).not.toBeNull()
    expect(host.querySelector('[data-row-more]')?.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('[data-journey-strip]')?.textContent).toContain('Move to trash')
  })

  it('offers Unarchive for a journey already on the shelf, and Archive for one that is not', () => {
    const shelved = renderTable([aRow({ status: 'archived' })])
    const live = renderTable([aRow({ status: 'published' })])
    act(() => {
      shelved.querySelector<HTMLButtonElement>('[data-row-more]')?.click()
      live.querySelector<HTMLButtonElement>('[data-row-more]')?.click()
    })

    expect(shelved.querySelector('[data-strip-archive]')?.textContent).toBe('Unarchive')
    expect(live.querySelector('[data-strip-archive]')?.textContent).toBe('Archive')
  })

  it('names the journey in every form the strip submits, so an action is never sent a row it did not open', () => {
    const host = renderTable([aRow({ id: anId('12') })])
    act(() => {
      host.querySelector<HTMLButtonElement>('[data-row-more]')?.click()
    })

    const named = [...host.querySelectorAll<HTMLInputElement>('[data-journey-strip] input[name="journey"]')]
    expect(named.length).toBeGreaterThan(0)
    expect(named.every((input) => input.value === '12')).toBe(true)
  })

  it('is a table to a screen reader, not a run of text per row', () => {
    // REVIEW ROUND 1, FINDING 8. axe was green over divs with no roles at all,
    // because axe judges the markup that is there rather than the markup that
    // is missing — so this asserts the structure directly. The strip is a row
    // of one cell rather than a div loose inside the table, which is what makes
    // the `rowgroup` legal.
    const host = renderTable([aRow(), aRow({ id: anId('12'), name: 'Bergen' })])
    act(() => {
      host.querySelector<HTMLButtonElement>('[data-row-more]')?.click()
    })

    expect(host.querySelector('[role="table"]')?.getAttribute('aria-label')).toBe('Journeys')
    expect(host.querySelectorAll('[role="table"] > [role="row"] > [role="columnheader"]')).toHaveLength(
      visibleJourneyColumns(1400).length,
    )
    expect(host.querySelectorAll('[role="table"] > [role="rowgroup"]')).toHaveLength(2)
    // One cell per column in the row itself, and the open strip is a row of
    // exactly one — which is what makes the `rowgroup` legal.
    expect(
      host.querySelectorAll('[data-journey-id="7"] > [role="row"]:not([data-journey-strip]) > [role="cell"]'),
    ).toHaveLength(visibleJourneyColumns(1400).length)
    expect(host.querySelectorAll('[data-journey-strip][role="row"] > [role="cell"]')).toHaveLength(1)
  })

  it('gives the two headings the design prints nothing in a name a screen reader can read', () => {
    // An empty `columnheader` leaves two cells per row nobody can place. The
    // text is clipped rather than labelled, because axe's `empty-table-header`
    // reads the header's subtree text and not its `aria-label` — measured.
    const host = renderTable([aRow()])
    const named = ['thumb', 'actions'].map(
      (column) => host.querySelector(`[data-heading="${column}"]`)?.textContent ?? '',
    )

    expect(named).toEqual(['Cover', 'Actions'])
  })

  it('says so when the filter has matched nothing, rather than drawing an empty card', () => {
    const host = renderTable([])

    expect(host.querySelectorAll('[data-journey-id]')).toHaveLength(0)
    expect(host.querySelector('[data-journeys-empty]')?.textContent).toBe('No journeys match that.')
  })

  it('is not a table at all when nothing matched, because an empty result is not one', () => {
    // FIX ROUND 2, FINDING 4. The `role="table"` was on the card whatever was
    // in it, so the empty state was a table owning a bare `<p>` — which an ARIA
    // table does not own, and which axe passed, because axe judges the markup
    // that is there. A reader filtering to Archived with nothing archived heard
    // "table, 1 row" and, on some assistive technology, nothing else.
    const empty = renderTable([])
    const filled = renderTable([aRow()])

    expect(empty.querySelector('[role="table"]')).toBeNull()
    expect(empty.querySelectorAll('[role="row"], [role="columnheader"], [role="cell"]')).toHaveLength(0)
    // The sentinel: the roles are still there when there is a table to be.
    expect(filled.querySelector('[role="table"]')).not.toBeNull()
  })

  it('changes shape at exactly the widths the domain names, and at no others', () => {
    // BOTH SIDES OF ALL FOUR, derived. The left is every `min-width` the
    // stylesheet declares; the right is every width at which the domain's
    // ladder gains a column, found by asking it rather than by listing them.
    const grows = [...Array.from({ length: 1200 }, (_, index) => index + 1)].filter(
      (width) => visibleJourneyColumns(width).length !== visibleJourneyColumns(width - 1).length,
    )

    expect(grows.length).toBeGreaterThan(0)
    expect(stylesheetWidths()).toEqual(grows)
  })

  it('puts the create panel’s fields three-up at SCREENS.md §2.2’s own 820px, and not before', () => {
    // REVIEW ROUND 1, FINDING 2. This threshold was left unpinned on the
    // argument that the visual baselines stood over it. They do not: the six
    // baselines see container widths of about 1142, 718 and 346, so ANY
    // replacement in (718, 1142] — including 880 and 1000, the two ladder rungs
    // a typo would most likely reach for — renders every one of them
    // identically. The reviewer changed it to 900 and all 47 Vitest cases
    // passed.
    //
    // ONE LITERAL, IN A TEST, CITING THE SECTION. It is not the abstraction
    // CLAUDE.md §4 forbids — no module, no export, no caller — and it is not
    // part of the column ladder, which is why it is asserted here rather than
    // folded into `stylesheetWidths`.
    const block = STYLESHEET.split('@container td-journeys-table (min-width: ')
      .slice(1)
      .find((piece) => (piece.split('@container')[0] ?? '').includes('.createFields'))

    expect(block, 'journeys.module.css has no container query that sets the create panel’s columns').toBeDefined()
    expect(Number(/^(\d+)px/.exec(block ?? '')?.[1])).toBe(820)
  })

  it('truncates every data cell, which is what stops one long date pushing the actions off the row', () => {
    // SCREENS.md §2.2: "monospace data cells (all truncating)". A rule read off
    // the stylesheet, because nothing in jsdom lays anything out.
    const rule = /\.dataCell \{([^}]*)\}/.exec(STYLESHEET)?.[1] ?? ''

    expect(rule).toContain('text-overflow: ellipsis')
    expect(rule).toContain('white-space: nowrap')
    expect(rule).toContain('overflow: hidden')
  })
})

describe('journeysSummary', () => {
  it('counts the entries and their pages, which is what the crumb above the title says', () => {
    expect(journeysSummary([aRow({ pages: 3 }), aRow({ id: anId('12'), pages: 4 })])).toBe('2 entries · 7 pages')
  })

  it('writes one entry and one page in the singular, because a crumb is a sentence', () => {
    expect(journeysSummary([aRow({ pages: 1 })])).toBe('1 entry · 1 page')
  })

  it('says none rather than printing a zero twice', () => {
    expect(journeysSummary([])).toBe('No entries')
  })
})
