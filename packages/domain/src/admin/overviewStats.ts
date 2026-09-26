/**
 * overviewStats — SCREENS.md §2.1's four stat cards: the label, the figure,
 * the note beneath it and the colour of the 3px tick at its left edge.
 *
 * ═══ EVERY FIGURE IS DERIVED, AND THAT IS A DATA-MODEL RULE ═══
 *
 * `DATA_MODEL.md`'s "Derived, not stored" applies to all eight numbers this
 * module reads: nothing in this schema holds a photograph count or a draft
 * count, and a stored counter would be a second source of truth that drifts
 * the first time a row is written by anything but the screen that increments
 * it. `readOverview.ts` asks Postgres for each one; this module only decides
 * what the card SAYS about it.
 *
 * ═══ THE TICK COLOURS ARE THE RAIL'S, ASKED FOR RATHER THAN TRANSCRIBED ═══
 *
 * The prototype's four tones are `#3d817e`, `#5a72a8`, `#a06b3e` and
 * `#a34434`, which are exactly SCREENS.md §2's section colours for Journeys,
 * Book, Media and Overview. So each card names its SECTION and
 * `sectionColour` answers, and there is no second copy of four hex values to
 * drift from the buttons they are meant to echo.
 *
 * ═══ THE NOTES ARE OURS, AND THEY ARE DERIVED WHERE THE PROTOTYPE'S ARE NOT
 * ═══
 *
 * The prototype's four notes are fixture strings — "one in draft", "cover,
 * index, about", "96 placed in the book", "9 loop on a page". Two of them
 * describe facts this data model does not hold: there are no fixed cover /
 * index / about ROWS to count (the book's leaves are composed, not stored) and
 * nothing records that a clip "loops on a page". The two that are computable
 * are kept in the prototype's own register; the other two are replaced with
 * the nearest fact this schema can answer — how many pages are still a draft,
 * and how many clips have a poster frame chosen, which is also what §2.1's
 * "Pick posters" prompt acts on. `docs/deviations.md` records the swap.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A table and four sentences.
 *
 * INVARIANT — `photographs + clips` is every row in the media library, which
 * is the same total `readNavCounts` prints beside the Media button. The two
 * numbers on this screen that count the library therefore agree by
 * construction, and `readOverview.integration.test.ts` asserts it against
 * Postgres rather than against this comment.
 * Depends on: `sectionColour` (./navigation).
 */
import { sectionColour } from './navigation'

/** The eight derived figures §2.1's grid prints. */
export interface OverviewFigures {
  /** Live journeys — everything not in the trash. */
  readonly journeys: number
  /** How many of those have never been published. */
  readonly journeysInDraft: number
  /** Pages across every live journey. */
  readonly pages: number
  /** How many of those have never been published. */
  readonly pagesInDraft: number
  /** Every still in the media library. */
  readonly photographs: number
  /** How many of those an editor has placed in the book. */
  readonly photographsInBook: number
  /** Every clip in the media library. */
  readonly clips: number
  /** How many of those have a poster frame chosen. */
  readonly clipsWithPoster: number
}

/** Which card a stat is. Also its React key — never its position (§0.9). */
export type OverviewStatId = 'journeys' | 'pages' | 'photographs' | 'clips'

/** One card of §2.1's stat grid. */
export interface OverviewStat {
  /** What this card is about. */
  readonly id: OverviewStatId
  /** Courier 10px `.22em`. */
  readonly label: string
  /** Caveat 52px. */
  readonly value: string
  /** Garamond italic 15px. */
  readonly note: string
  /** The 3px full-height tick at the left edge. */
  readonly tone: string
}

/**
 * How many of something, in the register the notes are written in.
 *
 * Zero gets a WORD rather than a digit, because "0 placed in the book" reads
 * as a broken template and "none placed in the book" reads as a fact; one gets
 * a word for the same reason `pendingChange.ts`'s headline has a singular.
 * @param count - How many.
 * @param none - What zero is called on this card.
 * @returns The quantity as the note prints it.
 */
const quantity = (count: number, none: string): string => {
  if (count === 0) return none
  return count === 1 ? 'one' : String(count)
}

/**
 * The note on a card whose second figure is a count of drafts.
 * @param drafts - How many are still a draft.
 * @returns The note.
 */
const draftNote = (drafts: number): string =>
  drafts === 0 ? 'all published' : `${quantity(drafts, 'none')} still a draft`

/** The three figures SCREENS.md §2.1's "The book, live" summary line prints. */
export interface BookReach {
  /** Pages a reader can actually turn to — published ones. */
  readonly pages: number
  /** Journeys that get a bookmark in the rail. */
  readonly bookmarks: number
  /** Journeys with at least one frame in their gallery. */
  readonly galleries: number
}

/**
 * A count and its noun, in the number the count actually is.
 * @param count - How many.
 * @param singular - The noun for one.
 * @param plural - The noun for any other number, including zero.
 * @returns e.g. `'1 page'`, `'33 pages'`.
 */
const counted = (count: number, singular: string, plural: string): string =>
  `${String(count)} ${count === 1 ? singular : plural}`

/**
 * SCREENS.md §2.1's summary line — the prototype's "33 pages · 13 bookmarks ·
 * 4 galleries open".
 *
 * IT DESCRIBES WHAT A READER WOULD FIND, not what the author has: a line
 * counting drafts would describe a book nobody can open, on the card whose
 * whole heading is "The book, live".
 *
 * It lives here rather than in `readOverview.ts` because it is three
 * singular/plural decisions and nothing else — and in a repository read those
 * three arms are reachable only when the seeded diary happens to hold exactly
 * one of something (CLAUDE.md §2.1: an arm no test can take is not a decision
 * that has been made).
 * @param reach - See {@link BookReach}.
 * @returns The line, with its `·` separators.
 * @example
 * bookSummary({ pages: 33, bookmarks: 13, galleries: 4 }) // '33 pages · 13 bookmarks · 4 galleries open'
 */
export const bookSummary = (reach: BookReach): string =>
  [
    counted(reach.pages, 'page', 'pages'),
    counted(reach.bookmarks, 'bookmark', 'bookmarks'),
    `${counted(reach.galleries, 'gallery', 'galleries')} open`,
  ].join(' · ')

/**
 * SCREENS.md §2.1's four stat cards, in the order the grid prints them.
 *
 * @param counts - See {@link OverviewFigures}; every one of them is derived.
 * @returns The four cards, each with its own tick colour.
 * @example
 * overviewStats({ journeys: 10, journeysInDraft: 1, … })[0].note // 'one still a draft'
 */
export const overviewStats = (counts: OverviewFigures): readonly OverviewStat[] => [
  {
    id: 'journeys',
    label: 'Journeys',
    value: String(counts.journeys),
    note: draftNote(counts.journeysInDraft),
    tone: sectionColour('journeys'),
  },
  {
    id: 'pages',
    label: 'Pages',
    value: String(counts.pages),
    note: draftNote(counts.pagesInDraft),
    tone: sectionColour('book'),
  },
  {
    id: 'photographs',
    label: 'Photographs',
    value: String(counts.photographs),
    note: `${quantity(counts.photographsInBook, 'none')} placed in the book`,
    tone: sectionColour('media'),
  },
  {
    id: 'clips',
    label: 'Clips',
    value: String(counts.clips),
    note: `${quantity(counts.clipsWithPoster, 'none')} with a poster chosen`,
    tone: sectionColour('overview'),
  },
]
