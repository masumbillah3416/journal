/**
 * EphemeraSlot — the Notes page's taped scrap, SCREENS.md §1.3.
 *
 * Presentational component (CLAUDE.md §3.3) with no hooks, no handlers and no
 * state.
 *
 * THIS ELEMENT IS LOAD-BEARING LAYOUT, NOT DECORATION, and it is the reason
 * this file exists at all rather than eight lines inside `Notes.tsx`.
 * SCREENS.md §1.3 records the defect it was introduced to fix:
 *
 *   > Fixed content plus leftover height produced a dead band, and
 *   > `justify-content: space-between` on the highlight list dumped 232px
 *   > into two gaps when a journey had three highlights instead of four. The
 *   > fix is a *media element* taking the elastic space — it can absorb 54px
 *   > or 300px without breaking. Highlights are capped at 4 and sized to
 *   > content.
 *
 * So it is `flex: 1` with a `min-height: 54px` floor, and the four things
 * above it in the column are all sized to their content. THE ELEMENT IS
 * RENDERED EVEN WHEN THE JOURNEY HAS NO EPHEMERA PHOTO: with no slot there
 * is no image, but the box still takes the leftover height, because removing
 * it would hand that height straight back to the highlight list and
 * reintroduce the defect for exactly the journeys whose editor has not
 * uploaded a scrap yet.
 *
 * ITS IMAGE IS DECORATIVE, so it carries `alt=""` rather than the slot's own
 * alt text. `ephemera` is a role in the schema, not an editorial choice: it
 * is a texture behind tape, and the seed says so where it creates one ("a
 * decorative texture, not a photograph with a subject to describe" —
 * `apps/web/scripts/seed.ts`). An empty `alt` takes it out of the
 * accessibility tree entirely, which is correct; announcing the placeholder
 * label the media row happens to carry would be noise between the tally and
 * the page's footer.
 *
 * ITS BYTES ARE WINDOWED, ITS MARKUP IS NOT. `loadsImages` comes from
 * `leafPresentation` (packages/domain/src/pageStack.ts) and says whether this
 * leaf is near enough to the reader to fetch anything. Outside the window the
 * scrap keeps its box, its focal point and its (empty) alt, and carries
 * {@link DEFERRED_PHOTOGRAPH_SRC} instead of a real one.
 * Depends on: react, `Slot` (@travel-diary/domain/bookBundle),
 * ./deferredPhotograph, ./notes.module.css.
 */
import type { Slot } from '@travel-diary/domain/bookBundle'
import type React from 'react'
import { DEFERRED_PHOTOGRAPH_SRC } from './deferredPhotograph'
import styles from './notes.module.css'

/** What the ephemera slot needs to draw itself. */
export interface EphemeraSlotProps {
  /**
   * The page's `ephemera` slot, or `undefined` when the journey has none.
   * The box is drawn either way — see this module's header.
   */
  readonly slot: Slot | undefined
  /** Whether the `book` global's decorations flag lets the washi strip be drawn. */
  readonly showDecorations: boolean
  /** Whether this leaf is inside the reader's image window, from `leafPresentation.loadsImages`. */
  readonly loadsImages: boolean
}

/**
 * Renders the ephemera slot: the elastic box, its photograph if there is one,
 * and — behind the decorations flag — the washi strip taped across its top.
 *
 * @param props - The ephemera slot, the decorations flag and the leaf's image window.
 * @returns The taped scrap that absorbs the left column's leftover height.
 * @example
 * <EphemeraSlot slot={page.slots?.find((s) => s.role === 'ephemera')} showDecorations loadsImages />
 */
export const EphemeraSlot = ({ slot, showDecorations, loadsImages }: EphemeraSlotProps): React.JSX.Element => (
  <div data-ephemera="" className={styles.ephemera}>
    {slot !== undefined && (
      <img
        className={styles.ephemeraImage}
        src={loadsImages ? slot.src : DEFERRED_PHOTOGRAPH_SRC}
        alt=""
        // Low priority deliberately: `Book.tsx` renders every one of the
        // book's leaves at once, and the window still admits the reader's two
        // neighbours, so a scrap here is never the page the reader is looking
        // at. None of them is the LCP element on any page, and the diary
        // route's LCP budget (CLAUDE.md §6) has very little headroom.
        //
        // `loading="lazy"` is deliberately NOT set. Measured on `/p/1`: every
        // leaf sits at `inset: 0`, so the browser counts all thirty-three as
        // in the viewport and fetched all twenty photographs anyway. The
        // window above is the real deferral; leaving `lazy` on would make the
        // neighbour's preload depend on a browser continuing to treat a
        // hidden, stacked leaf as visible, which is the pop-in defect waiting
        // to happen.
        decoding="async"
        fetchPriority="low"
        style={{ objectPosition: `${String(slot.focalX)}% ${String(slot.focalY)}%` }}
      />
    )}
    {showDecorations && <span data-decoration="washi" aria-hidden="true" className={styles.ephemeraWashi} />}
  </div>
)
