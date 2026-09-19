/**
 * PageRail — SCREENS.md §2.3's left column: the "Pages in {journey}" eyebrow
 * and one card per page, the selected one revealing its tool row.
 *
 * A SERVER COMPONENT, AND THE ARROWS SHIP NO JAVASCRIPT. Each ↑ and ↓ is a
 * `<form action={…}>` carrying the WHOLE new sequence of page ids, computed
 * here by the domain's `movePage` while the rail is rendered. So the browser
 * posts an outcome rather than an instruction, the screen has no client island
 * at all, and the ordering rule is executed by
 * `packages/domain/src/admin/pageRail.test.ts` rather than by a click handler
 * nothing measures.
 *
 * SELECTION IS AN ADDRESS, NOT STATE. The card is a link to
 * `/admin/journeys/<id>?page=<page>`, for the reason the journeys screen's
 * status chips carry: it survives a reload, it can be sent to somebody, and it
 * costs no JavaScript.
 *
 * THE ENDS OF THE RAIL ARE DISABLED BUTTONS, NOT ABSENT ONES. `movePage`
 * answers the list it was given when a move cannot happen, so the two are
 * compared and the arrow is disabled when they match — asking the domain rather
 * than testing an index, which is CLAUDE.md §0.9 in the one place a component
 * could quietly reintroduce positions. Keeping them in the DOM keeps the tool
 * row the same width as the selection moves down it.
 *
 * HANDOFF-DEVIATION: DELETE IS DISABLED ON A ONE-PAGE JOURNEY. §2.3's tool row
 * is "↑ ↓ · spacer · Copy · Delete" unconditionally. `pageMutations.ts` refuses
 * that delete — the prototype's own `delPage` returns early on the same
 * condition — and a button whose only outcome is a thrown error is worse than
 * one that says it cannot act. DISABLED rather than absent, which is the
 * treatment the arrows already get at the ends of the rail and for the same
 * reason: the row keeps its width. Recorded in `docs/deviations.md` §57.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A list rendered, with the
 * shaping done by `readJourneyEditor` and the ordering by `movePage`.
 *
 * INVARIANT — every form carries page IDS, never indices (CLAUDE.md §0.9). The
 * rail is drawn from a sorted list, so an index would look right here and name
 * a different page the moment a second tab changed the journey.
 * Depends on: react, `movePage` (@travel-diary/domain/admin/pageRail),
 * `LAYOUT_LABELS` (@travel-diary/domain/admin/layoutGlyphs), `JourneyId`/`PageId`
 * (@travel-diary/domain/ids), `EditorPage` (../../../lib/admin/readJourneyEditor),
 * ./editor.module.css.
 */
import { LAYOUT_LABELS } from '@travel-diary/domain/admin/layoutGlyphs'
import { activeLayout, movePage, type MoveDirection } from '@travel-diary/domain/admin/pageRail'
import type { JourneyId, PageId } from '@travel-diary/domain/ids'
import type React from 'react'
import type { EditorPage } from '../../../lib/admin/readJourneyEditor'
import styles from './editor.module.css'

/** What the rail needs to draw itself and to let a card act. */
export interface PageRailProps {
  /** The journey being edited — every form carries it. */
  readonly journey: JourneyId
  /** Its name, which the eyebrow prints. */
  readonly journeyName: string
  /** The pages, ascending by `order`. */
  readonly pages: readonly EditorPage[]
  /** Which card is open, or `null` for a journey with no pages at all. */
  readonly selected: PageId | null
  /** Writes the whole new sequence of pages. */
  readonly reorder: (form: FormData) => Promise<void>
  /** Copies a page into the place after it. */
  readonly copy: (form: FormData) => Promise<void>
  /** Removes a page. */
  readonly remove: (form: FormData) => Promise<void>
}

/**
 * What the meta line under a card's name says.
 *
 * `activeLayout` rather than the column, so the meta and the picker cannot
 * disagree about a page with no layout of its own: the picker presses the
 * default, and this prints the same one.
 */
