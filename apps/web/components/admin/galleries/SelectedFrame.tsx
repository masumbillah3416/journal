/**
 * SelectedFrame — SCREENS.md §2.5's right-hand panel: the preview, the file
 * line, the caption and alt text, the three toggles, the poster block for a
 * clip, and "Save frame".
 *
 * ═══ IT IS NOT A CLIENT COMPONENT OF ITS OWN ═══
 *
 * No `'use client'` directive and no entry in `shellShipsNoClientJs.test.ts`'s
 * `ISLANDS`, because `FrameGrid.tsx` renders it and that file is the entry.
 * The allowlist counts ENTRIES; a second directive here would claim a second.
 *
 * ═══ THE CLIP HALF CANNOT BE PRODUCED BY THIS SCREEN ON THIS MACHINE ═══
 *
 * Design spec §9.3 puts clips behind `MEDIA_PIPELINE=worker`, which is refused
 * at boot here because `ffmpeg` and `ffprobe` are absent — so with `inline`
 * bound there are no clips at all, the poster block is never rendered and the
 * file line's clip branch is unreachable FROM THE SCREEN. It is covered in
 * jsdom by handing this component a clip row directly (`SelectedFrame.test.tsx`),
 * which is the honest way to keep the 90% gate meaningful rather than
 * excluding the branch. What stays UNRESOLVED under CLAUDE.md §7.1 is whether
 * a real clip, derived by a real worker, draws the same thing — no browser on
 * this machine can be shown one.
 *
 * ═══ "USE AS GALLERY COVER" IS A MOVE, NOT A COLUMN ═══
 *
 * §2.5 draws the toggle AND says "The first frame is the gallery cover" one
 * paragraph above it. Those are two sentences about one thing, and the
 * position is the one the diary reads (`lib/galleryFrames.ts`'s
 * `GALLERY_FRAME_SORT`). So ticking it moves the frame to the front rather
 * than setting `media.isCover`, which stays what `readJourneysScreen.ts` reads
 * for the journeys table's 44px square. A frame that IS the cover shows the
 * box ticked and disabled: unticking it would have no meaning, because
 * something has to be first. `docs/deviations.md` records the reading.
 *
 * ═══ THE DRAFT IS RESET WHEN THE SELECTION CHANGES, BY ID ═══
 *
 * CLAUDE.md §0.9. The caption, the alt text and the two toggles are held here
 * until "Save frame"; the reset watches `frame.id` rather than an index,
 * because the grid re-sorts under this panel and a position would carry one
 * frame's unsaved caption onto another's.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A form that is not a form, and
 * two derived strings.
 * Depends on: react, `clipDuration` (@travel-diary/domain/gallery), `MediaId`
 * (@travel-diary/domain/ids), `FrameRow`
 * (../../../lib/admin/readGalleriesScreen), ./galleries.module.css.
 */
import { clipDuration } from '@travel-diary/domain/gallery'
import type { MediaId } from '@travel-diary/domain/ids'
import type React from 'react'
import { useState } from 'react'
import type { FrameRow } from '../../../lib/admin/readGalleriesScreen'
import styles from './galleries.module.css'

/** How many grabs §2.5's filmstrip offers: `repeat(4, minmax(0,1fr))`. */
export const POSTER_GRABS = 4

/** What one press of "Save frame" writes. */
export interface FrameDraft {
  /** The caption the gallery prints. */
  readonly caption: string
  /** What the frame says it is to a reader who cannot see it. */
  readonly alt: string
  /** Whether the frame is withheld from the public gallery. */
  readonly hidden: boolean
  /** Whether the frame is marked for the book. */
  readonly inBook: boolean
}

/** What the panel needs. */
export interface SelectedFrameProps {
  /** The frame on screen, or `null` for a journey with no frames at all. */
  readonly frame: FrameRow | null
  /** Whether this frame is the one the gallery leads with. */
  readonly isCover: boolean
  /**
   * Whether this deployment draws clip affordances.
   *
   * `showsClipAffordances`, read on the SERVER from `MEDIA_PIPELINE` and
   * passed down — never `process.env` in a component (design spec §9.3).
   */
  readonly showsClips: boolean
  /** Writes the draft. */
  readonly onSave: (id: MediaId, draft: FrameDraft) => void
  /** Moves this frame to the front, which is what makes it the cover. */
  readonly onMakeCover: (id: MediaId) => void
  /** Writes a clip's poster timestamp. */
  readonly onPoster: (id: MediaId, seconds: number) => void
}

