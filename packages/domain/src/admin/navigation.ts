/**
 * navigation — the admin rail's entries, their section colours, and which one
 * an address belongs to.
 *
 * Pure and in the domain because three consumers need the same answer and none
 * of them should own it: the rail draws the buttons, `ScreenHeader` prints the
 * crumb, and `lighthouserc.admin.json`'s URL list is checked against it.
 *
 * ACCOUNT IS NOT AN ENTRY. SCREENS.md §2 reaches it from the rail's profile
 * button, not from the nav list. THE JOURNEY EDITOR IS NOT AN ENTRY EITHER: it
 * is an address under `journeys`, which is why `activeNavId` matches on segment
 * boundaries rather than on equality.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A table and two lookups.
 * Depends on: nothing.
 */

/** The six colour groups SCREENS.md §2 divides the panel into. */
export type AdminSection = 'overview' | 'journeys' | 'media' | 'book' | 'settings' | 'trash'

/** One button in the rail. */
export interface NavEntry {
  /** Stable key; also what `activeNavId` returns. */
  readonly id: string
  /** Caveat 23px, as SCREENS.md §2 writes it. */
  readonly label: string
  /** Courier 10px, uppercase, beneath the label. */
  readonly subLabel: string
  /** The address, always under `/admin`. */
  readonly href: string
  /** Which colour group the 5px bar takes. */
  readonly section: AdminSection
}

/**
 * The rail, top to bottom.
 *
 * HANDOFF-DEVIATION (docs/deviations.md §53): the SUB-LABELS are ours.
 * SCREENS.md §2 gives the sub-label its type, size and colour and prints no
 * strings for the rail, so these nine lines are written in the register of the
 * screens they name rather than transcribed.
 */
export const ADMIN_NAV: readonly NavEntry[] = [
  { id: 'overview', label: 'Overview', subLabel: 'The desk', href: '/admin', section: 'overview' },
  { id: 'journeys', label: 'Journeys', subLabel: 'Trips and pages', href: '/admin/journeys', section: 'journeys' },
  { id: 'media', label: 'Media', subLabel: 'Everything uploaded', href: '/admin/media', section: 'media' },
  { id: 'galleries', label: 'Galleries', subLabel: 'Order and captions', href: '/admin/galleries', section: 'media' },
  { id: 'book', label: 'Book', subLabel: 'Bookmarks and settings', href: '/admin/book', section: 'book' },
  { id: 'cover', label: 'Cover', subLabel: 'Cloth and about', href: '/admin/cover', section: 'book' },
  { id: 'publish', label: 'Publish', subLabel: 'What goes out', href: '/admin/publish', section: 'overview' },
  { id: 'settings', label: 'Settings', subLabel: 'Site and readers', href: '/admin/settings', section: 'settings' },
  { id: 'trash', label: 'Trash', subLabel: 'Kept for thirty days', href: '/admin/trash', section: 'trash' },
]

/** SCREENS.md §2's section colours, transcribed. */
const SECTION_COLOURS: Readonly<Record<AdminSection, string>> = {
  overview: '#a34434',
  journeys: '#3d817e',
  media: '#a06b3e',
  book: '#5a72a8',
  settings: '#a15a4e',
  trash: '#736247',
}

/**
 * The 5px bar's colour for a section.
 * @param section - The group the entry belongs to.
 * @returns The hex colour SCREENS.md §2 gives it.
 * @example
 * sectionColour('journeys') // '#3d817e'
 */
export const sectionColour = (section: AdminSection): string => SECTION_COLOURS[section]

/**
 * The panel's own address, which the Overview entry sits at.
 *
 * It is named because {@link activeNavId} has to treat it differently from
 * every other entry: it is a PREFIX of all of them, so an entry at this address
 * owning its subtree would own the whole panel. See that function.
 */
const PANEL_ROOT = '/admin'

/**
 * Which rail entry an address belongs to.
 *
 * Longest match on a SEGMENT boundary, never `startsWith` — `/admin/journeys`
 * owns `/admin/journeys/7`, the editor, which is why the editor is an address
 * rather than an entry.
 *
 * THE OVERVIEW ENTRY OWNS EXACTLY ITS OWN ADDRESS, which is a departure from
 * the rule above and the reason {@link PANEL_ROOT} is named. `/admin` is a
 * prefix of every other address in the table, so letting it own its subtree
 * makes the rail light two buttons at once on every screen AND answers
 * `'overview'` for an address no entry owns at all. Overview is a screen at the
 * panel's root, not the parent of the eight beneath it.
 * @param pathname - The address being drawn.
 * @returns The entry's id, or `undefined` when no entry owns it.
 * @example
 * activeNavId('/admin/journeys/7') // 'journeys'
 */
export const activeNavId = (pathname: string): string | undefined =>
  [...ADMIN_NAV]
    .sort((left, right) => right.href.length - left.href.length)
    .find((entry) => pathname === entry.href || (entry.href !== PANEL_ROOT && pathname.startsWith(`${entry.href}/`)))
    ?.id
