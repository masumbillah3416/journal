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
 * It is an OVERLAY over the server's own values rather than a copy of them: a
 * lookup that misses falls back to the slot's stored value. That is what makes
 * selecting another page correct with no reset — the new page's cells have keys
 * this map has never held, so every one of them reads the database's value. The
 * caption and alt text are held the same way, for the same reason.
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
 * INVARIANT — every control posts the cell's own {@link SlotKey} and nothing
 * else identifying it, so no control can name one page's cell while another
 * page is open.
 * Depends on: react, `focalPointFrom`/`focalPointLabel`/`isCentred`/`FocalPoint`
 * (@travel-diary/domain/admin/focalPoint), `JourneyId`/`SlotKey`
 * (@travel-diary/domain/ids), `EditorSlot` (../../../lib/admin/readJourneyEditor),
 * ./editor.module.css.
 */
import { focalPointFrom, focalPointLabel, isCentred, type FocalPoint } from '@travel-diary/domain/admin/focalPoint'
import type { JourneyId, SlotKey } from '@travel-diary/domain/ids'
import type React from 'react'
import { startTransition, useState } from 'react'
import type { EditorSlot } from '../../../lib/admin/readJourneyEditor'
import styles from './editor.module.css'

/** A cell's words, as the two fields hold them. */
interface SlotWords {
  /** The caption printed under the photograph in the book. */
  readonly caption: string
  /** What a screen reader is told the photograph shows. */
  readonly alt: string
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
  const [points, setPoints] = useState<Readonly<Record<string, FocalPoint>>>({})
  const [words, setWords] = useState<Readonly<Record<string, SlotWords>>>({})

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
   * Turns a click on a cell into its focal point, shows it at once and writes
   * it.
   *
   * THE MEASUREMENT IS THE ELEMENT'S OWN, taken at the moment of the click: a
   * slot's width is a `1fr` track, so there is no constant a server could have
   * divided by. `focalPointFrom` clamps to the frame and guards the zero-size
   * box an undisplayed element measures as.
   * @param slot - The cell clicked.
   * @param event - The pointer event.
   */
  const focus = (slot: SlotKey, event: React.MouseEvent<HTMLButtonElement>): void => {
    const point = focalPointFrom(event, event.currentTarget.getBoundingClientRect())
    setPoints((held) => ({ ...held, [slot]: point }))

    const form = targetOf(slot)
    form.append('focalX', String(point.x))
    form.append('focalY', String(point.y))
    startTransition(() => {
      void setFocal(form)
    })
  }

  return (
    <div data-slot-panel={shape} className={shape === 'grid' ? styles.framesGrid : styles.slotStack}>
      {slots.map((slot) => {
        const point = points[slot.key] ?? slot.focal
        const said = words[slot.key] ?? { caption: slot.caption, alt: slot.alt }
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
              aria-label={`Set the focal point of ${slot.label}`}
              className={styles.slotImage}
              onClick={(event) => {
                focus(slot.key, event)
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
                  setWords((held) => ({ ...held, [slot.key]: { ...said, caption } }))
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
                  setWords((held) => ({ ...held, [slot.key]: { ...said, alt } }))
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
