/**
 * geometry — the handoff's layout constants (Value objects pattern).
 *
 * Single source of truth for the book's fixed design box and every radius,
 * padding and gap value from `handoff/design_handoff_travel_diary/README.md`
 * ("Design tokens" > "Geometry", and "The book — geometry and flip").
 * Depends on nothing.
 */

/**
 * The book is authored at this exact size and scaled to fit its container via
 * `scale = Math.min(areaWidth / width, areaHeight / height)`. Never change these —
 * every page's layout assumes this box.
 */
export const DESIGN_BOX = Object.freeze({ width: 1300, height: 860 } as const)

/**
 * Upper bound on book scaling. Uncapped, a 4K display scales the book ~2.4x while
 * the bookmark rail and bottom bar stay at fixed size outside the transform.
 */
export const MAX_SCALE = 1.7

/** Radius, padding and gap scale shared across the diary and admin surfaces. */
export const geometry = Object.freeze({
  radius: Object.freeze({
    /** Inputs, buttons, pills. */
    control: '2px',
    /** Admin cards. */
    card: '3px',
    /** Diary page face. */
    pageFace: '2px 9px 9px 2px',
    /** Book cover board. */
    bookBoard: '7px 16px 16px 7px',
  }),
  /** Admin card padding range, smallest to largest card. */
  adminCardPadding: Object.freeze({ min: '18px 20px 20px', max: '20px 22px 22px' }),
  /** Grid gaps, in px, for flex/grid layouts that use `gap`. */
  gap: Object.freeze({
    adminCards: 20,
    cardInner: 14,
    tileGrid: 12,
  }),
} as const)
