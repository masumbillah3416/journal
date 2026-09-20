/**
 * UploadCard — SCREENS.md §2.4's "Uploading — 2 of 34" card, with the
 * duplicate notice on the right and one row per file.
 *
 * ═══ IT CARRIES NO DIRECTIVE, AND THAT IS THE POINT OF THE SPLIT ═══
 *
 * Everything here is a function of its props. The state — which files are in
 * flight, how far each has got, how many came back duplicates — belongs to
 * `Dropzone.tsx`, which is the island; this is the drawing. Keeping it a plain
 * component means its cases render it directly, with the numbers a case
 * chooses rather than the numbers an upload happened to produce.
 *
 * ═══ THE DUPLICATE NOTICE IS NOT DECORATION ═══
 *
 * Phase 3's `finaliseUpload` already answers `{ kind: 'duplicate', of }` for a
 * still whose perceptual hash matches one the journey already holds
 * (`apps/web/lib/media/ingestUpload.ts`, `DUPLICATE_MAX_DISTANCE`). The card
 * COUNTS those answers; it does not decide what a duplicate is, and it never
 * invents one. A card with the notice showing is a card that was told.
 *
 * ═══ WHAT THE PERCENTAGE CAN AND CANNOT SAY ═══
 *
 * `percent` is 0 while a file is in flight and 100 when it is finalised —
 * binary, where §2.4's card prints 74% and 31%. The upload is a `fetch` PUT
 * with a `File` body, and a `fetch` body exposes no progress events; the
 * request shape this repository MEASURED against a real Chromium, and asserts
 * against one in `e2e/upload.spec.ts`, is that `fetch`
 * (`apps/web/lib/media/uploadContract.ts`). Switching to `XMLHttpRequest` for
 * the progress events would change the request the receiver's CSRF check is
 * admitted by, unmeasured. Recorded in `docs/deviations.md`; this component
 * draws whatever it is handed, so the day a measured progress source exists it
 * changes in `Dropzone.tsx` alone.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Props in, markup out.
 * Depends on: react, ./media.module.css.
 */
import type React from 'react'
import styles from './media.module.css'

/** One file the card has a row for. */
export interface UploadProgress {
  /**
   * What distinguishes this row, minted when the batch was built.
   *
   * NOT THE FILENAME (CLAUDE.md §0.9). This said "a picker cannot offer the
   * same File twice in one selection", which is true of the picker and false of
   * the zone's `onDrop`: `event.dataTransfer.files` carries two same-named
   * files dragged from two folders, and keying on the name then gave both rows
   * one React key and wrote every per-file update to both of them — one file's
   * refusal printed against its namesake's row.
   */
  readonly id: string
  /** The client's own filename, which the row prints. Not its identity. */
  readonly name: string
  /** How far along, 0 to 100. See this module's header for what it can say. */
  readonly percent: number
  /**
   * Why this file was refused, as a sentence, or `null` when it was not.
   *
   * A REFUSED ROW DRAWS THE SENTENCE WHERE THE TRACK WOULD BE. §2.4 draws no
   * refused row at all, and the track's neighbours are a 230px name cell that
   * truncates and a 78px right cell — neither of which a sentence fits in. The
   * reason went into the NAME before this, which truncated it out of sight and
   * mangled the filename with it (MEDIA-002).
   */
  readonly refusal: string | null
}

/** What the card needs. */
export interface UploadCardProps {
  /** How many of {@link UploadCardProps.total} have finished, whatever they answered. */
  readonly done: number
  /** How many files this batch started with. */
  readonly total: number
  /**
   * How many became a photograph in the library.
   *
   * NOT THE SAME AS {@link UploadCardProps.done}, and the difference is what
   * the finished card counts. A duplicate settles and becomes no row; a
   * refusal settles and becomes no row. A finished card that counted settled
   * files would read "Uploaded — 1 of 1" beside a notice saying the one file
   * was skipped (MEDIA-001's second half).
   */
  readonly stored: number
  /**
   * How many came back `duplicate` from `finaliseUpload`.
   *
   * The notice is drawn only above zero: a card announcing "0 look like
   * duplicates" would be a notice about nothing, every time.
   */
  readonly duplicates: number
  /** One row per file, in the order the picker offered them. */
  readonly files: readonly UploadProgress[]
}

