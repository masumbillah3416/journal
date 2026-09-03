/**
 * PhotoMount — one taped photograph on paper: the mount, the photograph, its
 * caption and, where the design gives it one, a strip of washi tape.
 *
 * Presentational component (CLAUDE.md §3.3) with no hooks, no handlers and no
 * state. It is the shape SCREENS.md repeats eight times across §1.4-§1.6 —
 * seven frames and the About portrait — and it exists because those eight
 * differ only in numbers a stylesheet can express, never in structure.
 *
 * WHAT IT OWNS versus WHAT THE PAGE OWNS. This file owns the STRUCTURE: a
 * `<figure>` on mount paper, a photograph that takes the leftover height at
 * `object-fit: cover`, a `<figcaption>` under it, and the tape on top. The
 * printing page owns every NUMBER: its padding (`12px 12px 0` on Frames I's
 * P1, `10px 10px 0` on its neighbours), its rotation (eight authored angles
 * from -1.6deg to +1.5deg, none of them jitter), its caption size (22px to
 * 26px), its drop shadow and its grid placement. Those arrive as classes
 * rather than as props with values in them, because they are DESIGN and the
 * design lives in the stylesheet next to the rest of the page's absolute
 * geometry - `photoMount.module.css`'s header says which three rules are
 * structural and therefore here instead.
 *
 * THE FOCAL POINT IS THE ONE VALUE THAT IS NOT DESIGN, and it is the reason
 * this component takes a whole {@link Slot} rather than a `src` and an `alt`.
 * SCREENS.md is blunt about it: "If this is not wired through to rendering,
 * the admin's focal-point picker is decorative." It is applied as
 * `object-position` by `<Photograph>`, inline, because it depends on the
 * editor's choice for THIS placement, which no stylesheet can see.
 *
 * ITS BYTES ARE WINDOWED, ITS MARKUP IS NOT, and this file neither decides
 * that nor carries a flag for it. `<Photograph>` reads
 * `leafPresentation.loadsImages` out of the context `Book.tsx` publishes, so
 * a mount stays a server component whose code never reaches the browser and
 * cannot forget to honour the window - see `./Photograph.tsx`'s header for
 * why that seam is a context. All this component hands down is `leafIndex`,
 * which leaf of the book it is printed on. That matters more here than
 * anywhere else in the diary: these pages put SEVEN photographs on each
 * journey, so a mount that fetched eagerly would put roughly seventy extra
 * images into `/p/1`'s initial load on its own.
 *
 * AN EMPTY CAPTION PRINTS NOTHING, not an empty `<figcaption>` - the same
 * policy `Cover.tsx` and `Notes.tsx` apply to every optional line. Neither
 * `pages.slots[].caption` nor `about.portraitCaption` is `required: true`, so
 * a photograph an editor has not captioned yet is an ordinary state.
 * Depends on: react, `Slot` (@travel-diary/domain/bookBundle), ./Photograph,
 * ./WashiTape, ./photoMount.module.css.
 */
import type { Slot } from '@travel-diary/domain/bookBundle'
import type React from 'react'
import { Photograph } from './Photograph'
import { WashiTape } from './WashiTape'
import styles from './photoMount.module.css'

/**
 * The printing page's own classes for one mount: everything SCREENS.md states
 * as a number for that placement. Each admits `undefined` because a CSS
 * Module's generated type does.
 */
export interface PhotoMountClasses {
  /** The mount's grid placement, padding, rotation and drop shadow. */
  readonly mount: string | undefined
  /** The caption's size, leading and padding. */
  readonly caption: string | undefined
  /**
   * The washi strip's size, offset, angle and torn `clip-path`, or
   * `undefined` for a mount the design gives no tape - which is five of the
   * eight. A mount with no strip in the design and a mount whose strips are
   * switched off by the `book` global then take the same path.
   */
  readonly washi: string | undefined
}

/** What one taped photograph needs to print itself. */
export interface PhotoMountProps {
  /** The photo slot this mount prints: its derivative URL, alt, caption and focal point. */
  readonly slot: Slot
  /** Which leaf of the book this mount is printed on, for the image window to look up. */
  readonly leafIndex: number
  /**
   * The value of this mount's `data-mount` attribute - `"p1"` through `"p4"`
   * on the Frames pages, `"portrait"` on About. It is how the browser suites
   * address ONE mount on a page that has four, and how they tell "the
   * photographs are all present" from "the photographs are in the right
   * cells".
   */
  readonly handle: string
  /** The printing page's own classes for this mount - see {@link PhotoMountClasses}. */
  readonly classes: PhotoMountClasses
  /** Whether the `book` global's decorations flag lets this mount's washi strip be drawn. */
  readonly showDecorations: boolean
}

/**
 * Renders one taped photograph: the mount, the photograph cropped at its
 * slot's focal point, the caption and - behind the decorations flag - the
 * washi strip.
 *
 * @param props - The slot, the leaf it is printed on, its handle, its
 *   page-owned classes and the decorations flag.
 * @returns The mounted photograph.
 * @example
 * <PhotoMount slot={slot} leafIndex={3} handle="p1" classes={classes} showDecorations />
 */
export const PhotoMount = ({
  slot,
  leafIndex,
  handle,
  classes,
  showDecorations,
}: PhotoMountProps): React.JSX.Element => (
  // The two class names are JOINED rather than interpolated: a CSS Module's
  // generated type resolves an unknown key to `undefined`, and `Array.join`
  // already renders that as an empty string - where a template literal would
  // print "undefined" into the attribute, and a `?? ''` guard would add a
  // branch to every mount that no test could ever take.
  <figure data-mount={handle} className={[styles.mount, classes.mount].join(' ')}>
    <Photograph
      leafIndex={leafIndex}
      role={slot.role}
      src={slot.src}
      alt={slot.alt}
      focalX={slot.focalX}
      focalY={slot.focalY}
      className={styles.photo}
    />

    {slot.caption !== '' && (
      <figcaption className={[styles.caption, classes.caption].join(' ')}>{slot.caption}</figcaption>
    )}

    {showDecorations && classes.washi !== undefined && <WashiTape className={classes.washi} />}
  </figure>
)
