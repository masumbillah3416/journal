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
 *
 * CARRY-FORWARD (Task 5 review, acted on in Task 6 - `apps/web/lib/readBookBundle.ts`):
 * `Journey.startsOn` was added here because CLAUDE.md §7 ("Free-text `dates`
 * always travels with a sortable `startsOn`") and DATA_MODEL.md both require
 * it, and Task 6 is the module that actually sorts journeys before deriving
 * the reading sequence — free-text dates like "28 Oct – 6 Nov 2025" have no
 * other sortable form. `Slot`/`SlotRole` and `JourneyPageInfo.slots` were
 * added for the same reason, one level down: a notes/frames page is not
 * fully described without the photos it displays, and Task 6 is the module
 * that resolves each slot to a derivative URL and carries its focal point
 * through. Both additions are optional-safe on `derivePages`'s existing
 * output - see `slots`'s own doc comment - so neither required touching
 * `derivePages`'s logic.
 *
 * TASK 10 (the Notes page, SCREENS.md §1.3) widened `Journey` and the journey
 * arm of `BookPage` again, and this time `derivePages` DOES copy the new
 * fields: the weather and mood lines, the weather glyph, the highlights, the
 * note, the tally ticket, the sign-off, the two postage-stamp lines and the
 * `gallery` census. Every one of them is a journey-level fact rather than a
 * page-level one, so it lives on the journey row and is copied onto the three
 * pages derived from it, exactly as `name`, `place`, `dates` and `accent`
 * already were. `gallery` is the one that is not stored anywhere at all - it
 * is a census of the journey's media taken by `readBookBundle`, per
 * CLAUDE.md §7's "derive, never store ... media counts".
 *
 * TASK 11 (the Frames and About pages, SCREENS.md §1.4-1.6) added
 * {@link AboutContent} and the `about` field on {@link BookBundle}. It sits
 * beside `chrome` rather than on the `{ kind: 'about' }` page for the same
 * reason `chrome` does not sit on the Cover page: both are GLOBAL content,
 * read once per request from a Payload global, and a bundle whose consumers
 * had to find them by walking the reading sequence would make every page
 * component's props depend on where in the book it happened to be printed.
 * The Frames pages needed nothing new here - SCREENS.md §1.4/§1.5 print the
 * journey's name, dates, place, photo slots and gallery census, all of which
 * `derivePages` and `readBookBundle` already carry.
 */
import type { JourneyId } from './ids'

/** Which of the three CSS-drawn weather glyphs a journey's Notes page prints (SCREENS.md §1.3). */
export type WeatherGlyph = 'sun' | 'haze' | 'wind'

/**
 * One of the four cells on the Notes page's tally ticket (SCREENS.md §1.3).
 * `value` is text, never a number: the seeded journeys use "plenty" and
 * "uncounted" as freely as they use "19".
 */
export interface TallyCell {
  readonly key: string
  readonly value: string
}

/**
 * How much a journey's gallery holds, for the "{n} photographs and {m} clips
 * in the gallery" line in the Notes and Frames footers. DERIVED, never stored
 * (CLAUDE.md §7, DATA_MODEL.md "Derived, not stored"): it is a census of the
 * journey's media, taken at read time.
 */
export interface GalleryCounts {
  readonly photographs: number
  readonly clips: number
}

/** A trip: the unit of content a reader turns three pages of. */
export interface Journey {
  readonly id: JourneyId
  readonly slug: string
  readonly name: string
  readonly place: string
  readonly dates: string
  /** Sortable ISO 8601 counterpart to {@link dates} (CLAUDE.md §7) - the only way to order human date ranges. */
  readonly startsOn: string
  readonly hiddenFromBookmarks: boolean
  /** Free-text weather line printed inside the Notes page's weather badge, e.g. `'CLEAR 14C'`. */
  readonly weather: string
  /** Free-text mood line printed inside the Notes page's mood badge, e.g. `'WIDE EYED'`. */
  readonly mood: string
  /** Which glyph the weather badge draws. */
  readonly weatherGlyph: WeatherGlyph
  /**
   * The Notes page's highlight lines, at most four. The cap is the schema's
   * (`journeys.highlights.maxRows`) and the layout's: SCREENS.md §1.3 sizes
   * the list to its content and lets the ephemera slot take what is left, so
   * a fifth line would eat the slot rather than reflow the page.
   */
  readonly highlights: readonly string[]
  /** The Notes page's prose paragraph, under the highlights. */
  readonly note: string
  /** The four cells of the Notes page's tally ticket. */
  readonly tally: readonly TallyCell[]
  /** This journey's gallery census - see {@link GalleryCounts}. */
  readonly gallery: GalleryCounts
  readonly furniture: {
    readonly accent: string
    /** The closing line at the foot of the Notes page, e.g. `'nineteen tarts, no regrets'`. */
    readonly signoff: string
    /** The postage stamp's country line, e.g. `'NIPPON'`. */
    readonly stampCountry: string
    /** The postage stamp's face value, e.g. `'120'`. */
    readonly stampValue: string
  }
}

/** Which photo role a slot plays on its page: the single hero, the ephemera strip, or one of a frames page's photos. */
export type SlotRole = 'hero' | 'ephemera' | 'frame'

/**
 * One resolved photo slot, ready to render: a derivative URL - never an
 * original (CLAUDE.md §7) - plus the focal point for THIS placement.
 * DATA_MODEL.md: "Focal point lives on the slot, not the media item" - the
 * same photograph in a tall frame and a wide frame wants different focus, so
 * `focalX`/`focalY` here are the slot's own override, not the media item's default.
 */
export interface Slot {
  readonly role: SlotRole
  readonly src: string
  readonly alt: string
  readonly caption: string
  readonly focalX: number
  readonly focalY: number
}

/** Which of the three fixed book-wide pages, or which of a journey's three, a page is. */
export type BookPageKind = 'cover' | 'contents' | 'notes' | 'frames-i' | 'frames-ii' | 'about'

/**
 * Journey identity, display fields and printed content, carried by each of a
 * journey's three pages.
 *
 * The Notes-page content (`weather` through `stampValue`) sits here, on the
 * shared arm, rather than on a `'notes'`-only shape: `BookPage`'s journey arm
 * is one type, the values are journey-level facts rather than page-level
 * ones, and the Frames pages read `gallery` for their own footer count
 * (SCREENS.md §1.5). Copying a few strings onto two pages that do not print
 * them is cheaper than a second page shape and a second mapping.
 */
interface JourneyPageInfo {
  readonly journeyId: JourneyId
  readonly slug: string
  readonly name: string
  readonly place: string
  readonly dates: string
  readonly accent: string
  readonly hiddenFromBookmarks: boolean
  /** Free-text weather line, printed inside the Notes page's weather badge. */
  readonly weather: string
  /** Free-text mood line, printed inside the Notes page's mood badge. */
  readonly mood: string
  /** Which glyph the Notes page's weather badge draws. */
  readonly weatherGlyph: WeatherGlyph
  /** The Notes page's highlight lines, at most four - see {@link Journey.highlights}. */
  readonly highlights: readonly string[]
  /** The Notes page's prose paragraph. */
  readonly note: string
  /** The four cells of the Notes page's tally ticket. */
  readonly tally: readonly TallyCell[]
  /** The closing line at the foot of the Notes page. */
  readonly signoff: string
  /** The Notes page's postage-stamp country line. */
  readonly stampCountry: string
  /** The Notes page's postage-stamp face value. */
  readonly stampValue: string
  /** This journey's gallery census, for the footer count. */
  readonly gallery: GalleryCounts
  /**
   * This page's resolved photo slots, in display order. Optional because
   * {@link derivePages} - which only ever sees journey-level fields, never a
   * page's own `pages` row - cannot populate it; `readBookBundle`
   * (`apps/web/lib/readBookBundle.ts`) merges each page's slots in
   * afterwards from the matching `pages` document, which is the only place
   * that shape exists. Absent only when merged data could not be matched to
   * a page - the diary itself always renders with slots present.
   */
  readonly slots?: readonly Slot[]
}

/**
 * One of a journey's three pages, named so the page components can take it
 * as a prop. `Extract<BookPage, { kind: 'notes' }>` cannot express this: all
 * three kinds share one arm, so the extraction yields `never`.
 */
export interface JourneyPage extends JourneyPageInfo {
  readonly kind: 'notes' | 'frames-i' | 'frames-ii'
}

/**
 * One page in the reading sequence. Cover, Contents and About carry no
 * journey - the union makes reading `.slug` off one of them a compile error
 * rather than a runtime `undefined`.
 */
export type BookPage = { readonly kind: 'cover' } | { readonly kind: 'contents' } | { readonly kind: 'about' } | JourneyPage

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

/**
 * The editor-supplied chrome the Cover and Contents pages print: the `book`
 * global's own fields, already narrowed to definite values (CLAUDE.md §3.1 -
 * validate at the boundary, then trust the type inside). None is
 * `required: true` in the schema, so every text field here can legitimately
 * be an empty string, and the pages that read them render nothing rather
 * than a label with nothing after it - see `Cover.tsx`.
 */
export interface BookChrome {
  /** The cover title. Sized to fit by `fitTitleSize`, never truncated. */
  readonly title: string
  /** The italic line under the cover title. */
  readonly subtitle: string
  /** The name printed after "Kept by" on the cover. */
  readonly owner: string
  /** The cover cloth colour, one of `@travel-diary/tokens`' `coverCloths`. */
  readonly coverCloth: string
  /** The years line under the "Kept by" line. */
  readonly yearsShown: string
  /** The right-aligned italic note in the Contents header. */
  readonly contentsNote: string
  /** Whether the cover's washi strip and airmail stamp are drawn at all. */
  readonly showDecorations: boolean
}

/**
 * The editor-supplied content the About page prints: the `about` global's own
 * fields, already narrowed to definite values (CLAUDE.md §3.1 - validate at
 * the boundary, then trust the type inside). None is `required: true` in the
 * schema, so every field here can legitimately be empty, and `About.tsx`
 * renders nothing rather than a heading with nothing under it - the same
 * policy {@link BookChrome} applies to the cover.
 */
export interface AboutContent {
  /**
   * The portrait, resolved the same way a page slot is: a derivative URL
   * (never an original), the media item's alt text, the global's own
   * `portraitCaption`, and a focal point. `undefined` when no portrait has
   * been uploaded, in which case the About page draws its mount empty rather
   * than collapsing the column.
   *
   * ITS FOCAL POINT COMES FROM THE MEDIA ITEM, not from a slot, and this is
   * the one placement in the diary where that is correct: DATA_MODEL.md says
   * "`media.focalPoint` is the default; the slot overrides it", and the
   * `about` global holds a bare `upload` with no slot to override it with.
   */
  readonly portrait: Slot | undefined
  /** The biography paragraphs, in order. */
  readonly paragraphs: readonly string[]
  /** The packing-kit lines printed under the "Kit" eyebrow, in order. */
  readonly kit: readonly string[]
  /** The address printed under "Write to me". */
  readonly replyTo: string
}

/** The book's reading sequence, Contents index, bookmark rail and printed chrome. */
export interface BookBundle {
  readonly pages: readonly BookPage[]
  readonly contents: readonly ContentsEntry[]
  readonly bookmarks: readonly BookmarkTab[]
  readonly chrome: BookChrome
  readonly about: AboutContent
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
        weather: journey.weather,
        mood: journey.mood,
        weatherGlyph: journey.weatherGlyph,
        highlights: journey.highlights,
        note: journey.note,
        tally: journey.tally,
        signoff: journey.furniture.signoff,
        stampCountry: journey.furniture.stampCountry,
        stampValue: journey.furniture.stampValue,
        gallery: journey.gallery,
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
 * One tab of the bookmark rail as the reading surface actually draws it: the
 * pages it covers, the two lines printed on it, and the colour of its tint
 * bar. {@link BookmarkTab} carries the journey fields an editor's rail is
 * derived FROM; this carries only what a tab needs to be drawn, clicked and
 * marked active.
 */
export interface RailTab {
  /** The 0-based page index this tab jumps to, and the first page it covers. */
  readonly startIndex: number
  /**
   * How many consecutive pages this tab covers - three for a journey, one
   * for Cover, Contents and About. Carried rather than re-derived by the
   * rail, so the drawn active state and {@link deriveBookmarks}'s spans
   * cannot disagree (SCREENS.md §1.7).
   */
  readonly span: number
  /** The tab's first line, in Caveat 24px: a journey's name, or 'Cover'/'Contents'/'About'. */
  readonly name: string
  /** The tab's second line, in uppercase Courier 8.5px - see {@link railSub}. */
  readonly sub: string
  /**
   * The 6px tint bar's colour: a journey's own accent. `undefined` for the
   * three book-wide tabs, which have no journey behind them and are painted
   * in the rail's own default tint.
   */
  readonly tint: string | undefined
}

/** The first line of a rail tab: a journey's name, or the book-wide page's own. */
const railName = (page: BookPage): string => {
  switch (page.kind) {
    case 'cover':
      return 'Cover'
    case 'contents':
      return 'Contents'
    case 'about':
      return 'About'
    default:
      return page.name
  }
}

/**
 * The second line of a rail tab. The three book-wide tabs carry the
 * prototype's own copy; a journey carries the last two words of its
 * free-text `dates`, which for every seeded range ("12 – 24 March 2025") is
 * the month and the year. Taken from the prototype's `tabDef`
 * (`handoff/design_handoff_travel_diary/Travel Diary.dc.html`), which is
 * where SCREENS.md §1.7's unnamed "sub" is actually specified.
 */
const railSub = (page: BookPage): string => {
  switch (page.kind) {
    case 'cover':
      return 'the front'
    case 'contents':
      return 'index'
    case 'about':
      return 'colophon'
    default:
      return page.dates.split(' ').slice(-2).join(' ')
  }
}

/** A journey tab's tint bar colour - its own accent. The book-wide tabs have none. */
const railTint = (page: BookPage): string | undefined =>
  page.kind === 'cover' || page.kind === 'contents' || page.kind === 'about' ? undefined : page.accent

/**
 * Whether a rail tab covers the page the reader is on, and so is drawn
 * active (SCREENS.md §1.7: "a tab is active when `index ∈ [start, start+3)`").
 *
 * The interval is half-open, and that is the whole of the rule: a journey's
 * tab covers its notes page and both frames pages and stops, so the page
 * after them belongs to the next tab.
 * @param tab - The tab being drawn.
 * @param pageIndex - The 0-based page the reader is on.
 * @returns `true` when `pageIndex` falls inside the tab's span.
 * @example
 * isRailTabActive({ startIndex: 2, span: 3, ... }, 4) // true - the last of Tokyo's three
 * isRailTabActive({ startIndex: 2, span: 3, ... }, 5) // false - the span is exclusive
 */
export const isRailTabActive = (tab: RailTab, pageIndex: number): boolean =>
  pageIndex >= tab.startIndex && pageIndex < tab.startIndex + tab.span

/**
 * Labels the bookmark rail, dropping any tab that addresses a page the book
 * does not have.
 *
 * A `BookBundle` crosses a serialization boundary, so a rail and a reading
 * sequence that disagree is a state the reading surface can be handed. It was
 * the surface that used to drop such a tab, silently, in JSX; doing it here
 * means the rule is stated once, in the one place with a test that can prove
 * it, and the surface receives a rail it can draw without deciding anything.
 * @param pages - The reading sequence from {@link derivePages}.
 * @param bookmarks - The rail from {@link deriveBookmarks}.
 * @returns One labelled tab per bookmark that addresses a real page, in rail order.
 */
export const deriveRail = (pages: readonly BookPage[], bookmarks: readonly BookmarkTab[]): readonly RailTab[] =>
  bookmarks.flatMap((tab) => {
    const page = pages[tab.startIndex]
    if (page === undefined) return []

    return [
      {
        startIndex: tab.startIndex,
        span: tab.span,
        name: railName(page),
        sub: railSub(page),
        tint: railTint(page),
      },
    ]
  })

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

/**
 * Labels every page in the reading sequence, in reading order, for the bottom
 * bar's line under the page counter (SCREENS.md §1.7).
 *
 * Derived on the server and handed to the reading surface as plain strings:
 * the bar lives inside the book's `'use client'` boundary and `BookPage` does
 * not, so relabelling in the browser would mean serializing the whole reading
 * sequence a second time to produce thirty-three short strings.
 * @param pages - The reading sequence from {@link derivePages}.
 * @returns One label per page, positionally matching `pages`.
 * @example
 * derivePageLabels(derivePages([tokyo])) // ['Cover', 'Contents', 'Tokyo — Notes', ...]
 */
export const derivePageLabels = (pages: readonly BookPage[]): readonly string[] => pages.map(pageLabel)
