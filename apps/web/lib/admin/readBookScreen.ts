/**
 * readBookScreen — everything SCREENS.md §2.6 draws, in two queries.
 *
 * ═══ THE LIST IS THE BOOK'S OWN ORDER, NOT A SECOND ONE ═══
 *
 * §2.6's line is "this is also the order of the book", so the rows are the
 * journeys `readBookBundle` puts in it, in the sequence it puts them: the same
 * `where` (`BOOK_JOURNEYS_QUERY`, shared with the write that renumbers them)
 * and the same sort (`sortForJourneyOrderMode`, imported from the diary's own
 * reader), chosen by the same `book.journeyOrderMode`.
 *
 * THE SORT IS IMPORTED BECAUSE A SECOND COPY OF IT WAS WRONG WITHIN THE HOUR.
 * This module first held its own three-arm `switch`, which returned `'order'`
 * for the manual mode where the diary returns `['order', 'createdAt']` — so the
 * admin drew ten journeys in a different sequence from the book, with a "p. {n}"
 * beside each that named a page it was not on. The case that compares this
 * screen's rows against `readBookBundle`'s contents entries is what found it.
 *
 * ═══ "p. {n}" IS DERIVED, NEVER STORED ═══
 *
 * DATA_MODEL.md, "Derived, not stored". `numberBookmarkPages`
 * (@travel-diary/domain/admin/bookmarkOrder) walks the rows the way
 * `derivePages` walks its own, taking a journey's span from
 * `JOURNEY_PAGE_KINDS` — so the number printed here is the number a reader
 * turns to. `readBookScreen.integration.test.ts` asserts it against
 * `readBookBundle`'s OWN contents entries rather than against arithmetic
 * repeated in a test.
 *
 * ═══ THE ARROWS ARE OFF UNLESS THE BOOK IS ARRANGED BY HAND ═══
 *
 * // HANDOFF-DEVIATION: SCREENS.md §2.6 draws the ↑ ↓ buttons unconditionally
 * and the prototype's `move()` has no guard at all. But the arrows write
 * `journeys.order`, and `readBookBundle` sorts by that column ONLY under
 * `journeyOrderMode: 'manual'` — so under "Newest first" or "Oldest first" a
 * press would write a column the book ignores and the list would redraw in
 * exactly the order it already had. {@link BookScreenView.arrangeable} is that
 * decision, drawn as a disabled control with the reason beside it rather than
 * as an arrow that appears to do nothing. See `docs/deviations.md` §84.
 *
 * ═══ TWO QUERIES, WHATEVER THE SIZE OF THE DIARY ═══
 *
 * One `findGlobal` for the settings card and one `find` for the journeys. The
 * page numbers cost no query: they are arithmetic over the rows already read.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — one module owns how this screen's
 * data is fetched and shaped, and no component sees a Payload document. DTO:
 * {@link BookScreenView} is the screen's shape, not a global's and a
 * collection's.
 *
 * INVARIANT — {@link BookScreenView.rows} always begins with the Cover and
 * Contents rows and ends with the About row, because `derivePages` puts those
 * three pages there and the page numbers are derived from that assumption. A
 * future edit that reordered them would have to change `numberBookmarkPages`
 * too, and `bookmarkOrder.test.ts`'s comparison against `deriveContents` is
 * what would fail.
 * Depends on: `numberBookmarkPages`/`BookmarkRow`
 * (@travel-diary/domain/admin/bookmarkOrder), `sortForJourneyOrderMode`
 * (../readBookBundle), `FLIP_DURATION_MS` (@travel-diary/domain/flip),
 * `GALLERY_THUMB_SIZE`
 * (@travel-diary/domain/gallery), `payload` (types), `AdminScope`
 * (./adminScope), `BOOK_JOURNEYS_QUERY`/`BookSettings` (./bookMutations).
 */
import {
  numberBookmarkPages,
  type BookmarkRow,
  type NumberedBookmarkRow,
} from '@travel-diary/domain/admin/bookmarkOrder'
import { FLIP_DURATION_MS } from '@travel-diary/domain/flip'
import { GALLERY_THUMB_SIZE } from '@travel-diary/domain/gallery'
import type { Payload } from 'payload'
import { sortForJourneyOrderMode } from '../readBookBundle'
import type { AdminScope } from './adminScope'
import { BOOK_JOURNEYS_QUERY, type BookSettings } from './bookMutations'

/** One row of SCREENS.md §2.6's list, as the screen draws it. */
export interface BookmarkListRow extends BookmarkRow {
  /** The Caveat 26px line: a journey's name, or the fixed row's own word. */
  readonly name: string
  /** The Garamond italic line: a journey's place, or the fixed row's own subtitle. */
  readonly place: string
  /** The 9px rotated square's colour — a journey's accent, or the fixed rows' shared tint. */
  readonly tint: string
}

