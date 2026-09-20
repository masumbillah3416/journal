'use client'

/**
 * FrameGrid — SCREENS.md §2.5's controls row, its bulk caption panel, the tile
 * grid and the selected-frame panel beside it.
 *
 * ═══ THIS SCREEN'S ONE CLIENT ISLAND, AND WHY IT HAS TO BE ONE ═══
 *
 * §2.5's grid is "Drag to reorder", and a drag is a pointer gesture: there is
 * no form post that carries "this tile now sits before that one". Everything
 * else on the screen hangs off the same state — which tile is selected, which
 * arrangement is on screen, whether the bulk panel is open — so drawing the
 * controls on the server and the grid here would put them on two lines and
 * split one screen's state across a boundary. The journey is still an ADDRESS
 * rather than state — the select pushes `?journey=<id>`, so the screen
 * survives a reload and can be sent to somebody. This file is named in
 * `shellShipsNoClientJs.test.ts`'s `ISLANDS` allowlist, so a SECOND directive
 * in this directory fails by name.
 *
 * ═══ SELECTION IS A FRAME ID, NEVER A POSITION — AND IT IS RESOLVED, NOT
 *     REMEMBERED ═══
 *
 * §2.5 states it in bold — "Select frames by id, not index — sorting reorders
 * the grid and a positional index desyncs the panel from the highlight" — and
 * CLAUDE.md §0.9 states it for the whole repository. The grid re-sorts under
 * the panel whenever "By date" is pressed or a tile is dragged, so an index
 * would move the panel onto whichever frame had taken that place.
 * `FrameGrid.test.tsx` re-renders the grid with the frames shuffled and
 * asserts the same FRAME is still on the panel and still highlighted.
 *
 * The id is RESOLVED against the list on screen on every render, and falls back
 * to the first frame when it names nothing there. That is not defensive: the
 * journey select pushes an address, so Next.js re-renders the Server Component
 * IN PLACE and this component keeps its state — leaving it holding a frame of
 * a gallery that is no longer drawn, and the panel empty over a grid with
 * tiles in it (GAL-001, `docs/qa/2026-09-20-galleries-screen-sweep.md`).
 * Per-journey state surviving a journey switch is the handoff's most-repeated
 * defect, five separate times.
 *
 * ═══ "SORT BY DATE" WRITES, AND ITS TICK IS DERIVED RATHER THAN HELD ═══
 *
 * §2.5 says the button "toggles, reads 'By date ✓' and turns terracotta when
 * active". It is active here when the arrangement on screen ALREADY IS the
 * date order — a fact about the data, not a flag — because a view-only sort
 * would move the "Cover" chip onto a frame the public gallery does not lead
 * with. Pressing it writes the new `order`, which is the column
 * `lib/galleryFrames.ts`'s `GALLERY_FRAME_SORT` sorts the diary by. Dragging a
 * tile afterwards turns the tick off by itself, which is what a derived state
 * does and a held flag would not. `docs/deviations.md` records the reading.
 *
 * ═══ THE GRID IS OPERABLE WITHOUT A POINTER ═══
 *
 * `cursor: grab` and HTML drag events say nothing to a keyboard. Each tile
 * carries a real grip `<button>` whose arrow keys move the frame one place
 * (Home and End send it to either end), and the tile itself is a button that
 * selects. So a keyboard user can select any frame, edit it, and rearrange the
 * whole gallery; what they cannot do is drag, and nothing here needs them to.
 * The report for this task states that plainly rather than leaving it to a
 * sweep.
 *
 * ═══ A HIDDEN FRAME IS DRAWN WITHOUT ITS PHOTOGRAPH ═══
 *
 * §2.5 puts a `rgba(44,37,30,.5)` scrim and a solid "Hidden" chip on a withheld
 * frame, and this is the only screen from which one can be un-hidden — so it
 * lists them (`readGalleriesScreen.ts` asks `galleryFrameWhere` for
 * `includeHidden`). What it cannot do is SHOW one: `collections/media.ts`
 * withholds a `hidden` row from an unauthenticated reader, and
 * `/api/media/file/<name>` is Payload's own route, authenticating with
 * Payload's cookie — which this application never issues, because the admin's
 * session is `td-session` and the guard is ours. The admin browser is anonymous
 * to that route by construction. Asking anyway drew a broken-image box under
 * the scrim and an error in every console (GAL-002,
 * `docs/qa/2026-09-20-galleries-screen-sweep.md`), so the tile asks for
 * nothing and the scrim and the chip carry it. `docs/deviations.md` records
 * what that costs an author.
 *
 * ═══ WHAT A FAILED WRITE DOES ═══
 *
 * Nothing visible. Every action is dispatched inside `startTransition`, so a
 * rejection surfaces as an unhandled promise rejection in the browser rather
 * than as Next.js's error boundary — the same surface §2.3 and §2.4 have
 * (`docs/deviations.md` §60, inherited unchanged). §2.5 draws no error surface
 * and inventing one is the abstraction CLAUDE.md §4 refuses.
 *
 * ═══ THE GRID IS NOT REFRESHED FROM HERE ═══
 *
 * Each action calls `revalidatePath('/admin/galleries')` on the server, so the
 * new rows arrive as a re-render of the Server Component above this one. The
 * local arrangement follows that prop rather than competing with it — see
 * {@link FrameGrid}'s own reset.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A list, a selected id and five
 * dispatches.
 * Depends on: react, next/navigation, `coverFrame`/`reorderFrames`/`sortFramesByDate`
 * (@travel-diary/domain/admin/frameOrder), `MediaId`
 * (@travel-diary/domain/ids), `BulkCaption`/`FrameFlags`
 * (../../../lib/admin/galleryMutations), `FrameRow`/`GalleryChoice`
 * (../../../lib/admin/readGalleriesScreen), ./CaptionAll, ./SelectedFrame,
 * ./galleries.module.css.
 */
