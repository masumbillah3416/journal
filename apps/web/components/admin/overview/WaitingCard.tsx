/**
 * WaitingCard — SCREENS.md §2.1's "Waiting to go out": a washi strip, a header
 * with "Review all", and one row per pending change with its kind chip, its
 * text over its location, a timestamp and Revert.
 *
 * ═══ IT IS THE PUBLISH SCREEN'S OWN LIST, NOT A SECOND ONE ═══
 *
 * The rows are `readPendingChanges`' {@link PendingChange}s, unchanged — the
 * same module `/admin/publish` reads, called once by `readOverview`. Two
 * screens counting the same thing differently is the defect `journeyStatus.ts`
 * was written to avoid, and `readOverview.integration.test.ts` asserts the two
 * answers are the same list.
 *
 * ═══ EACH REVERT IS ITS OWN `<form>`, AND THAT IS THE DIFFERENCE FROM §2.8 ═══
 *
 * On the Publish screen the Changes card lives INSIDE the publish form, so a
 * per-row Revert has to be a `<button formAction>` — and its row id cannot
 * travel in `name`/`value`, because React uses the submitter's own `name` and
 * `value` to carry a Server Action's id (`ChangesCard.tsx`, measured). Nothing
 * on this screen submits a selection, so each row's Revert is a `<form>` with
 * the id BOUND into its action. No island, no nesting, and the id cannot be
 * overwritten because it never crosses the wire.
 *
 * A ROW WITH NOTHING BEHIND IT DRAWS A DISABLED REVERT. A change whose tone is
 * `'added'` has never been published, so there is no earlier version to go back
 * to and `revertChange` refuses it. `overview.module.css` carries the
 * `:disabled` arm — without one, a control that can do nothing paints and
 * behaves exactly like a live one (`docs/deviations.md` §92).
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A card and a list.
 * Depends on: react, `PendingChange`
 * (@travel-diary/domain/admin/pendingChange), ./overview.module.css.
 */
import type { PendingChange } from '@travel-diary/domain/admin/pendingChange'
import type React from 'react'
import styles from './overview.module.css'

/** What the card draws. */
export interface WaitingCardProps {
  /** Everything waiting to go out, newest first. */
  readonly changes: readonly PendingChange[]
  /** Discards one change; the row binds its own id into it. */
  readonly revert: (id: string) => Promise<void>
}

/** Where "Review all" leads: the screen that owns the whole list. */
const PUBLISH_PATH = '/admin/publish'

/**
 * The chip's colour per tone.
 *
 * `ChangesCard.tsx`'s table, deliberately the same two tokens: the two screens
 * draw one datum, so an `added` row must not be one colour here and another
 * there. What differs is the RING's alpha, which §2.1 puts at 55% and §2.8
 * leaves full — that difference lives in the two stylesheets, where it is a
 * property of the card rather than of the change.
 */
const TONE_COLOUR: Readonly<Record<PendingChange['tone'], string>> = {
  added: 'var(--td-status-published)',
  edited: 'var(--td-status-edited)',
}

/**
 * Renders SCREENS.md §2.1's "Waiting to go out" card.
 *
 * @param props - See {@link WaitingCardProps}.
 * @returns The header and one row per change, or one line when nothing waits.
 * @example
 * <WaitingCard changes={view.waiting} revert={revertOneChange} />
 */
export const WaitingCard = ({ changes, revert }: WaitingCardProps): React.JSX.Element => (
  <section data-overview-waiting className={styles.card}>
    <span data-waiting-washi aria-hidden="true" className={styles.washi} />

    <div className={styles.cardHead}>
      <h2 className={styles.cardTitle}>Waiting to go out</h2>
      <a data-waiting-review className={styles.reviewAll} href={PUBLISH_PATH}>
        Review all
      </a>
    </div>

    {changes.length === 0 ? (
      <p data-waiting-empty className={styles.empty}>
        Everything you have written is already out. Nothing is waiting.
      </p>
    ) : (
      <ul className={styles.rows}>
        {changes.map((change) => (
          // KEYED BY THE CHANGE'S OWN ID, never by position (CLAUDE.md §0.9).
          <li key={change.id} data-waiting-row={change.id} data-waiting-tone={change.tone} className={styles.row}>
            <span
              data-waiting-chip
              className={styles.chip}
              style={{ '--td-chip-tone': TONE_COLOUR[change.tone] } as React.CSSProperties}
            >
              {change.tone}
            </span>

            <span className={styles.rowText}>
              <span data-waiting-text className={styles.what}>
                {change.text}
              </span>
              <span data-waiting-where className={styles.where}>
                {change.location}
              </span>
            </span>

            {/* THE TIMESTAMP AND REVERT TRAVEL TOGETHER, so that when the row
                is too narrow to hold everything on one line they wrap as a
                pair rather than squeezing the change text between them
                (OVR-002, `docs/qa/2026-09-26-overview-sweep.md`). */}
            {/* A `<div>` rather than a `<span>`: it holds a `<form>`, which is
                flow content and cannot be nested inside phrasing content. */}
            <div className={styles.rowMeta}>
              <span data-waiting-when className={styles.when}>
                {change.at}
              </span>

              <form className={styles.revertForm} action={revert.bind(null, change.id)}>
                <button
                  data-waiting-revert
                  className={styles.revert}
                  type="submit"
                  disabled={change.tone === 'added'}
                  title={
                    change.tone === 'added'
                      ? 'Nothing has been published yet, so there is nothing to go back to'
                      : 'Discard this change'
                  }
                >
                  Revert
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
)