const metaOf = (page: EditorPage): string => `${page.kind} · ${LAYOUT_LABELS[activeLayout(page)]}`

/**
 * The sequence a move would produce, as a form value.
 * @param pages - The rail's pages.
 * @param id - The page whose arrow this is.
 * @param direction - Which arrow.
 * @returns The page ids in their new order, comma-separated.
 */
const sequenceAfter = (pages: readonly EditorPage[], id: PageId, direction: MoveDirection): string =>
  movePage(pages, id, direction)
    .map((page) => page.id)
    .join(',')

/**
 * One arrow: a form carrying the whole sequence the press would produce.
 *
 * DISABLED WHEN THE SEQUENCE DOES NOT CHANGE, which is what `movePage` answers
 * at the ends of the rail — the component never counts places itself.
 * @param props - The rail's pages, this page, the direction and the action.
 * @returns The arrow's form.
 */
const MoveForm = ({
  journey,
  pages,
  id,
  direction,
  reorder,
}: {
  readonly journey: JourneyId
  readonly pages: readonly EditorPage[]
  readonly id: PageId
  readonly direction: MoveDirection
  readonly reorder: (form: FormData) => Promise<void>
}): React.JSX.Element => {
  const sequence = sequenceAfter(pages, id, direction)
  const unchanged = sequence === pages.map((page) => page.id).join(',')

  return (
    <form action={reorder}>
      <input type="hidden" name="journey" value={journey} />
      <input type="hidden" name="pages" value={sequence} />
      <button
        type="submit"
        data-move={direction}
        disabled={unchanged}
        className={styles.tool}
        aria-label={direction === 'up' ? 'Move page up' : 'Move page down'}
      >
        {direction === 'up' ? '↑' : '↓'}
      </button>
    </form>
  )
}

/**
 * Renders SCREENS.md §2.3's page rail.
 *
 * @param props - See {@link PageRailProps}.
 * @returns The eyebrow and one card per page.
 * @example
 * <PageRail journey={id} journeyName="Kyoto" pages={pages} selected={page} … />
 */
export const PageRail = ({
  journey,
  journeyName,
  pages,
  selected,
  reorder,
  copy,
  remove,
}: PageRailProps): React.JSX.Element => (
  <nav data-page-rail aria-label="Pages" className={styles.rail}>
    <p className={styles.eyebrow}>Pages in {journeyName}</p>

    <ul className={styles.cards}>
      {pages.map((page) => (
        <li
          key={page.id}
          data-page-id={page.id}
          data-page-selected={page.id === selected ? '' : undefined}
          className={[styles.card, page.id === selected ? styles.cardSelected : ''].join(' ')}
        >
          <a
            href={`/admin/journeys/${journey}?page=${page.id}`}
            aria-current={page.id === selected ? 'page' : undefined}
            className={styles.cardLink}
          >
            <span className={styles.preview} />
            <span className={styles.cardText}>
              <span className={styles.cardName}>{page.title}</span>
              <span className={styles.cardMeta}>{metaOf(page)}</span>
            </span>
          </a>

          {page.id === selected ? (
            <div data-page-tools className={styles.tools}>
              <MoveForm journey={journey} pages={pages} id={page.id} direction="up" reorder={reorder} />
              <MoveForm journey={journey} pages={pages} id={page.id} direction="down" reorder={reorder} />
              <span className={styles.toolSpacer} />
              <form action={copy}>
                <input type="hidden" name="journey" value={journey} />
                <input type="hidden" name="page" value={page.id} />
                <button type="submit" data-page-copy className={styles.tool}>
                  Copy
                </button>
              </form>
              {/* HANDOFF-DEVIATION (docs/deviations.md §57): disabled on a
               * journey with one page, because `deletePageRow` refuses that
               * delete. See this module's header. */}
              <form action={remove}>
                <input type="hidden" name="journey" value={journey} />
                <input type="hidden" name="page" value={page.id} />
                <button type="submit" data-page-delete disabled={pages.length <= 1} className={styles.tool}>
                  Delete
                </button>
              </form>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  </nav>
)
