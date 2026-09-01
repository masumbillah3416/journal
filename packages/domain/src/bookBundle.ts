/**
 * bookBundle — the reading sequence, contents index and bookmark tabs.
 *
 * Derivation pattern (CLAUDE.md §7; DATA_MODEL.md "Derived, not stored"): page
 * numbers, the `NN / NN` counter, contents entries and bookmark spans are
 * computed here from an ordered `Journey[]`, never persisted as their own
 * rows or columns. Phase 0 seeded exactly thirty `pages` rows (ten journeys x
 * three); Cover and About live on the `book` and `about` globals, and
 * Contents has no row at all (docs/deviations.md §5). The handoff's "33
 * pages" is this module's `derivePages` output length for the seeded ten
 * journeys - Cover + Contents + (10 x 3) + About - assembled here, never read
 * from a stored count.
 * Depends on: JourneyId, for keying every page, contents entry and bookmark
 * tab by journey identity rather than array position (CLAUDE.md §7).
 */
import type { JourneyId } from './ids.js'

/** A trip: the unit of content a reader turns three pages of. */
export interface Journey {
  readonly id: JourneyId
  readonly slug: string
  readonly name: string
  readonly place: string
  readonly dates: string
  readonly hiddenFromBookmarks: boolean
  readonly furniture: {
    readonly accent: string
  }
}

/** Which of the three fixed book-wide pages, or which of a journey's three, a page is. */
export type BookPageKind = 'cover' | 'contents' | 'notes' | 'frames-i' | 'frames-ii' | 'about'

/** Journey identity and display fields carried by each of a journey's three pages. */
interface JourneyPageInfo {
  readonly journeyId: JourneyId
  readonly slug: string
  readonly name: string
  readonly place: string
  readonly dates: string
  readonly accent: string
  readonly hiddenFromBookmarks: boolean
}

/**
 * One page in the reading sequence. Cover, Contents and About carry no
 * journey - the union makes reading `.slug` off one of them a compile error
 * rather than a runtime `undefined`.
 */
export type BookPage =
  | { readonly kind: 'cover' }
  | { readonly kind: 'contents' }
  | { readonly kind: 'about' }
  | ({ readonly kind: 'notes' | 'frames-i' | 'frames-ii' } & JourneyPageInfo)

/** One row in the Contents index: a journey's display fields and the page its notes page occupies. */
export interface ContentsEntry {
  readonly journeyId: JourneyId
  readonly slug: string
  readonly name: string
  readonly place: string
  readonly dates: string
  readonly pageNumber: number
}

/** Which kind of bookmark-rail tab this is. */
export type BookmarkKind = 'cover' | 'contents' | 'journey' | 'about'

/**
 * One tab in the bookmark rail. `startIndex`/`span` describe which pages -
 * by 0-based index into {@link derivePages}'s result - the tab covers; only a
 * `'journey'` tab carries the remaining, journey-identifying fields.
 */
export interface BookmarkTab {
  readonly kind: BookmarkKind
  readonly startIndex: number
  readonly span: number
  readonly journeyId?: JourneyId
  readonly slug?: string
  readonly name?: string
  readonly place?: string
  readonly accent?: string
}

/** The book's reading sequence, Contents index and bookmark rail, assembled together. */
export interface BookBundle {
  readonly pages: readonly BookPage[]
  readonly contents: readonly ContentsEntry[]
  readonly bookmarks: readonly BookmarkTab[]
}

/** The three page kinds every journey contributes, in reading order. */
const JOURNEY_PAGE_KINDS = ['notes', 'frames-i', 'frames-ii'] as const

/**
 * Assembles the book's reading sequence: Cover, Contents, then each
 * journey's three pages in order, then About. Nothing here is stored - see
 * this module's header.
 * @param journeys - Journeys in the order they should appear in the book.
 * @returns The full ordered page list.
 */
export const derivePages = (journeys: readonly Journey[]): readonly BookPage[] => [
  { kind: 'cover' },
  { kind: 'contents' },
  ...journeys.flatMap((journey) =>
    JOURNEY_PAGE_KINDS.map(
      (kind): BookPage => ({
        kind,
        journeyId: journey.id,
        slug: journey.slug,
        name: journey.name,
        place: journey.place,
        dates: journey.dates,
        accent: journey.furniture.accent,
        hiddenFromBookmarks: journey.hiddenFromBookmarks,
      }),
    ),
  ),
  { kind: 'about' },
]

/**
 * Builds the Contents index: one entry per journey, numbered with the
 * 1-based page its notes page occupies in `pages`.
 * @param pages - The reading sequence from {@link derivePages}.
 * @returns Contents entries in reading order.
 */
export const deriveContents = (pages: readonly BookPage[]): readonly ContentsEntry[] => {
  const entries: ContentsEntry[] = []

  pages.forEach((page, index) => {
    if (page.kind !== 'notes') return

    entries.push({
      journeyId: page.journeyId,
      slug: page.slug,
      name: page.name,
      place: page.place,
      dates: page.dates,
      pageNumber: index + 1,
    })
  })

  return entries
}

/**
 * Builds the bookmark rail: one tab spanning all three of a journey's pages,
 * plus a one-page tab each for Cover, Contents and About. A journey flagged
 * `hiddenFromBookmarks` gets no tab, though its pages remain in `pages`.
 * @param pages - The reading sequence from {@link derivePages}.
 * @returns Bookmark tabs in reading order.
 */
export const deriveBookmarks = (pages: readonly BookPage[]): readonly BookmarkTab[] => {
  const tabs: BookmarkTab[] = []

  pages.forEach((page, startIndex) => {
    if (page.kind === 'cover' || page.kind === 'contents' || page.kind === 'about') {
      tabs.push({ kind: page.kind, startIndex, span: 1 })
      return
    }

    if (page.kind !== 'notes' || page.hiddenFromBookmarks) return

    tabs.push({
      kind: 'journey',
      journeyId: page.journeyId,
      slug: page.slug,
      name: page.name,
      place: page.place,
      accent: page.accent,
      startIndex,
      span: 3,
    })
  })

  return tabs
}

/**
 * The `NN / NN` counter under the bottom bar, zero-padded to the total's width.
 * @param current - The 1-based current page number.
 * @param total - The total number of pages.
 * @returns e.g. `pageCounter(3, 33)` is `'03 / 33'`.
 */
export const pageCounter = (current: number, total: number): string => {
  const totalText = String(total)
  return `${String(current).padStart(totalText.length, '0')} / ${totalText}`
}

/**
 * The human label shown under the page counter.
 * @param page - The current page.
 * @returns e.g. `'Tokyo — Notes'`, or `'Cover'` for a book-wide page.
 */
export const pageLabel = (page: BookPage): string => {
  switch (page.kind) {
    case 'cover':
      return 'Cover'
    case 'contents':
      return 'Contents'
    case 'about':
      return 'About'
    case 'notes':
      return `${page.name} — Notes`
    case 'frames-i':
      return `${page.name} — Frames I`
    case 'frames-ii':
      return `${page.name} — Frames II`
  }
}
