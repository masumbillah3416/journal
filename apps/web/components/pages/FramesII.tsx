/**
 * FramesII — a journey's third page, SCREENS.md §1.5 transcribed.
 *
 * Presentational component (CLAUDE.md §3.3) over the already-assembled
 * {@link JourneyPage}, and the sibling of `FramesI.tsx`: same header pattern,
 * same mounts, a wider grid and a footer. Everything its header says about
 * finding slots by position, about a missing slot leaving its cell empty, and
 * about the image window applies here unchanged and is not repeated; what
 * differs is set out below.
 *
 * THE GRID IS THREE COLUMNS, NOT TWO, and the fourth photograph spans two of
 * them on the second row. SCREENS.md §1.5's `1fr 1fr 1fr` x `1fr 1fr` at
 * `20px 22px` is a different rhythm from §1.4's `1.5fr 1fr` — the journey's
 * two frames spreads are meant to look different from one another, not like
 * the same page twice.
 *
 * THIS PAGE HAS THE FOOTER FRAMES I DOES NOT: "gallery button, count, and
 * 'Only a few frames live in the book'". That is the third grid row, and it
 * is why this page's `grid-template-rows` is `auto 1fr auto` where Frames I's
 * is `auto 1fr`.
 *
 * THE GALLERY BUTTON IS AN ANCHOR, not a button with a handler — the same
 * rule and the same reason as `Notes.tsx`'s, which its header records at
 * length: the handoff's own defect log has gallery buttons that "appeared
 * dead while their handlers were fine", and README.md requires the deep links
 * to be real, indexable paths. `/gallery/<slug>` is the path Task 14 builds.
 *
 * THE COUNT IS THE JOURNEY'S, NOT THE PAGE'S. `page.gallery` is a census of
 * the journey's whole media library taken by `readBookBundle` (CLAUDE.md §7,
 * "derive, never store ... media counts"), which is exactly why the line
 * beside it reads "Only a few frames live in the book" — the four
 * photographs above it are a selection from that library, not the whole of
 * it.
 * Depends on: react, `JourneyPage` (@travel-diary/domain/bookBundle),
 * ./PhotoMount, ./frames.module.css.
 */
import type { JourneyPage } from '@travel-diary/domain/bookBundle'
import type React from 'react'
import { PhotoMount, type PhotoMountClasses } from './PhotoMount'
import styles from './frames.module.css'

/** What the Frames II page needs to print itself. */
export interface FramesIIProps {
  /** The journey's second frames page, from the bundle's reading sequence. */
  readonly page: JourneyPage
  /** The `book` global's decorations flag, gating the washi strip. */
  readonly showDecorations: boolean
  /** Which leaf of the book this page is printed on, for the image window to look up. */
  readonly leafIndex: number
}

/**
 * The eyebrow beside the journey's name — the second half of the journey's
 * seven frames, stated by SCREENS.md §1.5 as a fixed string for the same
 * reason `FramesI`'s is.
 */
const FRAME_RANGE = 'Frames 04 – 07'

/** The closing line at the foot of the page, SCREENS.md §1.5, verbatim. */
const FRAMES_NOTE = 'Only a few frames live in the book'

/**
 * The four cells SCREENS.md §1.5 designs, in display order, each with the
 * classes carrying its own padding, rotation, shadow, caption size and — for
 * P3 alone — its washi strip. See `FramesI`'s own table for why the layout
 * lives in a table rather than in the component's body.
 */
const CELLS: readonly { readonly handle: string; readonly classes: PhotoMountClasses }[] = [
  {
    handle: 'p1',
    classes: { mount: styles.twoP1, caption: styles.twoP1Caption, washi: undefined },
  },
  {
    handle: 'p2',
    classes: { mount: styles.twoP2, caption: styles.twoSmallCaption, washi: undefined },
  },
  {
    handle: 'p3',
    classes: { mount: styles.twoP3, caption: styles.twoSmallCaption, washi: styles.twoWashi },
  },
  {
    handle: 'p4',
    classes: { mount: styles.twoP4, caption: styles.twoP4Caption, washi: undefined },
  },
]

/**
 * Renders a journey's second frames page: the header, the four-photograph
 * grid SCREENS.md §1.5 lays out, and the footer's gallery link, count and
 * closing line.
 *
 * @param props - The journey's frames page, the book's decorations flag and
 *   the leaf it is printed on.
 * @returns The Frames II page.
 * @example
 * <FramesII page={page} showDecorations={bundle.chrome.showDecorations} leafIndex={4} />
 */
export const FramesII = ({ page, showDecorations, leafIndex }: FramesIIProps): React.JSX.Element => (
  <section data-page="frames-ii" className={styles.framesII}>
    <header className={styles.header}>
      <h1 className={styles.name}>{page.name}</h1>
      <p className={styles.frameLabel}>{FRAME_RANGE}</p>
      {page.place !== '' && <p className={styles.headerAside}>{page.place}</p>}
    </header>

    <div data-frames-grid="" className={styles.gridTwo}>
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

    <footer className={styles.footer}>
      <a className={styles.galleryButton} href={`/gallery/${page.slug}`}>
        See full gallery
        <span aria-hidden="true" className={styles.galleryArrow}>
          &#8594;
        </span>
      </a>

      <p className={styles.count}>
        {page.gallery.photographs} photographs and {page.gallery.clips} clips in the gallery
      </p>

      <p className={styles.framesNote}>{FRAMES_NOTE}</p>
    </footer>
  </section>
)
