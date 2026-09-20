'use client'

/**
 * SlotPanel — SCREENS.md §2.3's photo slots: the label, the motion badge, the
 * image an author clicks to focus, Replace / Clear, the focal pill, and the
 * caption and alt fields beneath.
 *
 * ═══ THIS IS THE EDITOR'S ONE CLIENT ISLAND, AND IT IS NOT A PREFERENCE ═══
 *
 * // HANDOFF-DEVIATION: every other part of this screen is a `<form>` and a
 * re-render, and `lib/admin/shellShipsNoClientJs.test.ts` fails on the commit
 * that adds a client directive to this directory — with this one file named in
 * its allowlist, with this reason. §2.3's focal point is
 * `clamp(0, ((clientX − rect.left) / rect.width) × 100, 100)`: it needs the
 * POINTER POSITION and the ELEMENT'S MEASURED WIDTH in the same expression, and
 * a server has neither. `<input type="image">` posts a click's coordinates but
 * not the box they were measured against, and a slot's width is a `1fr` track,
 * so there is no constant to divide by. See docs/deviations.md.
 *
 * ═══ NO `<form>` ELEMENT ANYWHERE IN HERE, AND THAT IS STRUCTURAL ═══
 *
 * On a Notes page these cells sit in the right-hand column of `NotesPane.tsx`,
 * which IS a `<form>` — and a form inside a form is invalid HTML that browsers
 * resolve by dropping the inner one, so a Clear button would have posted the
 * whole Notes pane instead. Every control here is a `type="button"` that calls
 * its action with a `FormData` this file builds. The actions keep the
 * `FormData` signature the pool's real `<form>` needs, so one parse serves both
 * callers.
 *
 * ═══ THE POINTS ARE AN OVERLAY, KEYED BY `SlotKey` ═══
 *
 * §2.3 states the defect in its own words: "Keyed per journey AND per page —
 * Tokyo/Frames I must not share Tokyo/Frames II." So the state is
 * `Record<SlotKey, FocalPoint>` where `SlotKey` is `${page}:${cell}`
 * (`@travel-diary/domain/admin/focalPoint`'s `slotKeyFor`), never a bare value
 * and never keyed on the cell alone — which is CLAUDE.md §0.9 and the five
 * defects `DATA_MODEL.md` attributes to exactly that.
 *
 * It is a PENDING EDIT over the server's own values, not a cache of them, and
 * the difference is the whole of Task 7 review M1. Each entry carries the value
 * it was made over (`against`) plus the photograph it was made ON (`media`),
 * and is DELETED the moment the server's answer for that cell has moved —
 * because two of this screen's own writes move it:
 * `setSlotMediaRow` and `clearSlotRow` both re-centre the cell, and
 * `revalidatePath` then re-renders this island IN PLACE, same component, new
 * props. An overlay that only ever grew kept drawing the author's last click
 * while the database and the reader held the centre: a crop that does not
 * exist, on the one screen whose exit criterion is that its control is not
 * decorative. A lookup that misses still falls back to the stored value, which
 * is what makes selecting another page correct with no reset — the new page's
 * cells have keys this map has never held. The caption and alt text are held
 * the same way, and for the second reason too: Clear blanks them on the
 * server.
 *
 * ═══ DELETED, NOT MERELY IGNORED — AND THAT IS TWO MECHANISMS ON PURPOSE ═══
 *
 * The first version of this only IGNORED a stale entry, re-deciding each
 * render whether the server's answer still matched the snapshot. The server can
 * leave a snapshot and come back to it: `setSlotMediaRow` re-centres
 * unconditionally, and the pool enables every tile once a cell is targeted — so
 * an author who crops a cell and then ticks the SAME photograph puts the
 * server's answer back to the pair the dropped edit was made over, and the
 * dropped crop revives (Task 7 fix review, F1). A rule that is re-satisfiable
 * is not a rule.
 *
 * So invalidation is an EVENT: {@link SlotPanel}'s effect deletes every entry
 * the current props have moved past, and a deleted entry cannot come back. The
 * render still asks the same question through {@link pointIsPending} — not
 * because it decides anything, but because an effect runs AFTER paint, and
 * without the guard the stale crop would be drawn for one frame before the
 * deletion landed. One predicate, two callers, two different jobs: the guard
 * decides what is PAINTED, the effect decides what is KEPT.
 *
 * ═══ REPLACE IS A LINK, WHICH IS A DEVIATION AND A DELIBERATE ONE ═══
 *
 * // HANDOFF-DEVIATION: §2.3 draws Replace as a button, and
 * `Travel Diary Admin.dc.html` gives it no handler at all — it is an
 * affordance the prototype never implemented, exactly like the Notes pane's
 * `::` grip (docs/deviations.md §58). Replace here ADDRESSES the slot:
 * `?page=<id>&slot=<key>`, which is the same "selection is an address, not
 * state" the page rail already uses, and the journey pool's tiles then place a
 * photograph into the cell that address names.
 *
 * // HANDOFF-DEVIATION: §2.3 lists Clear on the Notes page's two slots and not
 * on the Frames page's four, and lists no control that COMMITS the caption and
 * alt fields on either. Both are drawn here on every cell: `clearSlot` is one
 * of this task's four actions and a frames page holds most of the cells, and a
 * field with nothing to save it is a field that silently discards what the
 * author typed. See docs/deviations.md.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One list, two overlays and
 * three server actions.
 *
 * ═══ "SAVE WORDS" POSTS BOTH FIELDS, AND THAT IS NOTES-002's STALENESS ═══
 *
 * The button posts the caption AND the alt text, and whichever the author did
 * not touch goes out as the props held it when the page was rendered. Two tabs
 * on one cell: tab B fixes the alt text and saves; tab A, rendered before that,
 * tidies the caption and presses Save words — and tab B's correction is
 * reverted. It is the shape `NOTES-002` records for the highlight controls, a
 * control posting a value rendered earlier.
 *
 * IT IS NARROWER THAN NOTES-002 IN ONE WAY AND NOT IN THE OTHER. The target is
 * a {@link SlotKey}, so nothing can write to the WRONG CELL — but the value can
 * be stale, which is the half that loses work. The answer, if it is ever worth
 * code, is `notesMutations`': post an instruction (`caption` only, `alt` only)
 * rather than both fields. It is not taken here because §2.3 specifies no such
 * control and the pending-edit overlay already keeps an UNSAVED keystroke
 * across a re-render, which is the case an author actually meets.
 *
 * INVARIANT — every control posts the cell's own {@link SlotKey} and nothing
 * else identifying it, so no control can name one page's cell while another
 * page is open.
 * Depends on: react, `focalPointFrom`/`focalPointLabel`/`isCentred`/`FocalPoint`
 * (@travel-diary/domain/admin/focalPoint), `JourneyId`/`MediaId`/`SlotKey`
 * (@travel-diary/domain/ids), `EditorSlot` (../../../lib/admin/readJourneyEditor),
 * ./editor.module.css.
 */
