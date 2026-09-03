/**
 * surface.ts — which of the diary's two reading surfaces a project is drawing.
 *
 * SCREENS.md §1.10 replaces the book below 860px: "No book, no flip, no
 * scaling." The harness runs every spec at all three viewport projects
 * (`playwright.config.ts`), so from Phase 1 Task 15 onward a spec about the
 * book is a spec about `desktop` and `mid`, and a spec about the mobile
 * reading mode is a spec about `mobile`. This module is how a spec says which
 * it is, in one line, against the domain's own breakpoint rather than a 860
 * repeated in a dozen files.
 *
 * WHY SKIP RATHER THAN REWRITE. A book spec's mobile run was never asserting
 * anything a reader below 860px will now meet - the design says there is no
 * book there - so skipping it removes a case that had stopped describing the
 * product, and the reasons live in each spec's own `test.skip` message. The
 * one file that does NOT take that route is `e2e/layout.spec.ts`, whose four
 * cases are the record of an S1 defect found at 390px; it asks the mobile
 * surface the same four questions instead of standing down. See that file's
 * header.
 * Depends on: `MOBILE_READING_MAX_WIDTH_PX` (@travel-diary/domain/readingSurface).
 */
import { MOBILE_READING_MAX_WIDTH_PX } from '@travel-diary/domain/readingSurface'

/**
 * Whether a project's viewport is one the diary draws the mobile reading mode
 * at.
 *
 * @param viewport - The project's viewport, which Playwright reports as `null`
 *   for a run with no viewport emulation at all. Such a run has no width to
 *   judge, so it is treated as the book's - the surface the harness's other
 *   two projects use and the one every existing spec was written against.
 * @returns `true` below the design's 860px breakpoint.
 * @example
 * test.skip(({ viewport }) => drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')
 */
export const drawsMobileReadingMode = (viewport: { readonly width: number } | null): boolean =>
  viewport !== null && viewport.width < MOBILE_READING_MAX_WIDTH_PX
