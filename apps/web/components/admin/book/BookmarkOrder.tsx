/**
 * BookmarkOrder — SCREENS.md §2.6's bookmark list: "this is also the order of
 * the book".
 *
 * A SERVER COMPONENT, AND EVERY ARROW IS A `<form>`. `PageRail.tsx`'s shape one
 * screen over, for its reason: the button posts the WHOLE new sequence of
 * journey ids, computed here by the domain's own `moveBookmark`, so the server
 * never has to re-derive which row moved and `lib/admin/shellShipsNoClientJs.test.ts`
 * can keep judging this directory. No hook, no handler, no state.
 *
 * ═══ THE MOVE IS DECIDED BY THE DOMAIN, NOT BY THE MARKUP ═══
 *
 * `moveBookmark` (@travel-diary/domain/admin/bookmarkOrder) owns "Cover,
 * Contents and About are fixed and refuse to move", in both directions and at
 * both ends of the list. This file calls it once per arrow and renders the
 * answer; a row whose arrow would change nothing gets a `disabled` button
 * rather than a form that posts the order it already had.
 *
 * ═══ THE ARROWS ARE OFF ENTIRELY UNLESS THE BOOK IS ARRANGED BY HAND ═══
 *
 * // HANDOFF-DEVIATION: see `lib/admin/readBookScreen.ts`'s header and
 * `docs/deviations.md` §84. Under "Newest first" or "Oldest first" a press
 * would write `journeys.order`, which the book then ignores — so the buttons
 * are disabled and one line says why, rather than appearing to do nothing.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A list and two forms per row.
 *
 * INVARIANT — every enabled arrow posts EVERY journey of the book exactly once,
 * because `saveBookmarkOrder` refuses an order that is not a bijection onto
 * them. A future edit that posted only the moved row would be refused by the
 * write rather than silently renumbering half the book.
 * Depends on: react, `moveBookmark` (@travel-diary/domain/admin/bookmarkOrder),
 * `BookScreenView` (../../../lib/admin/readBookScreen), ./book.module.css.
 */
import { moveBookmark } from '@travel-diary/domain/admin/bookmarkOrder'
import type React from 'react'
import type { BookScreenView } from '../../../lib/admin/readBookScreen'
import styles from './book.module.css'

/** What SCREENS.md §2.6's bookmark list needs to draw itself. */
export interface BookmarkOrderProps {
  /** The list, in the order the book reads it, each row carrying its own page. */
  readonly rows: BookScreenView['rows']
  /** Whether the arrows do anything — see this module's header. */
  readonly arrangeable: boolean
  /** Writes the new order. Handed the whole sequence as repeated `journey` fields. */
  readonly setOrder: (form: FormData) => Promise<void>
}

/** One arrow's label and the direction it means. */
const ARROWS = [
  { direction: 'up', glyph: '↑', title: 'Move up' },
  { direction: 'down', glyph: '↓', title: 'Move down' },
] as const

/**
 * The journeys of the book, in the order one arrow would leave them.
 *
 * `null` when the move changes nothing — the domain refuses it, which is what
 * a fixed row and a journey beside one both produce — so the caller can draw a
 * disabled button instead of a form that would post the order it already had.
 * @param rows - The list as it stands.
 * @param id - The row whose arrow this is.
 * @param direction - Which arrow.
 * @returns The journey ids in their new order, or `null`.
 */
const orderAfter = (rows: BookScreenView['rows'], id: string, direction: 'up' | 'down'): readonly string[] | null => {
  const moved = moveBookmark(rows, id, direction)
  if (moved === rows) return null
  return moved.filter((row) => row.kind === 'journey').map((row) => row.id)
}

/**
 * Renders SCREENS.md §2.6's bookmark list.
 *
 * @param props - See {@link BookmarkOrderProps}.
 * @returns The card, its instruction and one row per page of the book.
 * @example
 * <BookmarkOrder rows={view.rows} arrangeable={view.arrangeable} setOrder={saveBookmarkOrder} />
 */
export const BookmarkOrder = ({ rows, arrangeable, setOrder }: BookmarkOrderProps): React.JSX.Element => (
  <section data-bookmark-order className={styles.card}>
    <div className={styles.cardHead}>
      <h2 className={styles.cardTitle}>Bookmark order</h2>
      <p className={styles.cardNote}>this is also the order of the book</p>
    </div>

    {!arrangeable && (
      <p data-arrange-locked className={styles.lockedNote}>
        The book is sorted by date, so these arrows are off. Choose “As arranged” to move a journey by hand.
      </p>
    )}

    <ul className={styles.rows}>
      {rows.map((row) => (
        <li key={row.id} data-bookmark-row={row.id} data-bookmark-kind={row.kind} className={styles.row}>
          <span aria-hidden="true" className={styles.grip}>
            ::
          </span>
          {/* A CUSTOM PROPERTY rather than `background` directly, which is the
           * shape `Cover.tsx` and `SignInShell.tsx` already use: the colour is
           * the one value an editor chooses, so it cannot live in the
           * stylesheet, and `book.module.css` still owns everything else about
           * the square. It is also the only spelling a jsdom case can read
           * back — a `background` is normalised to `rgb(...)` there. */}
          <span
            aria-hidden="true"
            className={styles.tint}
            style={{ '--td-bookmark-tint': row.tint } as React.CSSProperties}
          />
          <span data-bookmark-name className={styles.rowName}>
            {row.name}
          </span>
          <span className={styles.rowPlace}>{row.place}</span>
          <span className={styles.rowPage}>p. {row.pageNumber}</span>
          <span className={styles.rowArrows}>
            {ARROWS.map(({ direction, glyph, title }) => {
              const order = orderAfter(rows, row.id, direction)
              return (
                <form key={direction} action={setOrder}>
                  {/* THE WHOLE SEQUENCE, one hidden field per journey of the
                   * book. `saveBookmarkOrder` refuses anything that is not a
                   * bijection onto them, so a partial post is a refusal rather
                   * than half a renumbering. */}
                  {(order ?? []).map((journey) => (
                    <input key={journey} type="hidden" name="journey" value={journey} readOnly />
                  ))}
                  <button
                    type="submit"
                    data-bookmark-move={direction}
                    title={title}
                    aria-label={`${title}: ${row.name}`}
                    disabled={!arrangeable || order === null}
                    className={styles.arrow}
                  >
                    {glyph}
                  </button>
                </form>
              )
            })}
          </span>
        </li>
      ))}
    </ul>
  </section>
)
