/**
 * TrashCard — SCREENS.md §2.10's one card: "Kept for thirty days", a count,
 * and a row per journey waiting to go.
 *
 * A SERVER COMPONENT, AND EACH BUTTON IS ITS OWN `<form>`. Two forms per row
 * rather than one with two submits: a `formAction` would work, and a row's two
 * buttons are Put back and Delete for good — the one destructive control in
 * the phase, which should not share a form with the control that undoes it.
 * `lib/admin/shellShipsNoClientJs.test.ts` judges this directory and admits no
 * island in it.
 *
 * ═══ IT BORROWS THE SETTINGS STYLESHEET ═══
 *
 * `../settings/settings.module.css`, whose header says why: the two screens
 * are one card each in the same visual family, and a second stylesheet holding
 * one card's rules would be a second file to keep in step for no separation
 * anybody can name. The rules it uses carry a `trash` prefix.
 *
 * ═══ NO CONFIRMATION STEP, AND THAT IS §2.10'S DESIGN ═══
 *
 * The design gives a terracotta ring and no dialogue, and a confirmation would
 * be a client island on a screen that otherwise ships nothing. What stands in
 * its place is server-side and stronger: `deleteJourneyForGood` refuses a
 * journey that is not in the trash, so the only rows this button can destroy
 * are rows the author has already thrown away once and has thirty days to put
 * back. `docs/deviations.md` §103 records it.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A card and a list.
 * Depends on: react, `TrashRow` (../../../lib/admin/readTrashScreen),
 * ../settings/settings.module.css.
 */
import type React from 'react'
import type { TrashRow } from '../../../lib/admin/readTrashScreen'
import styles from '../settings/settings.module.css'

/** What SCREENS.md §2.10's card needs to draw itself. */
export interface TrashCardProps {
  /** One row per journey in the trash, newest first. */
  readonly rows: readonly TrashRow[]
  /** Puts one back. Handed the row's form body. */
  readonly putBack: (form: FormData) => Promise<void>
  /** Removes one for good. Handed the row's form body. */
  readonly deleteForGood: (form: FormData) => Promise<void>
}

/**
 * The count §2.10 prints beside the header.
 * @param rows - How many journeys are waiting.
 * @returns The phrase, singular for one.
 */
const waiting = (rows: number): string => (rows === 1 ? '1 journey waiting' : `${String(rows)} journeys waiting`)

/**
 * Renders SCREENS.md §2.10's Trash card.
 *
 * @param props - See {@link TrashCardProps}.
 * @returns The card, with its empty state when there is nothing in it.
 * @example
 * <TrashCard rows={rows} putBack={putBack} deleteForGood={deleteForGood} />
 */
export const TrashCard = ({ rows, putBack, deleteForGood }: TrashCardProps): React.JSX.Element => (
  <section data-admin-trash className={[styles.card, styles.trashScreen].join(' ')}>
    <div className={styles.cardHead}>
      <h2 className={styles.cardTitle}>Kept for thirty days</h2>
      <span data-trash-count className={styles.cardNote}>
        nothing here is gone until you say so &middot; {waiting(rows.length)}
      </span>
    </div>

    {rows.length === 0 ? (
      <div data-trash-empty className={styles.trashEmpty}>
        <p className={styles.trashEmptyTitle}>Nothing thrown away</p>
        <p className={styles.trashEmptyLine}>
          Journeys you throw away wait here for thirty days, in case you want them back.
        </p>
      </div>
    ) : (
      <ul className={styles.trashRows}>
        {rows.map((row) => (
          // KEYED BY THE JOURNEY'S OWN ID, never by position (CLAUDE.md §0.9),
          // which is also what each form posts.
          <li key={row.id} data-trash-row={row.id} className={styles.trashRow}>
            {row.thumbSrc === null ? (
              <span
                data-trash-thumb-empty
                aria-hidden="true"
                className={[styles.trashThumb, styles.trashThumbEmpty].join(' ')}
              />
            ) : (
              // A plain `<img>` on a Payload derivative already sized for this
              // 46px square, exactly as the journeys table draws its covers:
              // `next/image` would put a second optimisation pass in front of
              // an image the media pipeline has already produced.
              <img
                data-trash-thumb
                src={row.thumbSrc}
                alt=""
                loading="lazy"
                decoding="async"
                className={styles.trashThumb}
              />
            )}

            <span className={styles.trashText}>
              <span data-trash-name className={styles.trashName}>
                {row.name}
              </span>
              <span data-trash-summary className={styles.trashSummary}>
                {row.summary}
              </span>
            </span>

            <span data-trash-countdown className={styles.trashCountdown}>
              {row.goesForGood}
            </span>

            <span className={styles.trashActions}>
              <form action={putBack}>
                <input type="hidden" name="journey" value={row.id} />
                <button type="submit" data-put-back={row.id} className={styles.save}>
                  Put back
                </button>
              </form>
              <form action={deleteForGood}>
                <input type="hidden" name="journey" value={row.id} />
                <button type="submit" data-delete-for-good={row.id} className={[styles.save, styles.danger].join(' ')}>
                  Delete for good
                </button>
              </form>
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
)
