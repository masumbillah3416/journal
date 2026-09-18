'use client'

/**
 * CreatePanel — SCREENS.md §2.2's "New journey" button and the panel it opens.
 *
 * ═══ ONE BOOLEAN, AND `'use client'` ON LINE 1 ═══
 *
 * The panel's open state is the second of this screen's two client islands
 * (`RowActions` is the other). The directive is on line 1 by the repository's
 * own convention — `apps/web/lib/admin/shellShipsNoClientJs.test.ts` anchors
 * its pattern there and would not see one placed below a module header.
 *
 * WHY IT IS STATE AND NOT AN ADDRESS. The search and the five status chips on
 * this screen are `searchParams`, because each of them SELECTS something: they
 * survive a reload, they can be linked to, and they cost no JavaScript. "Am I
 * part-way through typing a new journey" is neither a selection nor an address
 * worth having in history, and putting it in the URL would mean a reload in the
 * middle of typing restored an empty form under a URL that claimed otherwise.
 *
 * THE FORM POSTS A SERVER ACTION AND HAS NO `action` ATTRIBUTE OF ITS OWN. The
 * action arrives as a prop rather than being imported here: a Server Action is
 * serialisable across this boundary, and a prop is what lets
 * `CreatePanel.test.tsx` render this without pulling a `'use server'` module —
 * and `getPayload` behind it — into jsdom. Everything it sends is `FormData`,
 * which is what a browser sends, and `createJourney` parses it with Zod at that
 * boundary (CLAUDE.md §3.1).
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One boolean and a form.
 *
 * INVARIANT — {@link CREATE_PANEL_PROMISE} is a promise about what
 * `createJourney` DOES. The action creates the journey as a draft; changing one
 * without the other makes the screen lie, which is why the string is exported
 * and asserted rather than typed inline.
 * Depends on: react, ./journeys.module.css.
 */
import type React from 'react'
import { useState } from 'react'
import styles from './journeys.module.css'

/**
 * The aside beside "A new journey", transcribed from SCREENS.md §2.2's panel.
 *
 * It states what `createJourney` does: three pages are created with the
 * journey, one `notes` and two `frames`, which is the shape SCREENS.md §2.3's
 * editor opens onto.
 */
export const CREATE_PANEL_NOTE = 'three pages are created — notes, then two of frames'

/**
 * The line under the panel's buttons, transcribed from SCREENS.md §2.2.
 *
 * The em dash is the design's own character. `createJourney` passes
 * `draft: true`, which is the half of this sentence a test can check.
 */
export const CREATE_PANEL_PROMISE = 'Starts as a draft — no bookmark until you publish.'

/** What the panel needs: the rest of the controls row, and somewhere to send what it collected. */
export interface CreatePanelProps {
  /**
   * The search form and the five status chips, rendered on the server.
   *
   * THIS COMPONENT OWNS THE WHOLE CONTROLS ROW, and that is a layout fact
   * rather than a growth of scope: SCREENS.md §2.2 puts "New journey" at the
   * end of the row and the panel BENEATH it, so the button and the panel are
   * not siblings. Holding the row here lets the two stay where the design puts
   * them while the island is still one boolean — and the search and the chips
   * pass straight through as server-rendered children, costing no JavaScript.
   */
  readonly children: React.ReactNode
  /** The Server Action that creates the journey. */
  readonly create: (form: FormData) => Promise<void>
}

/**
 * Renders the button, and the panel once it is open.
 *
 * @param props - See {@link CreatePanelProps}.
 * @returns The controls row, and the panel beneath it once it is open.
 * @example
 * <CreatePanel create={createJourney}><SearchAndChips /></CreatePanel>
 */
export const CreatePanel = ({ children, create }: CreatePanelProps): React.JSX.Element => {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className={styles.controls}>
        {children}
        <button
          type="button"
          data-create-open
          className={styles.newJourney}
          aria-expanded={open}
          onClick={() => {
            setOpen(true)
          }}
        >
          New journey
        </button>
      </div>

      {open ? (
        <div data-create-panel className={styles.createPanel}>
          <div className={styles.washi} aria-hidden="true" />

          <div className={styles.createHead}>
            <h2 className={styles.createTitle}>A new journey</h2>
            <p data-create-note className={styles.createNote}>
              {CREATE_PANEL_NOTE}
            </p>
          </div>

          <form action={create}>
            <div className={styles.createFields}>
              <label>
                <span className={styles.fieldLabel}>Where</span>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Kyoto"
                  className={[styles.fieldInput, styles.fieldInputWritten].join(' ')}
                />
              </label>
              <label>
                <span className={styles.fieldLabel}>Country</span>
                <input type="text" name="place" required placeholder="Japan" className={styles.fieldInput} />
              </label>
              <label>
                <span className={styles.fieldLabel}>Dates</span>
                <input
                  type="text"
                  name="dates"
                  required
                  placeholder="28 Oct – 6 Nov 2026"
                  className={[styles.fieldInput, styles.fieldInputData].join(' ')}
                />
              </label>
            </div>

            <div className={styles.createActions}>
              <button type="submit" className={styles.createSubmit}>
                Create journey
              </button>
              <button
                type="button"
                data-create-cancel
                className={styles.createCancel}
                onClick={() => {
                  setOpen(false)
                }}
              >
                Cancel
              </button>
              <span className={styles.createSpacer} />
              <p data-create-promise className={styles.createPromise}>
                {CREATE_PANEL_PROMISE}
              </p>
            </div>
          </form>
        </div>
      ) : null}
    </>
  )
}