/**
 * A stored size in megabytes, as §2.5's file line prints it.
 *
 * DECIMAL MEGABYTES, one place — "6.1 MB" is what §2.5 shows for a 4032×3024
 * still, which is 6,100,000 bytes rather than 6,395,392. An author comparing
 * this with what their operating system says about the same file should see
 * the same number, and both macOS and Windows Explorer report decimal.
 * @param bytes - The stored original's size.
 * @returns The size, e.g. `'6.1 MB'`.
 */
const megabytes = (bytes: number): string => `${(bytes / 1_000_000).toFixed(1)} MB`

/**
 * The line beneath §2.5's preview.
 *
 * TWO SHAPES, AND THE SECOND ONE IS THE CLIP'S: stills read
 * "…jpg · 4032 × 3024 · 6.1 MB" and clips read
 * "…mp4 · 1920 × 1080 · loops silently", because a clip's file size is not
 * what an author is deciding anything with and its silence is.
 * Any part Payload never measured is left out rather than printed as a blank.
 * @param frame - The frame on screen.
 * @returns The line.
 * @example
 * fileLine(still) // 'tokyo-004.jpg · 4032 × 3024 · 6.1 MB'
 */
export const fileLine = (frame: FrameRow): string => {
  const parts: string[] = [frame.filename]
  if (frame.width !== null && frame.height !== null) parts.push(`${String(frame.width)} × ${String(frame.height)}`)
  if (frame.kind === 'clip') parts.push('loops silently')
  else if (frame.filesize !== null) parts.push(megabytes(frame.filesize))
  return parts.join(' · ')
}

/**
 * A timestamp as §2.5 prints it.
 *
 * @param seconds - A whole, non-negative second.
 * @returns `'0:11'`.
 */
const stamp = (seconds: number): string =>
  /* c8 ignore next -- `clipDuration` refuses a negative or non-finite second, and every second reaching here is either a `posterGrabs` quarter or a `posterAt` the write's own parse already made non-negative; the fallback is a type obligation, not a state */
  clipDuration(seconds) ?? '0:00'

/**
 * The timestamps §2.5's filmstrip offers, in seconds.
 *
 * FOUR, EVENLY SPACED FROM THE START. §2.5 draws `repeat(4, minmax(0,1fr))`
 * and calls them "timestamped grabs" without saying where they are taken, so
 * this is this implementation's reading: quarters of the clip, with the first
 * at zero — which makes the default ("first frame") a grab an author can pick
 * again rather than a state they can only leave.
 * @param durationSec - The clip's length, or `null` for one never measured.
 * @returns Four whole seconds, ascending. All zero for an unmeasured clip,
 *   which is the honest answer: a filmstrip of a clip of unknown length can
 *   only offer its beginning.
 * @example
 * posterGrabs(24) // [0, 6, 12, 18]
 */
export const posterGrabs = (durationSec: number | null): readonly number[] =>
  Array.from({ length: POSTER_GRABS }, (_unused, index) =>
    durationSec === null ? 0 : Math.floor((durationSec * index) / POSTER_GRABS),
  )

/**
 * The draft one frame starts at.
 *
 * @param frame - The frame on screen, or `null`.
 * @returns What the fields hold before the author touches them.
 */
const draftOf = (frame: FrameRow | null): FrameDraft => ({
  caption: frame?.caption ?? '',
  alt: frame?.alt ?? '',
  hidden: frame?.hidden ?? false,
  inBook: frame?.inBook ?? false,
})

/**
 * Renders SCREENS.md §2.5's selected-frame panel.
 *
 * @param props - See {@link SelectedFrameProps}.
 * @returns The panel.
 * @example
 * <SelectedFrame frame={frames[0] ?? null} isCover showsClips onSave={save} … />
 */
