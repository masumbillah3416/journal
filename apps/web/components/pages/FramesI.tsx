/**
 * FramesI — a journey's second page, SCREENS.md §1.4 transcribed.
 *
 * Presentational component (CLAUDE.md §3.3) over the already-assembled
 * {@link JourneyPage}. It derives nothing: the journey's name, dates and
 * three photo slots all arrive on the page from `readBookBundle`. No hooks,
 * no handlers, no state — the whole page is one static subtree, and the diary
 * route pays no interactivity for it.
 *
 * EVERY MEASUREMENT IS ABSOLUTE inside the 1300x860 design box; see
 * `frames.module.css`'s header, which also carries the reason the three
 * rotations are three different numbers and must stay that way.
 *
 * THE SLOTS ARE FOUND BY POSITION HERE, AND THAT IS THE EXCEPTION TO
 * CLAUDE.md §7's rule, stated at the point it is relied upon. `Notes.tsx`
 * looks its two slots up by `role`, because a hero and an ephemera scrap play
 * different parts and an editor reordering the array must not swap them. All
 * three slots on this page play the SAME part — `role: 'frame'` — so `role`
 * cannot tell P1 from P3, and the array's order is the only thing that can:
 * `JourneyPageInfo.slots` is documented as "this page's resolved photo slots,
 * IN DISPLAY ORDER", and the admin's own slot list is the editor's control
 * over which photograph lands in the big left-hand cell. Position is
 * therefore the meaning here rather than an accident of storage.
 *
 * A MISSING SLOT LEAVES ITS CELL EMPTY rather than promoting its neighbour.
 * `pages.slots` has no minimum length in the schema, so a journey whose
 * editor has uploaded two frames rather than three is an ordinary state; the
 * grid's tracks are `1fr` and fixed, so the two that exist stay in the cells
 * the design put them in instead of resizing the page around the gap.
 * Anything past the third is not rendered at all — SCREENS.md §1.4 designs
 * three cells, and a fourth photograph would have nowhere to go.
 *
 * THIS PAGE HAS NO FOOTER, unlike the other two of its journey's three. That
 * is SCREENS.md §1.4's own layout — `grid-template-rows: auto 1fr`, two rows
 * — and it is why the gallery button, the count and the sign-off appear on
 * the Notes page and on Frames II but not here.
 *
 * THE PHOTOGRAPHS ARE WINDOWED, THE WORDS ARE NOT, and this page carries no
 * flag for it: `<PhotoMount>` hands `leafIndex` to `<Photograph>`, which
 * reads the window out of the context `Book.tsx` publishes. See
 * `./Photograph.tsx`'s header for why that seam is a context and not a prop.
 * It matters more on this page than on any before it — three photographs
 * here and four on Frames II take the seeded book from twenty images to
 * roughly ninety, so a page that ignored the window would reverse the whole
 * of `docs/adr/0006-diary-image-window.md` on its own.
 * Depends on: react, `JourneyPage` (@travel-diary/domain/bookBundle),
 * ./PhotoMount, ./frames.module.css.
 */
import type { JourneyPage } from '@travel-diary/domain/bookBundle'
import type React from 'react'
import { PhotoMount, type PhotoMountClasses } from './PhotoMount'
import styles from './frames.module.css'

/** What the Frames I page needs to print itself. */
export interface FramesIProps {
  /** The journey's first frames page, from the bundle's reading sequence. */
  readonly page: JourneyPage
  /** The `book` global's decorations flag, gating the washi strip. */
  readonly showDecorations: boolean
  /** Which leaf of the book this page is printed on, for the image window to look up. */
  readonly leafIndex: number
}

/**
 * The eyebrow beside the journey's name. SCREENS.md §1.4 states it as a fixed
 * string rather than deriving it from the slot count: this page is always
 * frames one to three of the journey's seven, whether or not all three slots
 * have been filled.
 */
const FRAME_RANGE = 'Frames 01 – 03'

/**
 * The three cells SCREENS.md §1.4 designs, in display order, each with the
 * classes carrying its own padding, rotation, shadow, caption size and — for
 * P1 alone — its washi strip. The table is the layout: `FramesI` maps the
 * page's slots onto it by position, so adding a cell is a change here and in
 * the stylesheet, never in the component's body.
 */
const CELLS: readonly { readonly handle: string; readonly classes: PhotoMountClasses }[] = [
  {
    handle: 'p1',
    classes: { mount: styles.oneP1, caption: styles.oneP1Caption, washi: styles.oneWashi },
  },
  {
    handle: 'p2',
    classes: { mount: styles.oneP2, caption: styles.oneSmallCaption, washi: undefined },
  },
  {
    handle: 'p3',
    classes: { mount: styles.oneP3, caption: styles.oneSmallCaption, washi: undefined },
  },
]

/**
 * Renders a journey's first frames page: the header, and the three-photograph
 * grid SCREENS.md §1.4 lays out.
 *
 * @param props - The journey's frames page, the book's decorations flag and
 *   the leaf it is printed on.
 * @returns The Frames I page.
 * @example
 * <FramesI page={page} showDecorations={bundle.chrome.showDecorations} leafIndex={3} />
 */
export const FramesI = ({ page, showDecorations, leafIndex }: FramesIProps): React.JSX.Element => (
  <section data-page="frames-i" className={styles.framesI}>
    <header className={styles.header}>
      <h1 className={styles.name}>{page.name}</h1>
      <p className={styles.frameLabel}>{FRAME_RANGE}</p>
      {page.dates !== '' && <p className={styles.headerAside}>{page.dates}</p>}
    </header>

    <div data-frames-grid="" className={styles.gridOne}>
      {CELLS.map((cell, position) => {
        const slot = page.slots?.[position]
        if (slot === undefined) return null

        return (
          <PhotoMount
            key={cell.handle}
            slot={slot}
            leafIndex={leafIndex}
            handle={cell.handle}
            classes={cell.classes}
            showDecorations={showDecorations}
          />
        )
      })}
    </div>
  </section>
)
