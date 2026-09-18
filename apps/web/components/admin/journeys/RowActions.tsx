'use client'

/**
 * RowActions — one journey's row, and the strip SCREENS.md §2.2 hides behind
 * its `⋯`.
 *
 * ═══ THE ONLY CLIENT COMPONENT IN THE TABLE, AND IT HOLDS ONE BOOLEAN ═══
 *
 * `'use client'` is on LINE 1, which is a convention rather than a guarantee
 * and is therefore said out loud:
 * `apps/web/lib/admin/shellShipsNoClientJs.test.ts` anchors its pattern there
 * and every client component in this repository puts it there. A directive
 * below a module header would still be honoured by the bundler and would not be
 * seen by that guard — which does not scan this directory, but the convention is
 * the repository's and this file keeps it.
 *
 * The CELLS ARE RENDERED ON THE SERVER and arrive as `cells`. Only the wrapper,
 * the `⋯` and the strip are client-side, so the row's eight cells — the name,
 * the place, four monospace data cells and the pill — cost no JavaScript
 * however many journeys there are (CLAUDE.md §6's 320KB admin ceiling). The
 * strip is a sibling of the row rather than a child of the actions cell,
 * because §2.2 expands it "beneath the row" and the row is one CSS grid.
 *
 * THE STRIP'S THREE ACTIONS ARE FORMS, NOT HANDLERS. Each posts a Server
 * Action with the journey's id in a hidden field, so it works without this
 * component's JavaScript having loaded, and so the id an action receives is the
 * one the row was drawn for. The actions arrive as PROPS rather than being
 * imported: a Server Action is serialisable across this boundary and an
 * arbitrary closure is not, and a prop is what lets `JourneyTable.test.tsx`
 * render this without importing a `'use server'` module into jsdom.
 *
 * THE ROLES ARE THE OTHER HALF OF `JourneyTable`'s, and they only make sense
 * together: the card is a `table`, so each journey is a `rowgroup` holding the
 * `row` of cells and — when it is open — the strip, which is a `row` of one
 * cell rather than a div loose inside the table. See that module's header.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One boolean and a disclosure.
 *
 * INVARIANT — the button's `aria-expanded` and the strip's presence are the
 * same fact. A screen reader that is told the control is expanded and finds
 * nothing is worse served than one told nothing.
 * Depends on: react, `JourneyId` (@travel-diary/domain/ids), ./journeys.module.css.
 */
import type { JourneyId } from '@travel-diary/domain/ids'
import type React from 'react'
import { useState } from 'react'
import styles from './journeys.module.css'

/** What one row's disclosure needs to draw itself. */
export interface RowActionsProps {
  /** The journey this row is, which every form carries back. */
  readonly journey: JourneyId
  /** The journey's name, printed in the strip so the row is named while open. */
  readonly name: string
  /** Whether it is already on the archive shelf, which flips one label. */
  readonly archived: boolean
  /** Where Edit leads. */
  readonly editHref: string
  /** Where Gallery leads. */
  readonly galleryHref: string
  /** The row's own cells, rendered on the server. */
  readonly cells: React.ReactNode
  /** Copies the journey and its pages, always as drafts. */
  readonly duplicate: (form: FormData) => Promise<void>
  /** Puts it on the shelf, or takes it off. */
  readonly archive: (form: FormData) => Promise<void>
  /** Soft-deletes it — the row survives where the trash screen can find it. */
  readonly trash: (form: FormData) => Promise<void>
}

/**
 * Renders one row and its disclosure.
 *
 * @param props - See {@link RowActionsProps}.
 * @returns The row, and the strip when it is open.
 * @example
 * <RowActions journey={id} name="Seville" archived={false} editHref="…"
 *   galleryHref="…" cells={cells} duplicate={d} archive={a} trash={t} />
 */
export const RowActions = ({
  journey,
  name,
  archived,
  editHref,
  galleryHref,
  cells,
  duplicate,
  archive,
  trash,
}: RowActionsProps): React.JSX.Element => {
  const [open, setOpen] = useState(false)
  const stripId = `journey-strip-${journey}`

  return (
    <div className={styles.rowWrap} data-journey-id={journey} role="rowgroup">
      <div className={styles.row} role="row">
        {cells}
        <div className={styles.actions} role="cell" data-cell="actions">
          <a className={[styles.action, styles.actionPrimary].join(' ')} href={editHref}>
            Edit
          </a>
          <a className={styles.action} href={galleryHref}>
            Gallery
          </a>
          <button
            type="button"
            data-row-more
            className={styles.more}
            aria-expanded={open}
            aria-controls={stripId}
            aria-label={`More for ${name}`}
            onClick={() => {
              setOpen(!open)
            }}
          >
            {'⋯'}
          </button>
        </div>
      </div>

      {open ? (
        <div id={stripId} data-journey-strip className={styles.strip} role="row">
          {/* One cell spanning the strip: a `rowgroup` owns rows, and a row owns
              cells, so the strip is a row of one rather than a div loose inside
              the table (review round 1, finding 8). */}
          <div role="cell" className={styles.stripCell}>
            <span className={styles.stripName}>{name}</span>
            <span className={styles.stripSpacer} />

            <form action={duplicate}>
              <input type="hidden" name="journey" value={journey} />
              <button type="submit" className={styles.stripAction}>
                Duplicate
              </button>
            </form>

            <form action={archive}>
              <input type="hidden" name="journey" value={journey} />
              <button type="submit" data-strip-archive className={styles.stripAction}>
                {archived ? 'Unarchive' : 'Archive'}
              </button>
            </form>

            <form action={trash}>
              <input type="hidden" name="journey" value={journey} />
              <button type="submit" className={styles.stripDanger}>
                Move to trash
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
