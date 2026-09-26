/**
 * ChangesCard — SCREENS.md §2.8's second card: "tick what goes out", then one
 * row per change with a 21px checkbox, the kind chip, the text over
 * "{location} · {when}", and Revert.
 *
 * NO DIRECTIVE, AND IT IS STILL PART OF A CLIENT ENTRY — `Headline.tsx`'s note,
 * for its reason: `PublishSelection.tsx` is the entry and this is compiled into
 * it.
 *
 * ═══ THE CHECKBOX IS A REAL CHECKBOX, AND IT IS THE FORM'S OWN BODY ═══
 *
 * Each row's input is `name="change" value={id}`, so the selection the button
 * publishes IS what the boxes are ticked to — there is no parallel list of
 * hidden fields to fall out of step with the ticks. It is `<input
 * type="checkbox">` under `accent-color` rather than a styled `<span>`, because
 * the tick, the role, the label association and the keyboard behaviour all
 * arrive with the element; a div would need all four re-implemented, which is
 * how §2.5's grip became two buttons (`docs/deviations.md` §78).
 *
 * ═══ REVERT IS A SUBMIT BUTTON, NOT A SECOND FORM ═══
 *
 * A `<form>` inside a `<form>` is invalid HTML and the browser drops the inner
 * one, so a per-row Revert cannot be its own form while the card lives inside
 * the publish form. It is a `<button formAction>` carrying `name="revert"` and
 * its own row's id instead — one body, two possible actions, and the action
 * that reads `revert` ignores the ticks entirely.
 *
 * ═══ A ROW WITH NOTHING BEHIND IT DRAWS NO REVERT ═══
 *
 * A journey or a page that has never been published has no earlier version to
 * go back to, so `revertChange` refuses it — and SCREENS.md §2.8 gives this
 * screen no error surface (`docs/deviations.md` §60), which would make that
 * refusal an unhandled Server Action error with nothing on screen. Those rows
 * are the ones whose tone is `added`, and their Revert is `disabled` with a
 * title saying why. The refusal STAYS in the write, because a `POST` can be
 * crafted without pressing anything.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A list, one control per row.
 *
 * INVARIANT — every row's checkbox and its Revert carry the SAME change id, so
 * a row cannot publish one change and revert another.
 * Depends on: react, `PendingChange` (@travel-diary/domain/admin/pendingChange),
 * ./publish.module.css.
 */
import type { PendingChange } from '@travel-diary/domain/admin/pendingChange'
import type React from 'react'
import styles from './publish.module.css'

/** What SCREENS.md §2.8's Changes card needs to draw itself. */
export interface ChangesCardProps {
  /** Everything waiting to go out, newest first. */
  readonly changes: readonly PendingChange[]
  /** The ids the author has UNticked. Everything else goes out. */
  readonly excluded: ReadonlySet<string>
  /** Called when a row's box is toggled. */
  readonly onToggle: (id: string) => void
  /** Discards one change. A submit button's `formAction`, not a nested form. */
  readonly revert: (form: FormData) => Promise<void>
}

/**
 * The colour each tone is drawn in.
 *
 * The prototype's own two, and both are already tokens: `added` is the
 * published green and `edited` is the amber §2.2's status pill prints an edited
 * journey in. Reusing them is what keeps one journey's chip on this screen and
 * its pill on the Journeys screen the same colour.
 */
const TONE_COLOUR: Readonly<Record<PendingChange['tone'], string>> = {
  added: 'var(--td-status-published)',
  edited: 'var(--td-status-edited)',
}

/**
 * Renders the Changes card.
 *
 * @param props - See {@link ChangesCardProps}.
 * @returns The header and one row per change, or one line when nothing waits.
 * @example
 * <ChangesCard changes={waiting} excluded={excluded} onToggle={toggle} revert={revertChange} />
 */
export const ChangesCard = ({ changes, excluded, onToggle, revert }: ChangesCardProps): React.JSX.Element => (
  <section data-publish-changes className={[styles.card, styles.changes].join(' ')}>
    <div className={styles.changesHead}>
      <h2 className={styles.eyebrow}>Changes in this draft</h2>
      <p className={styles.aside}>tick what goes out</p>
    </div>

    {changes.length === 0 ? (
      <p data-publish-empty className={styles.empty}>
        Everything you have written is already out. Nothing is waiting.
      </p>
    ) : (
      <ul className={styles.rows}>
        {changes.map((change) => {
          const included = !excluded.has(change.id)
          return (
            <li key={change.id} data-change-row={change.id} data-change-tone={change.tone} className={styles.row}>
              <input
                className={styles.tick}
                id={`change-${change.id}`}
                type="checkbox"
                name="change"
                value={change.id}
                checked={included}
                onChange={() => {
                  onToggle(change.id)
                }}
              />
              {/* A CUSTOM PROPERTY rather than `color` directly, the shape
               * `BookmarkOrder.tsx` already uses: the tone is the row's own
               * datum, and it is also the only spelling a jsdom case can read
               * back, since a `color` is normalised to `rgb(...)` there. */}
              <span
                data-change-chip
                className={styles.chip}
                style={{ '--td-chip-tone': TONE_COLOUR[change.tone] } as React.CSSProperties}
              >
                {change.tone}
              </span>

              <label className={styles.rowText} htmlFor={`change-${change.id}`}>
                <span
                  data-change-text
                  className={[styles.what, included ? '' : styles.whatExcluded].filter(Boolean).join(' ')}
                >
                  {change.text}
                </span>
                <span className={styles.where}>{`${change.location} · ${change.at}`}</span>
              </label>

              <button
                className={styles.revert}
                type="submit"
                formAction={revert}
                name="revert"
                value={change.id}
                disabled={change.tone === 'added'}
                title={
                  change.tone === 'added'
                    ? 'Nothing has been published yet, so there is nothing to go back to'
                    : 'Discard this change'
                }
              >
                Revert
              </button>
            </li>
          )
        })}
      </ul>
    )}
  </section>
)
