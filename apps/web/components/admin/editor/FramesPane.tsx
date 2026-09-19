/**
 * FramesPane — SCREENS.md §2.3's editing pane for a Frames page: the "Editing"
 * eyebrow over the page's name, and the four photo slots in
 * `repeat(auto-fit, minmax(196px, 1fr))`.
 *
 * ═══ IT IS NOT A FORM, AND THAT IS WHY IT HAS NO "SAVE DRAFT" ═══
 *
 * // HANDOFF-DEVIATION: §2.3's pane header lists "Preview page" and "Save
 * draft". The Notes pane draws Save draft because the whole pane IS one form
 * of journey-level fields (`NotesPane.tsx`); a Frames page has no
 * journey-level field on it at all. Its content is four cells, and each cell's
 * controls write on their own — the focal point applies at once, exactly as
 * the layout picker's glyphs do, and the caption and alt text have a Save of
 * their own inside the cell. A "Save draft" here would be a button with
 * nothing to save. "Preview page" is left out for Task 6's reason, unchanged:
 * the address is `/p/<n>`, and `n` is a number only `readBookBundle` computes.
 * See docs/deviations.md.
 *
 * ═══ THE SERVER HALF OF ONE PANE ═══
 *
 * This file is a server component and `SlotPanel` is the client island inside
 * it, which is the split that keeps the island small: the pane's chrome, its
 * eyebrow and its instruction line never reach the browser as JavaScript.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A header and a child.
 * Depends on: react, `JourneyId`/`SlotKey` (@travel-diary/domain/ids),
 * `EditorSlot` (../../../lib/admin/readJourneyEditor), ./SlotPanel,
 * ./editor.module.css.
 */
import type { JourneyId, SlotKey } from '@travel-diary/domain/ids'
import type React from 'react'
import type { EditorSlot } from '../../../lib/admin/readJourneyEditor'
import { SlotPanel } from './SlotPanel'
import styles from './editor.module.css'

/** What SCREENS.md §2.3's Frames pane needs to draw itself. */
export interface FramesPaneProps {
  /** The journey being edited — the cache address every control posts. */
  readonly journey: JourneyId
  /** The selected page's name, which the "Editing" eyebrow sits over. */
  readonly title: string
  /** The page's cells, in cell order. */
  readonly slots: readonly EditorSlot[]
  /** Where a Replace link points before its own `&slot=` — see {@link SlotPanel}. */
  readonly editorHref: string
  /** The cell `?slot=` names, which the pool is currently filling, or `null`. */
  readonly targeted: SlotKey | null
  /** Writes a cell's focal point. */
  readonly setFocal: (form: FormData) => Promise<void>
  /** Writes a cell's caption and alt text. */
  readonly setText: (form: FormData) => Promise<void>
  /** Empties a cell, keeping it. */
  readonly clear: (form: FormData) => Promise<void>
}

/**
 * Renders SCREENS.md §2.3's Frames pane.
 *
 * @param props - See {@link FramesPaneProps}.
 * @returns The pane.
 * @example
 * <FramesPane journey={view.id} title="Frames I" slots={page.slots} … />
 */
export const FramesPane = ({
  journey,
  title,
  slots,
  editorHref,
  targeted,
  setFocal,
  setText,
  clear,
}: FramesPaneProps): React.JSX.Element => (
  <div data-editing-pane data-frames-pane className={styles.pane}>
    <div className={styles.paneHeader}>
      <div>
        <p className={styles.eyebrow}>Editing</p>
        <h2 className={styles.paneName}>{title}</h2>
      </div>
    </div>

    <p className={styles.paneNote}>
      Click a photograph to set where it is cropped from. Replace picks the frame the journey pool fills next.
    </p>

    <SlotPanel
      journey={journey}
      slots={slots}
      editorHref={editorHref}
      targeted={targeted}
      shape="grid"
      setFocal={setFocal}
      setText={setText}
      clear={clear}
    />
  </div>
)
