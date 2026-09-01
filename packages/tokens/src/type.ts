/**
 * type — the handoff's typography tokens (Value objects pattern).
 *
 * Single source of truth for the three font families and the diary/admin size
 * scales from `handoff/design_handoff_travel_diary/README.md` ("Design tokens" >
 * "Type"). Sizes are numbers in px unless noted; `lineHeight` is unitless.
 * Depends on nothing.
 */

/** The three Google Fonts families used across the product, as CSS `font-family` values. */
const family = Object.freeze({
  /** 400-700. Headings, photo captions, handwritten highlights, tally values, sign-off. */
  caveat: "'Caveat', cursive",
  /** 400/500/600 + italic. Body copy, meta lines, descriptions. */
  garamond: "'EB Garamond', serif",
  /** 400/700. Eyebrows, counters, dates, file names, all-caps labels. */
  courier: "'Courier Prime', monospace",
} as const)

/** Diary page size scale, inside the 1300x860 design box. Sizes in px. */
const diary = Object.freeze({
  coverTitle: 124,
  journeyName: 66,
  contents: 70,
  sectionHead: 40,
  highlight: 30,
  photoCaption: Object.freeze({ min: 23, max: 26 }),
  note: Object.freeze({ size: 18.5, lineHeight: 1.64 }),
  tallyValue: 29,
  eyebrow: Object.freeze({ min: 10, max: 11.5 }),
} as const)

/** Admin screen size scale. Sizes in px. */
const admin = Object.freeze({
  screenTitle: 48,
  cardHeading: 32,
  journeyRowName: 30,
  body: Object.freeze({ min: 16, max: 17 }),
  label: Object.freeze({ min: 9, max: 10.5 }),
} as const)

/** Font families and size scales for the diary and admin surfaces. */
export const typeScale = Object.freeze({ family, diary, admin } as const)

/**
 * Courier Prime label letter-spacing range. Labels always carry a value in this
 * range plus `text-transform: uppercase`, at 8.5-13px.
 */
export const letterSpacing = Object.freeze({ min: '0.14em', max: '0.42em' } as const)

/** Minimum sizes the handoff never allows a real value to fall below. Sizes in px. */
export const minimumSize = Object.freeze({
  /** No admin label below this. */
  adminLabel: 9,
  /** No diary body text below this. */
  diaryBody: 15,
  /** Mobile hit targets, minimum. */
  hitTarget: 44,
  /** Mobile nav buttons, actual size (above the hit-target minimum). */
  navButton: 52,
} as const)
