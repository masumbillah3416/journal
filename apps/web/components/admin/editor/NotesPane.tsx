/**
 * NotesPane — SCREENS.md §2.3's editing pane for a Notes page: the field grid,
 * Highlights, The note, Tally, and the Page furniture block beneath a rule.
 *
 * ═══ THE WHOLE PANE IS ONE `<form>`, AND EVERY CONTROL IN IT IS A SUBMIT ═══
 *
 * THIS PANE ships no client JavaScript — `lib/admin/shellShipsNoClientJs.test.ts`
 * judges this directory and fails on the commit that adds a `'use client'`
 * outside its allowlist, which since Task 7 holds exactly one file, `SlotPanel`
 * (§2.3's focal formula needs a measured element). So
 * "Add highlight", each `×` and each half of a `::` grip is a `<button
 * type="submit" name="op">` in the SAME form as the fields. Pressing one posts
 * everything the author has typed along with the instruction, and
 * `lib/admin/notesMutations.ts` applies the instruction to that list before it
 * writes. A control with an action of its own would have thrown away every
 * unsaved keystroke on the page as the price of removing one line.
 *
 * That is also where the four-line cap is enforced: `addHighlight` refuses a
 * fifth on the server, so this file draws "Add highlight" unconditionally rather
 * than hiding a button whose absence would be the only thing stopping a `POST`.
 *
 * ═══ THE GRIP IS TWO CONTROLS, WHICH IS A DEVIATION AND A DELIBERATE ONE ═══
 *
 * // HANDOFF-DEVIATION: §2.3 draws the grip as a `::` in Courier 12px `#736247`
 * with `cursor: grab`, and `Travel Diary Admin.dc.html` gives that element no
 * handler at all — it is a drag affordance the prototype never implemented. A
 * grab cursor on a screen that ships no JavaScript is a promise nothing can
 * keep, and Task 5's browser sweep is this repository's record of what a dead
 * affordance costs (EDITOR-001: arrows that posted a sequence Zod then refused).
 * So the mark is still the two colons §2.3 asks for, at its size and its colour,
 * but each colon is a button: the left moves the row up, the right moves it
 * down, and each is disabled at its end of the list exactly as the page rail's
 * ↑ ↓ are. `cursor: pointer`, not `grab`, because nothing here drags.
 * See docs/deviations.md.
 *
 * ═══ "PREVIEW PAGE" IS NOT DRAWN, AND THAT IS NOT AN OMISSION ═══
 *
 * // HANDOFF-DEVIATION: §2.3's pane header lists "Preview page" beside "Save
 * draft". The address it would point at is `/p/<n>`, where `n` is this page's
 * place in the DERIVED reading sequence — a number only `readBookBundle`
 * computes, from every published journey in the book, and one this screen's
 * three queries do not fetch. A link that 404s is worse than no link, so it is
 * left to whichever task has the sequence in hand. See docs/deviations.md.
 *
 * ═══ EVERY VALUE IS A `defaultValue`, NEVER A `value` ═══
 *
 * A `value` with no `onChange` is a React input nobody can type into. These are
 * uncontrolled inputs in a server-rendered form, which is what a form that
 * round-trips through a `POST` needs: the browser owns the text until Save.
 *
 * ═══ THE RIGHT-HAND COLUMN IS INSIDE THE FORM, AND CARRIES NO FORM OF ITS OWN ═══
 *
 * §2.3 puts the hero and the ephemera scrap in the second column of the pane's
 * body grid, which is inside the element that posts — and a `<form>` inside a
 * `<form>` is invalid HTML that browsers resolve by dropping the inner one, so
 * a Clear button there would have posted this whole pane instead. `SlotPanel`
 * carries no form element for exactly that reason: every one of its controls is
 * a `type="button"` that calls its action with a `FormData` it builds. That
 * also means none of them submits this pane by accident, which an unadorned
 * `<button>` inside a form would.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One form, three lists and two
 * child components.
 *
 * INVARIANT — the pane draws `notes.tally.length` tally rows and posts exactly
 * that many `tallyKey`/`tallyValue` pairs, which `readJourneyEditor.ts`
 * guarantees to be `TALLY_ROWS`. The parse refuses any other count, so a change
 * to either side fails rather than silently storing a short ticket.
 * Depends on: react, `JourneyId`/`SlotKey` (@travel-diary/domain/ids),
 * `JourneyNotes` (../../../lib/admin/notesMutations), `EditorSlot`
 * (../../../lib/admin/readJourneyEditor), ./Furniture, ./SlotPanel,
 * ./editor.module.css.
 */
import type { JourneyId, SlotKey } from '@travel-diary/domain/ids'
import type React from 'react'
import type { JourneyNotes } from '../../../lib/admin/notesMutations'
import type { EditorSlot } from '../../../lib/admin/readJourneyEditor'
import { Furniture } from './Furniture'
import { SlotPanel } from './SlotPanel'
import styles from './editor.module.css'

/** What SCREENS.md §2.3's Notes pane needs to draw itself and to save. */
export interface NotesPaneProps {
  /** The journey being edited — the hidden field every control posts. */
  readonly journey: JourneyId
  /** The selected page's name, which the "Editing" eyebrow sits over. */
  readonly title: string
  /** Everything the pane edits, as the database holds it. */
  readonly notes: JourneyNotes
  /** The page's two cells — the hero and the ephemera scrap — in cell order. */
  readonly slots: readonly EditorSlot[]
  /** Where a Replace link points before its own `&slot=` — see {@link SlotPanel}. */
  readonly editorHref: string
  /** The cell `?slot=` names, which the pool is currently filling, or `null`. */
  readonly targeted: SlotKey | null
  /** Saves the pane as an unpublished draft, and applies any `op` posted with it. */
  readonly save: (form: FormData) => Promise<void>
  /** Writes a cell's focal point. */
  readonly setFocal: (form: FormData) => Promise<void>
  /** Writes a cell's caption and alt text. */
  readonly setText: (form: FormData) => Promise<void>
  /** Empties a cell, keeping it. */
  readonly clear: (form: FormData) => Promise<void>
}