/**
 * The eyebrow's sentence.
 *
 * ═══ THE VERB CHANGES WHEN THE BATCH DOES, AND SO DOES THE NUMBER ═══
 *
 * SCREENS.md §2.4 draws the card in ONE state — "Uploading — 2 of 34", a batch
 * mid-flight — and says nothing about a finished one, because nothing in a
 * prototype finishes. This card kept the design's sentence after every file had
 * settled, so the screen said an upload was in progress when none was
 * (`docs/qa/2026-09-20-media-screen-sweep.md`, MEDIA-001). The past tense is
 * this implementation's and is recorded in `docs/deviations.md`.
 *
 * WHILE FILES ARE IN FLIGHT the number is how many have SETTLED, which is what
 * §2.4's own "2 of 34" counts. ONCE THEY HAVE the number is how many became a
 * photograph, because that is the question a finished card answers.
 * @param counts - What the batch started with, what has settled, and what
 *   became a row.
 * @returns The eyebrow's text.
 * @example
 * uploadEyebrow({ done: 2, total: 34, stored: 2 }) // 'Uploading — 2 of 34'
 * uploadEyebrow({ done: 34, total: 34, stored: 31 }) // 'Uploaded — 31 of 34'
 */
export const uploadEyebrow = (counts: {
  readonly done: number
  readonly total: number
  readonly stored: number
}): string =>
  counts.done < counts.total
    ? `Uploading — ${String(counts.done)} of ${String(counts.total)}`
    : `Uploaded — ${String(counts.stored)} of ${String(counts.total)}`

/**
 * The sentence the duplicate notice prints.
 *
 * Exported so `UploadCard.test.tsx` asserts the wording against the design's
 * own rather than against a copy of it, and so the plural is decided once.
 * @param duplicates - How many came back duplicate.
 * @returns The notice's text.
 * @example
 * duplicateNotice(3) // '3 look like duplicates — skipped'
 */
export const duplicateNotice = (duplicates: number): string =>
  `${String(duplicates)} ${duplicates === 1 ? 'looks like a duplicate' : 'look like duplicates'} — skipped`

/**
 * Renders SCREENS.md §2.4's upload card.
 *
 * @param props - See {@link UploadCardProps}.
 * @returns The card, or `null` when there is nothing in flight — the screen
 *   draws no empty card, which is what the design shows.
 * @example
 * <UploadCard done={2} total={34} stored={2} duplicates={3} files={rows} />
 */
export const UploadCard = ({ done, total, stored, duplicates, files }: UploadCardProps): React.JSX.Element | null => {
  if (total === 0) return null

  return (
    <section data-upload-card aria-label="Uploading" className={styles.uploadCard}>
      <div className={styles.uploadHead}>
        <p data-upload-count className={styles.eyebrow}>
          {uploadEyebrow({ done, total, stored })}
        </p>
        <span className={styles.uploadSpacer} />
        {duplicates === 0 ? null : (
          <p data-upload-duplicates className={styles.duplicates}>
            <span aria-hidden="true" className={styles.duplicatesMark} />
            <span className={styles.duplicatesText}>{duplicateNotice(duplicates)}</span>
          </p>
        )}
      </div>

      <ul className={styles.uploadRows}>
        {files.map((file) => (
          // KEYED BY THE MINTED ID. An index key would re-label every row when
          // a finished one is dropped from the list, and the filename is not
          // unique within a batch — see {@link UploadProgress.id}.
          <li key={file.id} data-upload-row className={styles.uploadRow}>
            <span className={styles.uploadName}>{file.name}</span>
            {file.refusal === null ? (
              <span className={styles.uploadTrack}>
                {/* The one inline style on this screen, and it is a MEASUREMENT
                 * rather than a design value: the fill's width is this file's
                 * own percentage, which no stylesheet can know. Everything that
                 * is a design value is in `media.module.css`. */}
                <span
                  data-upload-fill
                  aria-hidden="true"
                  className={styles.uploadFill}
                  style={{ width: `${String(file.percent)}%` }}
                />
              </span>
            ) : (
              <span data-upload-refusal className={styles.uploadRefusal}>
                {file.refusal}
              </span>
            )}
            <span data-upload-state className={styles.uploadState}>
              {file.refusal === null ? `${String(file.percent)}%` : 'refused'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