import { coverFrame, reorderFrames, sortFramesByDate } from '@travel-diary/domain/admin/frameOrder'
import type { JourneyId, MediaId } from '@travel-diary/domain/ids'
import { useRouter } from 'next/navigation'
import type React from 'react'
import { useState, useTransition } from 'react'
import type { BulkCaption, FrameFlags } from '../../../lib/admin/galleryMutations'
import type { FrameRow, GalleryChoice } from '../../../lib/admin/readGalleriesScreen'
import { CaptionAll } from './CaptionAll'
import { SelectedFrame, type FrameDraft } from './SelectedFrame'
import styles from './galleries.module.css'

/** What the screen needs. */
export interface FrameGridProps {
  /** The journey on screen. Every write names it. */
  readonly journey: JourneyId
  /** Every journey the select offers, with its frame count. */
  readonly journeys: readonly GalleryChoice[]
  /** The journey's frames, in the order the public gallery reads them. */
  readonly frames: readonly FrameRow[]
  /** Whether this deployment draws clip affordances (design spec §9.3). */
  readonly showsClips: boolean
  /** Writes the whole arrangement. */
  readonly setFrameOrder: (journey: string, order: readonly string[]) => Promise<void>
  /** Writes one frame's caption and alt text. */
  readonly setFrameText: (id: string, caption: string, alt: string) => Promise<void>
  /** Writes one frame's two column toggles. */
  readonly setFrameFlags: (id: string, flags: FrameFlags) => Promise<void>
  /** Writes one clip's poster timestamp. */
  readonly setPosterAt: (id: string, seconds: number | null) => Promise<void>
  /** Writes the bulk caption panel. */
  readonly applyBulkCaptions: (rows: readonly BulkCaption[]) => Promise<void>
}

