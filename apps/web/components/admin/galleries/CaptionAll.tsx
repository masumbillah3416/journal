/**
 * CaptionAll — SCREENS.md §2.5's bulk caption panel: "Caption what is still
 * blank", one row per uncaptioned frame, and one press that writes them all.
 *
 * ═══ IT IS NOT A CLIENT COMPONENT OF ITS OWN ═══
 *
 * It carries no `'use client'` directive and is not in
 * `shellShipsNoClientJs.test.ts`'s `ISLANDS` allowlist, because it is rendered
 * by `FrameGrid.tsx`, which is. A module imported by a client entry is part of
 * that entry; the allowlist counts ENTRIES, and adding a second directive here
 * would claim a second one.
 *
 * ═══ THE INPUTS ARE PLACEHOLDER-HINTED, NOT PRE-FILLED ═══
 *
 * §2.5: the input is "placeholder-hinted with a suggestion", and the panel's
 * closing line is "Anything left empty keeps its file name for now." A
 * pre-filled input would make one press write the suggestion to every frame,
 * which is the opposite sentence. The suggestion is built from the filename
 * ({@link captionSuggestion}) and is a HINT: it is never submitted, and
 * `galleryMutations.ts`'s `applyBulkCaptions` skips a blank row rather than
 * clearing a caption nobody touched.
 *
 * ═══ THE DRAFTS ARE KEYED BY FRAME ID ═══
 *
 * CLAUDE.md §0.9. The list is the journey's uncaptioned frames, and an author
 * can reorder the grid behind this panel — a draft held by row position would
 * land on whichever frame had taken that place.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A list, a record of drafts and
 * one submit.
 * Depends on: react, `BulkCaption` (../../../lib/admin/galleryMutations),
 * `FrameRow` (../../../lib/admin/readGalleriesScreen), ./galleries.module.css.
 */
import type React from 'react'
import { useState } from 'react'
import type { BulkCaption } from '../../../lib/admin/galleryMutations'
import type { FrameRow } from '../../../lib/admin/readGalleriesScreen'
import styles from './galleries.module.css'

/** What the panel needs. */
export interface CaptionAllProps {
  /** The frames with no caption, in the grid's own order. */
  readonly frames: readonly FrameRow[]
  /** Writes every filled row. The panel keeps nothing after the press. */
  readonly onApply: (rows: readonly BulkCaption[]) => void
}

/**
 * A caption this frame could plausibly have, from its file name.
 *
 * A HINT AND NOTHING ELSE — it is the input's `placeholder`, so it is never
 * what gets written. `tokyo-004.jpg` suggests "Tokyo 004", which is enough to
 * tell an author what the row is for without pretending to know what the
 * photograph is of.
 * @param filename - The stored file's name.
 * @returns The suggestion, or `''` for a name with nothing in it.
 * @example
 * captionSuggestion('tokyo-004.jpg') // 'Tokyo 004'
 */
export const captionSuggestion = (filename: string): string => {
  const words = filename
    .replace(/\.[^.]+$/u, '')
    .replace(/[-_]+/gu, ' ')
    .trim()
  const first = words.slice(0, 1)
  return first === '' ? '' : first.toUpperCase() + words.slice(1)
}

/**
 * Renders SCREENS.md §2.5's bulk caption panel.
 *
 * @param props - See {@link CaptionAllProps}.
 * @returns The panel.
 * @example
 * <CaptionAll frames={blank} onApply={apply} />
 */
export const CaptionAll = ({ frames, onApply }: CaptionAllProps): React.JSX.Element => {
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({})

  return (
    <section data-bulk-panel className={styles.bulk}>
      <h2 className={styles.bulkHead}>Caption what is still blank</h2>
      <p data-bulk-count className={styles.bulkCount}>
        {frames.length} frames have no caption
      </p>

      <div className={styles.bulkRows}>
        {frames.map((frame) => (
          // KEYED BY ID, NEVER BY POSITION (CLAUDE.md §0.9).
          <div key={frame.id} data-bulk-row={frame.id} className={styles.bulkRow}>
            {frame.thumbSrc === null ? (
              <span aria-hidden="true" className={styles.bulkThumb} />
            ) : (
              <img src={frame.thumbSrc} alt="" loading="lazy" decoding="async" className={styles.bulkThumb} />
            )}
            <span className={styles.bulkName}>{frame.filename}</span>
            <input
              type="text"
              aria-label={`Caption for ${frame.filename}`}
              placeholder={captionSuggestion(frame.filename)}
              className={styles.bulkInput}
              value={drafts[frame.id] ?? ''}
              onChange={(event) => {
                const written = event.target.value
                setDrafts((current) => ({ ...current, [frame.id]: written }))
              }}
            />
          </div>
        ))}
      </div>

      <div className={styles.bulkFoot}>
        <button
          type="button"
          data-bulk-apply
          className={styles.control}
          // REFUSED WITH NOTHING TO CAPTION, because `applyBulkCaptions` takes
          // `min(1)`: a panel with no rows submitting an empty array would be
          // a refusal an author can reach by pressing a button §2.5 draws.
          disabled={frames.length === 0}
          onClick={() => {
            // EVERY ROW THE PANEL DREW, blanks included. Which of them is
            // written is `galleryMutations.ts`'s rule and it is written down
            // once, in the module whose integration test executes it.
            onApply(frames.map((frame): BulkCaption => ({ id: frame.id, caption: drafts[frame.id] ?? '' })))
            setDrafts({})
          }}
        >
          Apply captions
        </button>
        <p className={styles.bulkNote}>Anything left empty keeps its file name for now.</p>
      </div>
    </section>
  )
}
