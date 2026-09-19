/**
 * pageSlots — how many photo slots a page's editing pane draws, and what part
 * each cell plays.
 *
 * ═══ ONE TABLE, BECAUSE THREE THINGS READ IT ═══
 *
 * SCREENS.md §2.3 gives a Notes page "two slots (hero 186px, ephemera 124px)"
 * and a Frames page "four slots at 152px". Three readers need that: the pane
 * that DRAWS the slots, the parse that REFUSES a cell no pane drew, and the
 * write that pads `pages.slots` up to the cell being written. Three copies of
 * "four" is three chances for one of them to drift, and the one that drifts
 * silently is the parse — a pane drawing a fifth frame whose writes are refused
 * looks like a save that did nothing.
 *
 * ═══ A CELL'S INDEX IS ITS IDENTITY, NOT ITS POSITION ═══
 *
 * CLAUDE.md §0.9 addresses rows by id, never by array position, and this is the
 * one place in the editor that looks like an exception. It is not: the index
 * says WHICH CELL OF THE LAYOUT this is, the public `FramesI.tsx` reads
 * `page.slots?.[position]` by the same number, and nothing splices the array —
 * `apps/web/lib/admin/slotMutations.ts` empties a cleared slot's row in place
 * so the cell after it does not move. A highlight, which authors add, remove
 * and reorder, is keyed by its Payload row id instead
 * ({@link ./highlights.Highlight}).
 *
 * ═══ THE FRAMES PANE DRAWS FOUR, AND `FramesI` PRINTS THREE ═══
 *
 * // HANDOFF-DEVIATION: §2.3's editing pane draws four slots for ANY frames
 * page, while the public §1.4 Frames I has three cells and §1.5 Frames II has
 * four. The pane follows §2.3 because it is the authority on the admin screen,
 * so a Frames I page's fourth slot is editable and unprinted rather than
 * uneditable; the alternative — deriving the count from which frames page it is
 * — makes the pane's shape depend on a page's ORDER, and a reorder would then
 * silently drop an author's fourth photograph. See docs/deviations.md.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One frozen table and two
 * lookups over it, in the shape `./layoutGlyphs.ts` already uses.
 *
 * INVARIANT — {@link HIGHEST_SLOT_CELL} is DERIVED from the table below and
 * never written down. Widening a pane widens the refusal with it.
 * Depends on: `SlotRole` (../bookBundle).
 */
import type { SlotRole } from '../bookBundle'

/** Which of SCREENS.md §2.3's two editing panes a page gets. */
export type PageKind = 'notes' | 'frames'

/**
 * The part each cell of a page's pane plays, in cell order.
 *
 * SCREENS.md §2.3's own counts. The ORDER matters past this module: the public
 * `EphemeraSlot.tsx` finds its slot by `role`, but `FramesI.tsx` reads
 * `page.slots?.[position]`, so which cell a role occupies is what the book
 * draws.
 */
const ROLES: Readonly<Record<PageKind, readonly SlotRole[]>> = {
  notes: ['hero', 'ephemera'],
  frames: ['frame', 'frame', 'frame', 'frame'],
}

/**
 * What each of a page's slots is for, in the order the pane draws them.
 *
 * @param kind - Which pane the page gets.
 * @returns The roles, one per cell.
 * @example
 * slotRolesFor('notes') // ['hero', 'ephemera']
 */
export const slotRolesFor = (kind: PageKind): readonly SlotRole[] => ROLES[kind]

/**
 * The last cell index any pane draws.
 *
 * DERIVED, NEVER WRITTEN DOWN. It is the gate
 * `apps/web/lib/admin/slotMutations.ts` refuses a `POST` on, and a gate written
 * as a literal is a gate that stops matching the pane the moment the pane
 * grows — which reads to an author as a slot that will not save.
 */
export const HIGHEST_SLOT_CELL: number = Math.max(...Object.values(ROLES).map((roles) => roles.length)) - 1

/**
 * The label SCREENS.md §2.3 prints over one slot.
 *
 * THE HERO AND THE SCRAP ARE NAMED, THE FRAMES ARE NUMBERED, which is what the
 * two panes need: a Notes page has one of each and a number would say nothing,
 * and a Frames page has four of the same thing and a name would say nothing.
 * @param role - What part the cell plays.
 * @param cell - Its index in `pages.slots`.
 * @returns The label.
 * @example
 * slotLabel('frame', 0) // 'Frame 1'
 */
export const slotLabel = (role: SlotRole, cell: number): string => {
  if (role === 'hero') return 'Hero'
  if (role === 'ephemera') return 'Ephemera'
  return `Frame ${String(cell + 1)}`
}
