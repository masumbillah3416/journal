/**
 * signInTitle — sizing the book's name so it fits the sign-in screen's two
 * cloth blocks.
 *
 * SCREENS.md §3 asks the cloth panel for a "fitted title" and the narrow
 * masthead for a "fitted title (28-44px)", and gives no formula for either.
 * The handoff's own prototype does
 * (`handoff/design_handoff_travel_diary/Travel Diary Login.dc.html`):
 *
 *   cloth panel  `Math.max(30, Math.min(84, Math.floor(300 / (len * 0.4))))`
 *   masthead     `Math.max(28, Math.min(44, Math.floor(190 / (len * 0.4))))`
 *
 * Both are taken rather than re-derived, for the same reason
 * `fitMobileTitleSize` takes the mobile cover's: these blocks are fluid, so
 * there is no design box to compute an available width from, and a number
 * that changed with the viewport would move the title's size as a reader
 * resized the window.
 *
 * NEITHER CARRIES {@link fitTitleSize}'s 0.9 SAFETY MARGIN, and that is the
 * prototype's own shape rather than an omission: the cover's formula is
 * SCREENS.md §1.1's `clamp(min, floor(0.9 x available / ...), max)`, while
 * both blocks here divide a width that is already the conservative figure the
 * prototype chose for them. Adding a margin on top would shrink the title
 * below the size the design was drawn at.
 *
 * Pattern: pure functions over value objects (CLAUDE.md §3.3) - no clock, no
 * DOM, no I/O, so every branch is a real behaviour and testable as one. This
 * runs on the server, where no font metrics exist; measuring in the browser
 * instead would mean client JS and a layout shift on a screen whose whole
 * content is above the fold (CLAUDE.md §6, CLS).
 * Depends on: `CAVEAT_EM_PER_CHARACTER` (../coverTitle).
 */
import { CAVEAT_EM_PER_CHARACTER } from '../coverTitle'

/**
 * The cloth panel's clamp bounds, from the handoff prototype's `titleStyle`.
 * The maximum is NOT the cover's 124px: that is the size the title is drawn
 * at inside a 1300px design box, and this panel is half of a 1020px shell.
 */
export const SIGN_IN_TITLE_SIZE = Object.freeze({ min: 30, max: 84 } as const)

/** The horizontal room the cloth panel's title has, in CSS pixels. */
const SIGN_IN_TITLE_AVAILABLE_PX = 300

/**
 * The narrow masthead's clamp bounds. The one pair SCREENS.md §3 states in
 * prose - "fitted title (28-44px)" - and the prototype's `mastTitle` agrees.
 */
export const SIGN_IN_MASTHEAD_TITLE_SIZE = Object.freeze({ min: 28, max: 44 } as const)

/** The horizontal room the narrow masthead's title has, in CSS pixels. */
const SIGN_IN_MASTHEAD_TITLE_AVAILABLE_PX = 190

/**
 * The estimate-and-clamp both exported functions are.
 *
 * @param text - The title being sized.
 * @param availablePx - The horizontal room it has, in CSS pixels.
 * @param bounds - The floor and ceiling to clamp the estimate between.
 * @returns A font size in px, between `bounds.min` and `bounds.max` inclusive.
 */
const fitted = (text: string, availablePx: number, bounds: { readonly min: number; readonly max: number }): number => {
  // Zero-length text divides to Infinity, which `Math.min` resolves to the
  // maximum - the right answer for a title with nothing in it, and the reason
  // no explicit empty-string guard is needed here.
  const estimate = Math.floor(availablePx / (text.length * CAVEAT_EM_PER_CHARACTER))

  return Math.max(bounds.min, Math.min(bounds.max, estimate))
}

/**
 * The font size, in px, at which the book's name fits the sign-in screen's
 * cloth panel (SCREENS.md §3, wide only).
 *
 * @param text - The book's title, as the `book` global supplies it.
 * @returns A size between {@link SIGN_IN_TITLE_SIZE}.min and `.max` inclusive.
 * @example
 * fitSignInTitleSize('Wanderings') // 75
 * fitSignInTitleSize('Rio') // 84 - the panel's maximum
 */
export const fitSignInTitleSize = (text: string): number => fitted(text, SIGN_IN_TITLE_AVAILABLE_PX, SIGN_IN_TITLE_SIZE)

/**
 * The font size, in px, at which the book's name fits the sign-in screen's
 * narrow masthead (SCREENS.md §3, below the 820px breakpoint).
 *
 * @param text - The book's title, as the `book` global supplies it.
 * @returns A size between {@link SIGN_IN_MASTHEAD_TITLE_SIZE}.min and `.max`
 *   inclusive - the 28-44px band SCREENS.md §3 names.
 * @example
 * fitSignInMastheadTitleSize('Wanderings') // 44 - the masthead's maximum
 * fitSignInMastheadTitleSize('Fourteen chars') // 33
 */
export const fitSignInMastheadTitleSize = (text: string): number =>
  fitted(text, SIGN_IN_MASTHEAD_TITLE_AVAILABLE_PX, SIGN_IN_MASTHEAD_TITLE_SIZE)