import {
  FOCAL_NUDGE,
  focalPointFrom,
  focalPointLabel,
  isCentred,
  nudgeFocalPoint,
  sameFocalPoint,
  type FocalPoint,
} from '@travel-diary/domain/admin/focalPoint'
import type { JourneyId, MediaId, SlotKey } from '@travel-diary/domain/ids'
import type React from 'react'
import { startTransition, useEffect, useState } from 'react'
import type { EditorSlot } from '../../../lib/admin/readJourneyEditor'
import styles from './editor.module.css'

/**
 * An edit the author has made and the server has not answered for yet.
 *
 * `against` is what the server said when the edit was made. The edit is drawn
 * while that still matches, and dropped the moment it does not — see this
 * module's header.
 */
interface Pending<Value> {
  /** What the author changed it to. */
  readonly value: Value
  /** What the server held when they changed it. */
  readonly against: Value
  /**
   * Which photograph was in the cell when they changed it.
   *
   * WITHOUT THIS THE COMPARISON CANNOT SEE THE CASE IT EXISTS FOR. Both writes
   * that invalidate an edit re-centre the cell to 50/50 — which is very often
   * the value it already had, so "has the stored point moved?" answers NO
   * while everything else about the cell has changed. The photograph is what
   * moved, and a focal point belongs to a placement rather than to a cell.
   */
  readonly media: MediaId | null
}

