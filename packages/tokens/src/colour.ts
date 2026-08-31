/**
 * colour — the handoff's colour tokens, verbatim.
 *
 * Single source of truth for every colour in the product (Value objects pattern:
 * each entry is an opaque, immutable value rather than a computed string).
 * Values are exact hex/CSS from `handoff/design_handoff_travel_diary/README.md`
 * ("Design tokens" > "Colour"), never approximated. A gradient's stops are named
 * `<token>From`/`<token>Via`/`<token>To` in the order the handoff lists them.
 * Accessibility claims about these values are asserted in colour.test.ts.
 * Depends on nothing.
 */

/** The handoff's colour tokens. Frozen — callers read, never mutate. */
export const colour = Object.freeze({
  // paper — diary page face, 180deg gradient.
  paperFrom: '#fbf6e9',
  paperTo: '#f7f0df',
  /** Flat paper tone, used wherever a single colour (not the gradient) is needed. */
  paper: '#fbf6e9',

  // paper-mount — photo mounts, admin cards.
  paperMount: '#fffdf6',

  // paper-back — reverse of a turning leaf, 270deg gradient.
  paperBackFrom: '#f8f1e0',
  paperBackVia: '#f1e8d3',
  paperBackTo: '#e6dbc2',

  // desk — admin background, radial gradient with a highlight and two stops.
  deskHighlight: '#f8f2e2',
  deskFrom: '#f4eddc',
  deskTo: '#efe7d3',

  // outer — diary background outside the book.
  outer: '#ffffff',

  // board — book cover boards.
  boardFrom: '#40382e',
  boardVia: '#332c24',
  boardTo: '#2b241d',

  // spine — spine strip, 90deg gradient.
  spineFrom: '#241e18',
  spineVia: '#3b332a',
  spineTo: '#2a231c',

  // sidebar — admin nav rail.
  sidebarFrom: '#3b332a',
  sidebarTo: '#2c251e',

  // ink family.
  ink: '#33403c',
  inkBody: '#4a4232',
  /** Labels, meta, drag handles. Opaque — never an alpha of rgba(120,98,60,…); see colour.test.ts. */
  inkMuted: '#736247',
  inkDiaryMuted: '#7a6b50',
  inkDiaryMutedItalic: '#6f6247',

  // accent.
  accent: '#a34434',
  accentHover: '#8c3327',

  // cream family.
  cream: '#f6ecd6',
  creamAlt: '#fdf8ec',
  /** Secondary text on sidebar. Must stay >=6:1 measured at the lightest sidebar stop; see colour.test.ts. */
  creamDim: 'rgba(243,231,205,.72)',

  // ribbon — bookmark ribbon, linear gradient with a repeated stop.
  ribbonFrom: '#8c2f28',
  ribbonVia: '#b6483c',
  ribbonTo: '#8c2f28',

  // status pills.
  statusPublished: '#2f6b68',
  statusEdited: '#845825',
  statusDraft: '#6b5d46',

  // hairlines — borders, inset rings, list separators, spine stitching.
  hairlineBorderMin: 'rgba(120,98,60,.14)',
  hairlineBorderMax: 'rgba(120,98,60,.34)',
  hairlineDottedMin: 'rgba(120,98,60,.26)',
  hairlineDottedMax: 'rgba(120,98,60,.3)',
  spineStitch: 'rgba(226,201,150,.28)',
} as const)

/**
 * Cover cloth options offered in the admin. First entry is the default.
 * Order matches the handoff: `#2f4a47` (default), `#7a3b32`, `#3d4257`, `#5c4a2b`.
 */
export const coverCloths = Object.freeze(['#2f4a47', '#7a3b32', '#3d4257', '#5c4a2b'] as const)

/**
 * Journey accent tints, used for a journey's bookmark tab and postage stamp.
 * Assigned per journey, editable in the admin.
 */
export const journeyAccents = Object.freeze(['#3d817e', '#a06b3e', '#5a72a8', '#a15a4e', '#736247'] as const)
