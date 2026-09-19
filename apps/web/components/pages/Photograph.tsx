'use client'
/**
 * Photograph — one `<img>` of the book, and the seam the image window
 * crosses to reach it.
 *
 * THIS IS THE ONLY `'use client'` FILE UNDER `components/pages/`, and it is
 * eleven lines of component. Every page component around it — Cover,
 * Contents, Notes and the slots they compose — is a server component whose
 * code never reaches the browser: the route renders all thirty-three faces on
 * the server and passes them into `<Book>` as children (see `Book.tsx`'s
 * header for the measurement). That leaves exactly one problem, and this file
 * is the answer to it.
 *
 * THE PROBLEM. `leafPresentation.loadsImages`
 * (`packages/domain/src/pageStack.ts`) decides which leaves may fetch their
 * photographs, and it is a function of where the flip machine is — which is
 * browser state, changing as the reader turns pages. A server-rendered face
 * is rendered once, before any of that exists, so the window CANNOT arrive at
 * a photograph as a prop threaded down from the page: it would freeze at the
 * page the reader happened to arrive on, and the leaf a bookmark jump lands
 * on would keep its placeholder for the life of the visit. That is not a
 * smaller version of the window, it is a broken one — `e2e/imageWindow.spec.ts`
 * requires the destination's photograph to be in place at the FIRST FRAME of
 * a turn.
 *
 * THE ANSWER: A CONTEXT, WHICH IS THE ONE THING THAT CROSSES THIS SEAM.
 * Server-rendered children are placed inside the client `<Book>` when React
 * renders it, so a client component nested anywhere in them resolves context
 * against `<Book>`'s own providers. `<ImageWindow>` publishes one array,
 * indexed by leaf; this component reads its own entry and nothing else. The
 * arithmetic still happens exactly once, in the domain — the DOM layer never
 * re-derives flip geometry (`pageStack.ts`'s own standing rule), it only
 * looks its leaf up.
 *
 * WHAT THAT BUYS BEYOND BYTES. A page component no longer has to remember to
 * accept and forward a `loadsImages` prop for its photographs to be windowed;
 * it just renders a `<Photograph>`. `docs/adr/0006-diary-image-window.md`
 * recorded the opposite arrangement's one standing obligation — that Frames I
 * and II must take and honour the flag, and that a page which ignored it
 * would put its journey's photographs back into every route's initial load
 * with nothing to complain about. That obligation is now discharged by
 * construction.
 *
 * NO PROVIDER MEANS LOAD. A photograph outside a book is just a photograph,
 * and that is the useful default for a component test and for any future page
 * that prints one outside the stack. It is also the loud failure rather than
 * the quiet one: a `<Book>` that forgot to publish the window would fetch
 * every photograph, which `e2e/imageWindow.spec.ts` counts and fails on,
 * where the opposite default would render a book of blank mounts that no
 * network assertion would notice.
 *
 * `loading="lazy"` IS DELIBERATELY ABSENT. Measured on `/p/1`: every leaf sits
 * at `inset: 0`, so the browser counts all thirty-three as in the viewport
 * and fetched all twenty photographs anyway. The window is the deferral.
 * Depends on: react, `SlotRole` (@travel-diary/domain/bookBundle),
 * ./deferredPhotograph.
 */
import type { SlotRole } from '@travel-diary/domain/bookBundle'
import type React from 'react'
import { createContext, useContext } from 'react'
import { DEFERRED_PHOTOGRAPH_SRC } from './deferredPhotograph'

/**
 * Which leaves may fetch their photographs right now, indexed by leaf.
 * Published by `Book.tsx` straight from `leafPresentation.loadsImages`; `null`
 * means no book is in scope — see this module's header.
 */
export const ImageWindow = createContext<readonly boolean[] | null>(null)

/** What one photograph of the book needs to print itself. */
export interface PhotographProps {
  /** The leaf this photograph is printed on, its index into the window. */
  readonly leafIndex: number
  /** Which role the slot plays; only the hero publishes a `data-hero` handle. */
  readonly role: SlotRole
  /**
   * The photograph's real source, fetched only inside the window, or `null`
   * for a cell with nothing to draw.
   *
   * `null` IS AN ORDINARY STATE, not an error — see `Slot.src`
   * (@travel-diary/domain/bookBundle): an empty cell, a media row the pipeline
   * has not finished, and a hidden one all arrive here as `null`, and this is
   * the ONE place the diary decides what an empty frame looks like.
   */
  readonly src: string | null
  /** The slot's alt text, or `''` for a decorative scrap. */
  readonly alt: string
  /** The editor's focal point, as `object-position` percentages. */
  readonly focalX: number
  /** The editor's focal point, as `object-position` percentages. */
  readonly focalY: number
  /**
   * The class the printing page gives it, passed in so that page's stylesheet
   * - and the class map generated from it - stay on the server. Admits
   * `undefined` because a CSS Module's generated type does: an unknown key
   * resolves to `undefined`, and `<img>` accepts that as "no class".
   */
  readonly className: string | undefined
}

/**
 * Renders one of the book's photographs, fetching its bytes only while its
 * leaf is inside the reader's image window.
 *
 * @param props - The leaf it sits on, the slot it prints and the class to print it with.
 * @returns The photograph, real or stood in for.
 * @example
 * <Photograph leafIndex={2} role="hero" src={hero.src} alt={hero.alt} focalX={50} focalY={50} className={styles.heroPhoto} />
 */
export const Photograph = ({
  leafIndex,
  role,
  src,
  alt,
  focalX,
  focalY,
  className,
}: PhotographProps): React.JSX.Element => {
  const openLeaves = useContext(ImageWindow)
  const inWindow = openLeaves === null || (openLeaves[leafIndex] ?? false)
  // AN EMPTY CELL IS THE DEFERRED PHOTOGRAPH'S OWN TREATMENT, and that is a
  // reuse rather than a coincidence: both are "this element keeps its box, its
  // shape and its place in the layout, and fetches nothing". The 1x1
  // transparent GIF costs no request, `object-fit: cover` renders it as
  // nothing, and the mount, its tape and its caption are drawn around it
  // exactly as they are around a photograph that has not loaded yet.
  const empty = src === null

  return (
    <img
      // The hero is the one photograph on a page with a subject, and the
      // handle every browser and visual gate selects on. The scrap gets none:
      // a second element answering `[data-hero]` would make those assertions
      // ambiguous.
      data-hero={role === 'hero' ? '' : undefined}
      className={className}
      // A HANDLE FOR THE ONE STATE A SCREENSHOT CANNOT TELL APART. An empty
      // cell and a photograph outside the image window draw the same pixels,
      // so the browser gates need something in the DOM that says which.
      data-empty={empty ? '' : undefined}
      src={empty || !inWindow ? DEFERRED_PHOTOGRAPH_SRC : src}
      // AN EMPTY CELL ANNOUNCES NOTHING. The slot's alt text describes a
      // photograph that is not there, so reading it out would tell a screen
      // reader about content the page does not have.
      alt={empty ? '' : alt}
      // Low priority deliberately: every leaf of the book is in the document
      // at once and the window still admits the reader's two neighbours, so a
      // photograph here is usually one the reader is not looking at. None of
      // them is the LCP element on any page, and the diary route's LCP budget
      // (CLAUDE.md §6) has no headroom at all.
      decoding="async"
      fetchPriority="low"
      style={{ objectPosition: `${String(focalX)}% ${String(focalY)}%` }}
    />
  )
}
