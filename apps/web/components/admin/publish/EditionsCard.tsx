/**
 * EditionsCard — SCREENS.md §2.8's third card: rows of a 9px rotated mark, the
 * timestamp, the description and Restore.
 *
 * A SERVER COMPONENT, AND EVERY RESTORE IS A `<form>`. It sits OUTSIDE the
 * publish form — it is the screen's right-hand column — so each row can carry a
 * form of its own without nesting one, which is exactly what the Changes card
 * cannot do. No hook, no handler, no state, and
 * `lib/admin/shellShipsNoClientJs.test.ts` judges it as such.
 *
 * ═══ AN EDITION IS ONE JOURNEY'S PUBLISH, AND THERE IS NO "VIEW" ═══
 *
 * // HANDOFF-DEVIATION (docs/deviations.md §87, §88). §2.8 draws site-wide
 * editions — "Edition 14 — Patagonia gallery recaptioned, cover cloth changed"
 * — and gives each row View and Restore. Neither survives contact with this
 * data model: `DATA_MODEL.md` versions `journeys` and `pages` per row and keeps
 * no publish log, so an edition number and a summary of what it contained are
 * both invented; and the diary serves the PUBLISHED row at every address, so a
 * version that is not the published one has no address for View to lead to.
 * What is real is every published version of every journey, newest first, with
 * EACH JOURNEY'S newest marked live — which is what this draws, and Restore is
 * a real write that puts an older one back.
 *
 * ═══ EVERY LIVE EDITION'S RESTORE IS OFF, AND THERE IS ONE PER JOURNEY ═══
 *
 * Restoring the version a reader is already looking at writes a new version
 * identical to the live row, invalidates every path that journey occupies for
 * no change at all, AND makes the restored version the latest one — which
 * takes the journey's pending draft off the Changes card. The row is still
 * drawn, because it is the mark that says where the book is, with its control
 * disabled and a title saying why.
 *
 * THE FLAG IS PER JOURNEY, and this card believes it. It was computed over the
 * whole listing once, which drew nine of ten journeys' CURRENT editions as
 * restorable history with a title promising a change (review F1); the card was
 * right and the flag was lying. `readEditions` marks the first row of each
 * `parent` now, and `restoreEdition` refuses the same row, so a crafted `POST`
 * meets the refusal this control only draws.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A list and one form per row.
 * Depends on: react, `Edition` (../../../lib/admin/readPendingChanges),
 * ./publish.module.css.
 */
import type React from 'react'
import type { Edition } from '../../../lib/admin/readPendingChanges'
import styles from './publish.module.css'

/** What SCREENS.md §2.8's Editions card needs to draw itself. */
export interface EditionsCardProps {
  /** The editions, newest first; the first is the live one. */
  readonly editions: readonly Edition[]
  /** Puts an older edition back. Reads `edition` off the body. */
  readonly restore: (form: FormData) => Promise<void>
}

/**
 * Renders the Editions card.
 *
 * @param props - See {@link EditionsCardProps}.
 * @returns The card and one row per edition, or one line for a book that has
 *   never gone out.
 * @example
 * <EditionsCard editions={editions} restore={restoreOneEdition} />
 */
export const EditionsCard = ({ editions, restore }: EditionsCardProps): React.JSX.Element => (
  <section data-publish-editions className={[styles.card, styles.editions].join(' ')}>
    <h2 className={styles.editionsTitle}>Editions</h2>

    {editions.length === 0 ? (
      <p data-editions-empty className={styles.empty}>
        Nothing has gone out yet. The first publish starts the list.
      </p>
    ) : (
      <ul className={styles.rows}>
        {editions.map((edition) => (
          <li key={edition.id} data-edition-row={edition.id} className={styles.editionRow}>
            <span
              aria-hidden="true"
              data-edition-live={edition.live}
              className={[styles.mark, edition.live ? styles.markLive : ''].filter(Boolean).join(' ')}
            />
            <div className={styles.editionText}>
              <p className={styles.editionWhen}>{edition.at}</p>
              <p className={styles.editionWhat}>{edition.what}</p>
              <form action={restore}>
                <input type="hidden" name="edition" value={edition.id} />
                <button
                  className={styles.restore}
                  type="submit"
                  disabled={edition.live}
                  title={edition.live ? 'This is the edition readers are looking at' : 'Put this edition back'}
                >
                  Restore
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
)