/** A cell's words, as the two fields hold them. */
interface SlotWords {
  /** The caption printed under the photograph in the book. */
  readonly caption: string
  /** What a screen reader is told the photograph shows. */
  readonly alt: string
}

/**
 * How far each arrow moves the focal point.
 *
 * A TABLE RATHER THAN FOUR COMPARISONS, so the four keys are one list a reader
 * can see at once — and so an unrecognised key falls out as `undefined` rather
 * than through an `else` nobody wrote.
 */
const NUDGE_BY: Readonly<Record<string, FocalPoint | undefined>> = {
  ArrowLeft: { x: -FOCAL_NUDGE, y: 0 },
  ArrowRight: { x: FOCAL_NUDGE, y: 0 },
  ArrowUp: { x: 0, y: -FOCAL_NUDGE },
  ArrowDown: { x: 0, y: FOCAL_NUDGE },
}

/**
 * Whether a pending focal edit is still about the cell the server is
 * describing.
 *
 * THE SNAPSHOT INCLUDES THE PHOTOGRAPH, and that is not belt and braces: both
 * writes that invalidate an edit re-centre the cell to 50/50, which is very
 * often the value it already had — so "has the stored point moved?" answers NO
 * while everything else about the cell has changed. A focal point belongs to a
 * PLACEMENT.
 * @param pending - The edit, if there is one.
 * @param slot - The cell as the server currently describes it.
 * @returns Whether the edit is still the author's unanswered change.
 */
const pointIsPending = (pending: Pending<FocalPoint> | undefined, slot: EditorSlot): boolean =>
  pending !== undefined && pending.media === slot.media && sameFocalPoint(pending.against, slot.focal)

/**
 * {@link pointIsPending}, for the caption and alt text.
 * @param pending - The edit, if there is one.
 * @param slot - The cell as the server currently describes it.
 * @returns Whether the edit is still the author's unanswered change.
 */
const wordsArePending = (pending: Pending<SlotWords> | undefined, slot: EditorSlot): boolean =>
  pending !== undefined &&
  pending.media === slot.media &&
  pending.against.caption === slot.caption &&
  pending.against.alt === slot.alt

/**
 * The overlay with every entry the server has moved past removed.
 *
 * RETURNS THE SAME OBJECT WHEN NOTHING IS STALE, which is what lets the effect
 * below run on every render without looping: React bails out of a state update
 * that sets the value it already holds.
 *
 * IT ONLY JUDGES THE CELLS IT WAS GIVEN. An entry for a page that is no longer
 * open is left alone — the server is not describing that cell, so there is
 * nothing to have moved past, and the author's unanswered edit survives them
 * looking at another page and coming back.
 * @param held - The overlay.
 * @param slots - The cells the server is currently describing.
 * @param isPending - The question to ask of each.
 * @returns The overlay, or the same reference when nothing was dropped.
 */
const withoutStale = <Value,>(
  held: Readonly<Partial<Record<SlotKey, Pending<Value>>>>,
  slots: readonly EditorSlot[],
  isPending: (pending: Pending<Value> | undefined, slot: EditorSlot) => boolean,
): Readonly<Partial<Record<SlotKey, Pending<Value>>>> => {
  const stale = new Set(
    slots.filter((slot) => held[slot.key] !== undefined && !isPending(held[slot.key], slot)).map((slot) => slot.key),
  )
  if (stale.size === 0) return held
  return Object.fromEntries(Object.entries(held).filter(([key]) => !stale.has(key as SlotKey)))
}