/**
 * Whether two arrangements name the same frames in the same order.
 *
 * BY ID, IN ORDER. It answers the one question the "By date ✓" tick asks — is
 * what is on screen already the date order — and answering it by comparing
 * lengths or first elements would light the tick on a gallery that merely
 * starts with its oldest photograph.
 * @param left - One arrangement.
 * @param right - The other.
 * @returns Whether they are the same arrangement.
 */
const sameArrangement = (left: readonly FrameRow[], right: readonly FrameRow[]): boolean =>
  left.length === right.length && left.every((frame, index) => frame.id === right[index]?.id)

/**
 * Renders SCREENS.md §2.5's galleries screen.
 *
 * @param props - See {@link FrameGridProps}.
 * @returns The controls, the optional bulk panel, the grid and the panel.
 * @example
 * <FrameGrid journey={view.journey} journeys={view.journeys} frames={view.frames} … />
 */
export const FrameGrid = ({
  journey,
  journeys,
  frames,
  showsClips,
  setFrameOrder,
  setFrameText,
  setFrameFlags,
  setPosterAt,
  applyBulkCaptions,
}: FrameGridProps): React.JSX.Element => {
  // THE SERVER'S LIST IS THE TRUTH AND THIS IS THE OPTIMISTIC COPY. It is
  // adjusted during render when the prop changes — React's own shape for state
  // derived from a prop — so a drag shows immediately and a revalidation
  // replaces it without a second paint.
  const [shownFor, setShownFor] = useState<readonly FrameRow[]>(frames)
  const [arrangement, setArrangement] = useState<readonly FrameRow[]>(frames)
  if (shownFor !== frames) {
    setShownFor(frames)
    setArrangement(frames)
  }

  // AN ID, NEVER AN INDEX (CLAUDE.md §0.9, §2.5 in bold).
  const [selected, setSelected] = useState<MediaId | null>(frames[0]?.id ?? null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()

  const byDate = sortFramesByDate(arrangement)
  const sortedByDate = arrangement.length > 0 && sameArrangement(arrangement, byDate)
  const cover = coverFrame(arrangement)
  // THE SELECTED ID IS RESOLVED AGAINST THE LIST ON SCREEN, and falls back to
  // the first frame when it names nothing there — which is what happens the
  // moment the journey select pushes another address: Next.js re-renders the
  // Server Component in place, this component keeps its state, and the id it
  // is holding belongs to a gallery that is no longer drawn (GAL-001,
  // `docs/qa/2026-09-20-galleries-screen-sweep.md`). Resolving rather than
  // resetting is what keeps the §2.5 invariant intact: a frame that is still in
  // the list after a re-sort is still the selected one, wherever it has moved
  // to. `shown` is what the panel and the highlight both read, so the two
  // cannot disagree about which frame that is.
  const shown = arrangement.find((frame) => frame.id === selected) ?? arrangement[0] ?? null
  const blank = arrangement.filter((frame) => frame.caption === '')

  /**
   * Shows one arrangement and writes it.
   * @param next - The new arrangement, already renumbered.
   */
  const rearrange = (next: readonly FrameRow[]): void => {
    // AN ARRANGEMENT THAT IS THE ONE ON SCREEN IS NOT A WRITE. `End` on the
    // last frame, a right arrow on the last frame and "Sort by date" pressed
    // while the tick already reads "By date ✓" all produce the list already
    // drawn; dispatching it cost a round trip and `revalidatePath` on three
    // addresses for a statement that touched no row (LOW-5, task-9-review.md).
    if (sameArrangement(next, arrangement)) return
    setArrangement(next)
    startTransition(async () => {
      await setFrameOrder(
        journey,
        next.map((frame) => frame.id),
      )
    })
  }

  /**
   * Moves one frame to sit before another, or to the end.
   * @param moved - The frame being moved.
   * @param before - The frame it is to sit before, or `null` for the end.
   */
  const move = (moved: MediaId, before: MediaId | null): void => {
    rearrange(reorderFrames(arrangement, moved, before))
  }

  /**
   * Moves one frame one place, for a keyboard that cannot drag.
   * @param id - The frame being moved.
   * @param step - `-1` towards the front, `1` towards the back.
   */
  const nudge = (id: MediaId, step: -1 | 1): void => {
    const at = arrangement.findIndex((frame) => frame.id === id)
    /* c8 ignore next -- unreachable from the grid: the grip that calls this is drawn by the frame it names */
    if (at < 0) return
    const target = at + (step === -1 ? -1 : 2)
    // Past the end is "sit before nothing", which is what `reorderFrames`
    // takes `null` for; before the start is a move nobody asked for.
    if (target < 0) return
    move(id, arrangement[target]?.id ?? null)
  }

  return (
    <>
      <div data-galleries-controls className={styles.controls}>
        <select
          data-journey-select
          aria-label="Journey"
          className={styles.journeySelect}
          value={journey}
          onChange={(event) => {
            // AN ADDRESS, NOT STATE. The journey is what the screen is ABOUT,
            // so it survives a reload and can be sent to somebody — the same
            // reading §2.4's chips get. It is pushed through the router rather
            // than posted, because the whole screen is already an island and a
            // `GET` form would need a submit button §2.5 does not draw.
            router.push(`/admin/galleries?journey=${encodeURIComponent(event.target.value)}`)
          }}
        >
          {journeys.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.name} — {choice.frames} frames
            </option>
          ))}
        </select>

        <p className={styles.instruction}>Drag to reorder. The first frame is the gallery cover.</p>

        <span className={styles.spacer} />

        <button
          type="button"
          data-sort-by-date
          aria-pressed={sortedByDate}
          className={[styles.control, sortedByDate ? styles.controlOn : ''].join(' ')}
          onClick={() => {
            rearrange(byDate)
          }}
        >
          {sortedByDate ? 'By date ✓' : 'Sort by date'}
        </button>

        <button
          type="button"
          data-caption-all
          aria-expanded={bulkOpen}
          className={[styles.control, bulkOpen ? styles.controlOn : ''].join(' ')}
          onClick={() => {
            setBulkOpen((open) => !open)
          }}
        >
          Caption all
        </button>
      </div>

      {bulkOpen ? (
        <CaptionAll
          frames={blank}
          onApply={(rows) => {
            startTransition(async () => {
              await applyBulkCaptions(rows)
            })
            setBulkOpen(false)
          }}
        />
      ) : null}

      <div className={styles.columns}>
        <div className={styles.card}>
          {arrangement.length === 0 ? (
            <p data-frames-empty className={styles.empty}>
              Nothing in this gallery yet.
            </p>
          ) : (
            <div
              data-frame-grid
              className={styles.grid}
              onDragOver={(event) => {
                // Without this the browser refuses the drop outright.
                event.preventDefault()
              }}
            >
              {arrangement.map((frame, index) => (
                // KEYED BY ID, NEVER BY POSITION (CLAUDE.md §0.9).
                <div
                  key={frame.id}
                  draggable
                  data-frame-cell={frame.id}
                  className={styles.cell}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', frame.id)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    // RESOLVED AGAINST THE ARRANGEMENT rather than branded from
                    // the payload: a drag can carry any string — from another
                    // application, from another tab — and the only ids this
                    // grid may rearrange are the ones it is drawing.
                    const dropped = event.dataTransfer.getData('text/plain')
                    const moved = arrangement.find((row) => row.id === dropped)
                    if (moved === undefined || moved.id === frame.id) return
                    move(moved.id, frame.id)
                  }}
                >
                  <button
                    type="button"
                    data-frame-id={frame.id}
                    data-highlighted={frame.id === shown?.id}
                    aria-pressed={frame.id === shown?.id}
                    className={[styles.tile, frame.id === shown?.id ? styles.tileOn : ''].join(' ')}
                    onClick={() => {
                      setSelected(frame.id)
                    }}
                  >
                    {frame.thumbSrc === null || frame.hidden ? (
                      <span aria-hidden="true" className={styles.thumb} />
                    ) : (
                      // A HIDDEN FRAME IS DRAWN WITHOUT ONE, and that is the
                      // store's decision rather than this screen's:
                      // `collections/media.ts` withholds a `hidden` row from an
                      // unauthenticated reader, and `/api/media/file/<name>` is
                      // Payload's own route — it authenticates with Payload's
                      // cookie, which this application never issues, so the
                      // admin browser is anonymous to it by construction. The
                      // request answered 403 and the tile drew a broken-image
                      // box under the scrim (GAL-002,
                      // `docs/qa/2026-09-20-galleries-screen-sweep.md`). The
                      // scrim and the "Hidden" chip say what the tile is; a
                      // refused request says nothing.
                      //
                      // A plain `<img>` on a derivative already sized for this
                      // tile, lazily: `thumb` is 400px square against a 136px
                      // track. `docs/deviations.md` §73 records that eager
                      // loading was measured WORSE on §2.4's grid — under the
                      // gate's simulated connection the constraint is
                      // bandwidth, not discovery — and this grid is the same
                      // shape, so the experiment is not repeated here.
                      <img
                        src={frame.thumbSrc}
                        alt={frame.alt}
                        loading="lazy"
                        decoding="async"
                        className={styles.thumb}
                      />
                    )}
                    {frame.hidden ? <span aria-hidden="true" className={styles.scrim} /> : null}
                    <span data-frame-index className={styles.index}>
                      {index + 1}
                    </span>
                    {frame.id === cover ? (
                      <span data-cover-chip className={styles.cover}>
                        Cover
                      </span>
                    ) : null}
                    {frame.hidden ? (
                      <span data-hidden-chip className={styles.hiddenChip}>
                        Hidden
                      </span>
                    ) : null}
                  </button>

                  <button
                    type="button"
                    data-frame-grip={frame.id}
                    aria-label={`Move ${frame.filename}`}
                    className={styles.grip}
                    onKeyDown={(event) => {
                      // THE KEYBOARD'S WHOLE PATH THROUGH A DRAG. It is on the
                      // GRIP rather than on the tile so that arrowing between
                      // tiles to look at them cannot write anything.
                      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nudge(frame.id, -1)
                      else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nudge(frame.id, 1)
                      // HOME ASKS FOR NOTHING ON THE FRAME THAT IS ALREADY
                      // FIRST. `move(id, arrangement[0].id)` there names the
                      // moved frame as its own target, which is the degenerate
                      // input `reorderFrames` used to answer by appending
                      // (HIGH-1, task-9-review.md). That function now refuses
                      // it too; the caller stops asking, which is the half that
                      // keeps `onMakeCover` honest if the panel's `disabled`
                      // is ever removed.
                      else if (event.key === 'Home') {
                        if (frame.id !== arrangement[0]?.id) move(frame.id, arrangement[0]?.id ?? null)
                      } else if (event.key === 'End') move(frame.id, null)
                      else return
                      event.preventDefault()
                    }}
                  >
                    <span aria-hidden="true" className={styles.gripBar} />
                    <span aria-hidden="true" className={styles.gripBar} />
                    <span aria-hidden="true" className={styles.gripBar} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <SelectedFrame
          frame={shown}
          isCover={shown !== null && shown.id === cover}
          showsClips={showsClips}
          onSave={(id, draft: FrameDraft) => {
            startTransition(async () => {
              await setFrameText(id, draft.caption, draft.alt)
              await setFrameFlags(id, { hidden: draft.hidden, inBook: draft.inBook })
            })
          }}
          onMakeCover={(id) => {
            move(id, arrangement[0]?.id ?? null)
          }}
          onPoster={(id, seconds) => {
            startTransition(async () => {
              await setPosterAt(id, seconds)
            })
          }}
        />
      </div>
    </>
  )
}