/** Everything SCREENS.md §2.6 draws. */
export interface BookScreenView {
  /** The bookmark list, in the order the book reads it, each row carrying its own "p. {n}". */
  readonly rows: readonly NumberedBookmarkRow<BookmarkListRow>[]
  /** The Book settings card's eight controls. */
  readonly settings: BookSettings
  /**
   * Whether the ↑ ↓ arrows do anything — see this module's header.
   *
   * Carried rather than re-derived by the component, so the rule and the
   * control cannot disagree and so an integration case can read it.
   */
  readonly arrangeable: boolean
}

/**
 * The tint the three fixed rows share.
 *
 * `Travel Diary Admin.dc.html`'s own value for all three of them
 * (`tint: '#8a7a5f'`), taken rather than invented: it is deliberately not one
 * of `journeyAccents`, so Cover, Contents and About read as furniture rather
 * than as three more trips.
 */
const FIXED_ROW_TINT = '#8a7a5f'

/**
 * The three fixed rows, with the prototype's own second lines.
 *
 * `the front`, `index` and `colophon` are `Travel Diary Admin.dc.html`'s, not
 * this implementation's. SCREENS.md §2.6 shows the column and gives no words
 * for it, so the prototype is the source, exactly as it is for the tint above.
 */
const COVER_ROW = { id: 'cover', kind: 'cover', name: 'Cover', place: 'the front', tint: FIXED_ROW_TINT } as const
const CONTENTS_ROW = {
  id: 'contents',
  kind: 'contents',
  name: 'Contents',
  place: 'index',
  tint: FIXED_ROW_TINT,
} as const
const ABOUT_ROW = { id: 'about', kind: 'about', name: 'About', place: 'colophon', tint: FIXED_ROW_TINT } as const

/** The columns this screen's settings card reads back off the `book` global. */
const SETTINGS_SELECT = {
  contentsNote: true,
  journeyOrderMode: true,
  coverCloth: true,
  flipDurationMs: true,
  galleryThumbPx: true,
  showDecorations: true,
  showRibbon: true,
  showCounter: true,
} as const

/**
 * Everything SCREENS.md §2.6 draws, in two queries.
 *
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}, spread into every call.
 * @returns The list, the settings and whether the arrows do anything.
 * @throws From Payload, when a read is refused by the access rules.
 * @example
 * const view = await readBookScreen(await getPayload(), scope)
 */
export const readBookScreen = async (payload: Payload, scope: AdminScope): Promise<BookScreenView> => {
  const book = await payload.findGlobal({ slug: 'book', ...scope, depth: 0, select: SETTINGS_SELECT })
  // EVERY FIELD IS NULLABLE IN THE SCHEMA, so each falls back to the column's
  // own `defaultValue` rather than to `undefined` — `Cover.tsx` and
  // `readBookBundle.ts` narrow the same way, and a card drawn from `undefined`
  // would post it straight back.
  const settings: BookSettings = {
    contentsNote: book.contentsNote ?? '',
    journeyOrderMode: book.journeyOrderMode ?? 'manual',
    coverCloth: book.coverCloth ?? '',
    flipDurationMs: book.flipDurationMs ?? FLIP_DURATION_MS.default,
    galleryThumbPx: book.galleryThumbPx ?? GALLERY_THUMB_SIZE.default,
    showDecorations: book.showDecorations ?? true,
    showRibbon: book.showRibbon ?? true,
    showCounter: book.showCounter ?? true,
  }

  const journeys = await payload.find({
    ...BOOK_JOURNEYS_QUERY,
    ...scope,
    sort: sortForJourneyOrderMode(settings.journeyOrderMode),
    select: { name: true, place: true, furniture: true },
  })

  const rows: readonly BookmarkListRow[] = [
    COVER_ROW,
    CONTENTS_ROW,
    ...journeys.docs.map((doc): BookmarkListRow => ({
      // BY ROW ID, NEVER BY SLUG AND NEVER BY POSITION (CLAUDE.md §0.9). The
      // arrows post the whole new sequence of these, and `saveBookmarkOrder`
      // matches them against the book's own rows by the same id.
      id: String(doc.id),
      kind: 'journey',
      name: doc.name,
      place: doc.place,
      tint: doc.furniture?.accent ?? FIXED_ROW_TINT,
    })),
    ABOUT_ROW,
  ]

  return {
    rows: numberBookmarkPages(rows),
    settings,
    arrangeable: settings.journeyOrderMode === 'manual',
  }
}