/** What SCREENS.md §2.3's slots need to draw themselves and to save. */
export interface SlotPanelProps {
  /** The journey being edited — the cache address every control posts. */
  readonly journey: JourneyId
  /** The selected page's cells, in cell order. */
  readonly slots: readonly EditorSlot[]
  /**
   * Where a Replace link points before its own `&slot=`, e.g.
   * `/admin/journeys/12?page=7`. Built by the route, because a component does
   * not know its own address.
   */
  readonly editorHref: string
  /** The cell `?slot=` names, which the pool is currently filling, or `null`. */
  readonly targeted: SlotKey | null
  /** Whether the cells stack in a column (a Notes page) or fill §2.3's frames grid. */
  readonly shape: 'column' | 'grid'
  /** Writes a cell's focal point. */
  readonly setFocal: (form: FormData) => Promise<void>
  /** Writes a cell's caption and alt text. */
  readonly setText: (form: FormData) => Promise<void>
  /** Empties a cell, keeping it. */
  readonly clear: (form: FormData) => Promise<void>
}

/**
 * Renders SCREENS.md §2.3's photo slots for one page.
 *
 * @param props - See {@link SlotPanelProps}.
 * @returns The cells, in cell order.
 * @example
 * <SlotPanel journey={view.id} slots={page.slots} editorHref={href} targeted={null} shape="grid" … />
 */