/**
 * One half of a highlight row's `::` grip.
 *
 * A component rather than two copies of eight lines, because the two differ
 * only in which way they move the row and which end of the list disables them.
 * @param props - The row, the direction and whether this end is reachable.
 * @returns The button.
 */
const Grip = ({
  row,
  direction,
  disabled,
}: {
  readonly row: string
  readonly direction: 'up' | 'down'
  readonly disabled: boolean
}): React.JSX.Element => (
  <button
    type="submit"
    name="op"
    value={`${direction}:${row}`}
    data-move={direction}
    disabled={disabled}
    aria-label={`Move this highlight ${direction}`}
    className={styles.grip}
  >
    :
  </button>
)

/**
 * Renders SCREENS.md §2.3's Notes pane.
 *
 * @param props - See {@link NotesPaneProps}.
 * @returns The pane, as one form.
 * @example
 * <NotesPane journey={view.id} title="Notes" notes={view.notes} save={saveNotes} />
 */
export const NotesPane = ({
  journey,
  title,
  notes,
  slots,
  editorHref,
  targeted,
  save,
  setFocal,
  setText,
  clear,
}: NotesPaneProps): React.JSX.Element => (
  <form data-editing-pane data-notes-pane className={styles.pane} action={save}>
    <input type="hidden" name="journey" value={journey} />

    <div className={styles.paneHeader}>
      <div>
        <p className={styles.eyebrow}>Editing</p>
        <h2 className={styles.paneName}>{title}</h2>
      </div>
      <button type="submit" data-save-notes className={styles.saveDraft}>
        Save draft
      </button>
    </div>

    <div className={styles.fieldGrid}>
      <label className={styles.field}>
        <span className={styles.eyebrow}>Location</span>
        <input type="text" name="location" defaultValue={notes.name} className={styles.locationInput} />
      </label>
      <label className={styles.field}>
        <span className={styles.eyebrow}>Dates</span>
        <input type="text" name="dates" defaultValue={notes.dates} className={styles.datesInput} />
      </label>
      <label className={styles.field}>
        <span className={styles.eyebrow}>Weather</span>
        <input type="text" name="weather" defaultValue={notes.weather} className={styles.badgeInput} />
      </label>
      <label className={styles.field}>
        <span className={styles.eyebrow}>Mood</span>
        <input type="text" name="mood" defaultValue={notes.mood} className={styles.badgeInput} />
      </label>
    </div>

    <div className={styles.bodyGrid}>
      <div className={styles.notesColumn}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Highlights</p>
          <p className={styles.instruction}>four maximum — they set the page rhythm</p>
        </div>

        <div className={styles.highlights}>
          {notes.highlights.map((row, index) => (
            <div key={row.id} data-highlight={row.id} className={styles.highlightRow}>
              <span className={styles.gripPair}>
                <Grip row={row.id} direction="up" disabled={index === 0} />
                <Grip row={row.id} direction="down" disabled={index === notes.highlights.length - 1} />
              </span>
              <input type="hidden" name="highlightId" value={row.id} />
              <input
                type="text"
                name="highlightText"
                defaultValue={row.text}
                aria-label={`Highlight ${String(index + 1)}`}
                className={styles.highlightInput}
              />
              <button
                type="submit"
                name="op"
                value={`remove:${row.id}`}
                data-remove-highlight
                aria-label={`Remove highlight ${String(index + 1)}`}
                className={styles.removeHighlight}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button type="submit" name="op" value="add" data-add-highlight className={styles.addHighlight}>
          Add highlight
        </button>

        <p className={styles.eyebrowSpaced}>The note</p>
        <textarea name="note" rows={4} defaultValue={notes.note} aria-label="The note" className={styles.noteInput} />

        <p className={styles.eyebrowSpaced}>Tally</p>
        <div className={styles.tally}>
          {notes.tally.map((cell, index) => (
            // BY POSITION, AND ONLY HERE. The tally is a FIXED GRID of
            // `TALLY_ROWS` cells rather than a list of rows (the collection sets
            // `minRows` and `maxRows` to the same number), so a cell has no
            // identity to address and nothing adds, removes or moves one. Every
            // list with operations on it — the highlights above, the page rail
            // next door — is keyed by id (CLAUDE.md §0.9).
            <div key={index} className={styles.tallyCell}>
              <input
                type="text"
                name="tallyKey"
                defaultValue={cell.key}
                aria-label={`Tally ${String(index + 1)} name`}
                className={styles.tallyKeyInput}
              />
              <input
                type="text"
                name="tallyValue"
                defaultValue={cell.value}
                aria-label={`Tally ${String(index + 1)} value`}
                className={styles.tallyValueInput}
              />
            </div>
          ))}
        </div>

        <hr className={styles.rule} />

        <Furniture
          signoff={notes.signoff}
          weatherGlyph={notes.weatherGlyph}
          stampCountry={notes.stampCountry}
          stampValue={notes.stampValue}
          accent={notes.accent}
          slug={notes.slug}
        />
      </div>

      <div data-slots-column className={styles.slotsColumn}>
        <p className={styles.eyebrow}>Photographs</p>
        <SlotPanel
          journey={journey}
          slots={slots}
          editorHref={editorHref}
          targeted={targeted}
          shape="column"
          setFocal={setFocal}
          setText={setText}
          clear={clear}
        />
      </div>
    </div>
  </form>
)