export const SelectedFrame = ({
  frame,
  isCover,
  showsClips,
  onSave,
  onMakeCover,
  onPoster,
}: SelectedFrameProps): React.JSX.Element => {
  // RESET BY ID, NOT BY POSITION — see this module's header. Adjusting state
  // during render rather than in an effect is React's own documented shape for
  // "a prop changed and this state is derived from it": an effect would paint
  // the previous frame's caption for one frame first.
  const id = frame?.id ?? null
  const [shownFor, setShownFor] = useState<MediaId | null>(id)
  const [draft, setDraft] = useState<FrameDraft>(() => draftOf(frame))
  if (shownFor !== id) {
    setShownFor(id)
    setDraft(draftOf(frame))
  }

  if (frame === null) {
    return (
      <aside data-selected-frame data-frame-id="" className={styles.panel}>
        <p className={styles.eyebrow}>Selected frame</p>
        <p className={styles.empty}>This journey has no frames yet.</p>
      </aside>
    )
  }

  const grabs = posterGrabs(frame.durationSec)

  return (
    <aside data-selected-frame data-frame-id={frame.id} className={styles.panel}>
      <p className={styles.eyebrow}>Selected frame</p>

      {frame.previewSrc === null ? (
        <span data-frame-preview aria-hidden="true" className={styles.preview} />
      ) : (
        // THE UNCROPPED DERIVATIVE (`readGalleriesScreen.ts`'s `PREVIEW_TIERS`),
        // at `object-fit: contain`: this is the photograph the author is
        // describing, so it is the whole one.
        <img data-frame-preview src={frame.previewSrc} alt={frame.alt} decoding="async" className={styles.preview} />
      )}

      <p data-file-line className={styles.fileLine}>
        {fileLine(frame)}
      </p>

      <label className={styles.field}>
        <span className={styles.label}>Caption</span>
        <input
          type="text"
          data-frame-caption
          className={styles.caption}
          value={draft.caption}
          onChange={(event) => {
            const written = event.target.value
            setDraft((current) => ({ ...current, caption: written }))
          }}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Alt text</span>
        <textarea
          rows={2}
          data-frame-alt
          className={styles.alt}
          value={draft.alt}
          onChange={(event) => {
            const written = event.target.value
            setDraft((current) => ({ ...current, alt: written }))
          }}
        />
      </label>

      <div className={styles.toggles}>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            data-frame-hidden
            checked={draft.hidden}
            onChange={(event) => {
              const ticked = event.target.checked
              setDraft((current) => ({ ...current, hidden: ticked }))
            }}
          />
          Hidden from the gallery
        </label>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            data-frame-cover
            checked={isCover}
            // A FRAME THAT IS THE COVER CANNOT STOP BEING ONE, because
            // something has to be first. See this module's header.
            disabled={isCover}
            onChange={() => {
              onMakeCover(frame.id)
            }}
          />
          Use as gallery cover
        </label>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            data-frame-in-book
            checked={draft.inBook}
            onChange={(event) => {
              const ticked = event.target.checked
              setDraft((current) => ({ ...current, inBook: ticked }))
            }}
          />
          Also place in the book
        </label>
      </div>

      {!showsClips || frame.kind !== 'clip' ? null : (
        <section data-poster-block className={styles.poster}>
          <div className={styles.posterHead}>
            <span className={styles.eyebrow}>Poster frame</span>
            <span
              data-poster-chip
              className={[
                styles.posterChip,
                frame.posterAt === null ? styles.posterChipFirst : styles.posterChipSet,
              ].join(' ')}
            >
              {frame.posterAt === null ? 'first frame' : `set at ${stamp(frame.posterAt)}`}
            </span>
          </div>
          <p className={styles.posterNote}>
            The still the gallery shows before the clip plays. Pick a moment that says what it is.
          </p>
          <div className={styles.filmstrip}>
            {grabs.map((second, index) => (
              // KEYED BY THE SECOND IT GRABS, with the index as the tiebreak
              // for an unmeasured clip, whose four grabs are all zero.
              <button
                key={`${String(second)}-${String(index)}`}
                type="button"
                data-poster-grab={second}
                aria-pressed={frame.posterAt === second}
                className={[styles.grab, frame.posterAt === second ? styles.grabOn : ''].join(' ')}
                onClick={() => {
                  onPoster(frame.id, second)
                }}
              >
                {stamp(second)}
              </button>
            ))}
          </div>
        </section>
      )}

      <button
        type="button"
        data-frame-save
        className={styles.save}
        onClick={() => {
          onSave(frame.id, draft)
        }}
      >
        Save frame
      </button>
    </aside>
  )
}