export const SlotPanel = ({
  journey,
  slots,
  editorHref,
  targeted,
  shape,
  setFocal,
  setText,
  clear,
}: SlotPanelProps): React.JSX.Element => {
  const [points, setPoints] = useState<Readonly<Partial<Record<SlotKey, Pending<FocalPoint>>>>>({})
  const [words, setWords] = useState<Readonly<Partial<Record<SlotKey, Pending<SlotWords>>>>>({})

  // INVALIDATION IS AN EVENT — see this module's header. Every render whose
  // props have moved past an edit deletes it, so no later render can find the
  // snapshot matching again and resurrect it. `withoutStale` answers with the
  // same object when nothing is stale, so this cannot loop.
  useEffect(() => {
    setPoints((held) => withoutStale(held, slots, pointIsPending))
    setWords((held) => withoutStale(held, slots, wordsArePending))
  }, [slots])

  /**
   * The body every control posts: the journey, for the cache address, and the
   * cell's own key.
   * @param slot - The cell's key.
   * @returns The two fields every parse reads.
   */
  const targetOf = (slot: SlotKey): FormData => {
    const form = new FormData()
    form.append('journey', journey)
    form.append('slot', slot)
    return form
  }

  /**
   * Writes a cell's focal point, whatever moved it.
   * @param slot - The cell.
   * @param point - Where its crop is now anchored.
   */
  const commit = (slot: SlotKey, point: FocalPoint): void => {
    const form = targetOf(slot)
    form.append('focalX', String(point.x))
    form.append('focalY', String(point.y))
    startTransition(() => {
      void setFocal(form)
    })
  }

  /**
   * Turns a click on a cell into its focal point, shows it at once and writes
   * it.
   *
   * THE MEASUREMENT IS THE ELEMENT'S OWN, taken at the moment of the click: a
   * slot's width is a `1fr` track, so there is no constant a server could have
   * divided by. `focalPointFrom` clamps to the frame and guards the zero-size
   * box an undisplayed element measures as.
   *
   * ═══ AN ACTIVATION WITH NO POINTER BEHIND IT IS REFUSED ═══
   *
   * This element is a `<button>`, so it is in the tab order — and Enter or
   * Space on a `<button>` dispatches a `click` whose `clientX`/`clientY` are
   * 0, because there is no pointer. `focalPointFrom` reads that as a drag that
   * left the box and clamps it to the top-left corner, which the parse then
   * accepts (`0` is inside `[0, 100]`) and the write stores — destroying the
   * author's crop with no refusal and no surface (Task 7 review, H1).
   * `MouseEvent.detail` is the standard signal: a pointer carries its click
   * count, a synthesised activation carries 0. The arrows below are the
   * keyboard's way to a real value.
   * @param slot - The cell clicked.
   * @param stored - What the server holds for it, which the edit is made over.
   * @param media - The photograph in the cell, which the edit also belongs to.
   * @param event - The pointer event.
   */
  const focus = (
    slot: SlotKey,
    stored: FocalPoint,
    media: MediaId | null,
    event: React.MouseEvent<HTMLButtonElement>,
  ): void => {
    if (event.detail === 0) return

    const measured = focalPointFrom(event, event.currentTarget.getBoundingClientRect())
    // ROUNDED HERE, AND NOT IN THE FORMULA. §2.3's expression is the division
    // and `focalPointFrom` is exactly that; what is rounded is the value this
    // screen COMMITS. The pill prints whole percentages, so an unrounded write
    // saved a number the author was never shown — `24.836806920959496` behind
    // "focus 25% 80%" (`docs/qa/2026-09-20-journey-slots-sweep.md`, SLOT-002).
    // One percent of a frame is finer than any crop can show, and rounding
    // before the state as well as before the write keeps the reticle, the pill
    // and the column on the same number across a reload.
    const point = { x: Math.round(measured.x), y: Math.round(measured.y) }
    setPoints((held) => ({ ...held, [slot]: { value: point, against: stored, media } }))
    commit(slot, point)
  }

  /**
   * Moves a cell's focal point by one step, without writing it.
   *
   * THE WRITE IS ON RELEASE, NOT ON EACH PRESS. A held arrow fires `keydown` as
   * fast as the platform repeats it, and every write here mints a version row
   * on a versioned collection (`pageMutations.ts`'s header says why that is not
   * free). One physical press is one write, whatever the repeat rate.
   * @param slot - The cell focused, as the server describes it.
   * @param by - How far to move.
   */
  const nudge = (slot: EditorSlot, by: FocalPoint): void => {
    setPoints((held) => {
      // COMPUTED INSIDE THE UPDATER, from what is HELD rather than from what
      // was last rendered. Two `keydown`s in one React batch would otherwise
      // both start from the pre-render value, and the second would overwrite
      // the first with the same result — a press the author made and the crop
      // never took (Task 7 fix review, F2). Auto-repeat is the exact input
      // this handler exists for, so "React usually flushes discrete events one
      // at a time" is not a property to lean on.
      const current = held[slot.key]
      const from = current !== undefined && pointIsPending(current, slot) ? current.value : slot.focal
      return { ...held, [slot.key]: { value: nudgeFocalPoint(from, by), against: slot.focal, media: slot.media } }
    })
  }

  return (
    <div data-slot-panel={shape} className={shape === 'grid' ? styles.framesGrid : styles.slotStack}>
      {slots.map((slot) => {
        const stored = { caption: slot.caption, alt: slot.alt }
        const pendingPoint = points[slot.key]
        const pendingWords = words[slot.key]
        // WHAT IS PAINTED, while the effect above decides what is KEPT. The
        // effect runs after paint, so without this the frame between a
        // server answer and its deletion would draw the stale value.
        const moved = pointIsPending(pendingPoint, slot)
        const point = moved && pendingPoint !== undefined ? pendingPoint.value : slot.focal
        const said = wordsArePending(pendingWords, slot) && pendingWords !== undefined ? pendingWords.value : stored
        const empty = slot.previewSrc === null

        return (
          <article
            key={slot.key}
            data-slot={slot.key}
            data-targeted={targeted === slot.key ? '' : undefined}
            className={styles.slot}
          >
            <div className={styles.slotHead}>
              <p className={styles.eyebrow}>{slot.label}</p>
              <span data-slot-motion className={slot.loops ? styles.motionLoops : styles.motionStill}>
                {slot.loops ? 'Loops' : 'Still'}
              </span>
            </div>

            <button
              type="button"
              data-focal-target={slot.key}
              data-role={slot.role}
              data-empty={empty ? '' : undefined}
              disabled={empty}
              aria-label={`Set the focal point of ${slot.label} — click it, or move it with the arrow keys`}
              className={styles.slotImage}
              onClick={(event) => {
                focus(slot.key, slot.focal, slot.media, event)
              }}
              onKeyDown={(event) => {
                const by = NUDGE_BY[event.key]
                if (by === undefined) return
                // The arrows scroll the page by default, and this element is
                // inside a pane that scrolls.
                event.preventDefault()
                nudge(slot, by)
              }}
              onKeyUp={(event) => {
                // ONLY WHAT WAS MOVED IS WRITTEN. A release with no nudge
                // behind it — a key held down before this cell took the focus,
                // or an arrow released after the page scrolled — would
                // otherwise post the value that is already stored.
                // The pending edit itself, not the effective point: a
                // release with no nudge behind it, or one whose edit the
                // server has already moved past, must post nothing.
                if (NUDGE_BY[event.key] === undefined || !moved) return
                commit(slot.key, point)
              }}
              style={
                empty
                  ? undefined
                  : {
                      backgroundImage: `url("${slot.previewSrc}")`,
                      backgroundPosition: `${String(point.x)}% ${String(point.y)}%`,
                    }
              }
            >
              {empty ? (
                <span className={styles.slotEmpty}>No photograph yet</span>
              ) : (
                // The reticle, 26px, CENTRED ON THE POINT: `left`/`top` place
                // its own top-left, and the stylesheet's transform takes it
                // back by half its own size — so it marks the pixel rather
                // than starting at it.
                <span
                  data-focal-reticle
                  aria-hidden="true"
                  className={styles.reticle}
                  style={{ left: `${String(point.x)}%`, top: `${String(point.y)}%` }}
                />
              )}
            </button>

            <div className={styles.slotTools}>
              <a href={`${editorHref}&slot=${slot.key}`} data-slot-replace className={styles.slotTool}>
                Replace
              </a>
              <button
                type="button"
                data-slot-clear
                disabled={slot.media === null}
                className={styles.slotTool}
                onClick={() => {
                  startTransition(() => {
                    void clear(targetOf(slot.key))
                  })
                }}
              >
                Clear
              </button>
            </div>

            <p data-focal-pill className={isCentred(point) ? styles.pillCentred : styles.pillSet}>
              {focalPointLabel(isCentred(point) ? null : point)}
            </p>

            <div className={styles.slotWords}>
              <input
                type="text"
                // NO `name`, DELIBERATELY. On a Notes page these inputs sit
                // inside the pane's own `<form>`, and a named field there is a
                // field "Save draft" posts — `readNotes` would strip it, but a
                // later field of the same name would not be stripped, it would
                // be read. The island posts these from its own state.
                data-slot-caption
                value={said.caption}
                placeholder="Caption"
                aria-label={`Caption for ${slot.label}`}
                className={styles.slotCaption}
                onChange={(event) => {
                  const caption = event.target.value
                  setWords((held) => ({
                    ...held,
                    [slot.key]: { value: { ...said, caption }, against: stored, media: slot.media },
                  }))
                }}
              />
              <input
                type="text"
                data-slot-alt
                value={said.alt}
                placeholder="Alt text"
                aria-label={`Alt text for ${slot.label}`}
                className={styles.slotAlt}
                onChange={(event) => {
                  const alt = event.target.value
                  setWords((held) => ({
                    ...held,
                    [slot.key]: { value: { ...said, alt }, against: stored, media: slot.media },
                  }))
                }}
              />
              <button
                type="button"
                data-slot-save-words
                className={styles.slotTool}
                onClick={() => {
                  const form = targetOf(slot.key)
                  form.append('caption', said.caption)
                  form.append('alt', said.alt)
                  startTransition(() => {
                    void setText(form)
                  })
                }}
              >
                Save words
              </button>
            </div>
          </article>
        )
      })}
    </div>
  )
}
