/**
 * readOverview — everything SCREENS.md §2.1's four cards draw, read once.
 *
 * ═══ THREE OF THE FOUR CARDS ARE VIEWS OF DATA OTHER TASKS PRODUCE ═══
 *
 * "Waiting to go out" is `readPendingChanges` — THE SAME MODULE the Publish
 * screen reads, called from here rather than re-derived, so the two screens
 * cannot report different sets. That is not a convenience: two screens
 * counting the same thing differently is the defect `journeyStatus.ts` was
 * written to avoid, and `docs/deviations.md` §91 records the one place on this
 * surface where it had happened. `readOverview.integration.test.ts` asserts
 * the two answers are the same list rather than trusting this sentence.
 *
 * "The book, live" takes its publish date from `readEditions`, the same read
 * the Publish screen's Editions card uses, so the rail's "Last published …"
 * line and this card's "Published …" cannot disagree either. Task 11's
 * `app/(admin)/admin/publish/page.tsx` left that decision here in as many
 * words.
 *
 * ═══ EVERY FIGURE IS DERIVED (DATA_MODEL.md, "Derived, not stored") ═══
 *
 * Nothing in this schema holds a photograph count, a draft count or a "pages
 * in the book" total. All eight of {@link OverviewFigures}' numbers come from
 * Postgres on each read; a stored counter would be a second source of truth
 * that drifts the first time a row is written by anything but the screen that
 * increments it.
 *
 * ═══ THE TWO SHAPES OF READ, AND WHY EACH IS THE SHAPE IT IS ═══
 *
 * The four stat FIGURES about the library are `payload.count` —
 * `readNavCounts.ts`'s argument, unchanged: a count that paid for the rows
 * would put the whole media library on the wire to read one integer. The
 * PROMPTS are a `find`, because §2.1 requires the first outstanding frame's
 * own id and a count cannot name a row.
 *
 * `photographs` is spelled `kind not_equals 'clip'` rather than
 * `kind equals 'still'`, and that is an inversion rather than a preference
 * (standing orders, species 6): `media.kind` is written by the ingest
 * pipeline, so a row it has not reached has no kind at all — and counting
 * `'still'` would leave such a row in neither column while the rail's Media
 * button still counted it. Spelled this way, `photographs + clips` IS every
 * row in the library, which is the number the rail prints, and
 * `readOverview.integration.test.ts` asserts the three against each other.
 *
 * ═══ NO N+1, AND THE NUMBER IS PINNED ═══
 *
 * {@link QUERIES_PER_READ} is what one read of this screen costs, whatever the
 * diary holds, and the integration file pins it from both sides by adding rows
 * and reading again. THE SCOPE IS HANDED IN, NOT FETCHED, for
 * `readNavCounts.ts`'s reason: `adminScope` reads the account's row, so a
 * module that called it per query would be thirteen `users` lookups per
 * request.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — one module owns how the Overview is
 * fetched, and no card sees a Payload document. DTO: {@link OverviewView} is
 * the screen, not a row.
 *
 * INVARIANT — `stats`' photographs and clips sum to every row in the media
 * library, and `waiting` is exactly what `/admin/publish` lists. Both are
 * asserted against Postgres rather than declared here.
 * Depends on: `overviewStats`/`prompts` (@travel-diary/domain/admin/…),
 * `PendingChange` (@travel-diary/domain/admin/pendingChange), the id brands
 * (@travel-diary/domain/ids), `ephemeraMediaIds`/`galleryFrameWhere`/
 * `GALLERY_FRAME_SORT` (../galleryFrames), `readEditions`/`readPendingChanges`
 * (./readPendingChanges), `payload` (types), `AdminScope` (./adminScope).
 */
import type { PendingChange } from '@travel-diary/domain/admin/pendingChange'
import { bookSummary, overviewStats, type OverviewStat } from '@travel-diary/domain/admin/overviewStats'
import { prompts, type FrameNeed, type Prompt } from '@travel-diary/domain/admin/prompts'
import { isRowId, journeyId, mediaId } from '@travel-diary/domain/ids'
import type { Payload, Where } from 'payload'
import { GALLERY_FRAME_SORT, ephemeraMediaIds, galleryFrameWhere } from '../galleryFrames'
import type { AdminScope } from './adminScope'
import { readEditions, readPendingChanges } from './readPendingChanges'

/**
 * How many statements one read of this screen costs, whatever the diary holds.
 *
 * Eight of this module's own — three `find`s, four `count`s and one
 * `findGlobal` — plus `readPendingChanges`' four and `readEditions`' one.
 * Pinned from BOTH sides by `readOverview.integration.test.ts`: a per-journey
 * query makes the second reading longer than the first.
 */
export const QUERIES_PER_READ = 13

/**
 * How many rows SCREENS.md §2.1's "Lately" card lists.
 *
 * A CHOSEN CEILING, AND NOTHING DERIVES IT. §2.1 gives no cap and the
 * prototype's fixture holds six, drawn in two columns. Six is taken from that
 * fixture; both sides of it are pinned by cases built from this constant, so
 * the boundary follows it wherever it is moved.
 */
export const LATELY_SHOWN = 6

/** SCREENS.md §2.1's "The book, live" card. */
export interface LiveBook {
  /** The `book` global's title, which the 78x104px chip fits. */
  readonly title: string
  /** The years line under it, from `book.yearsShown`. `''` when unset. */
  readonly years: string
  /** The summary line — "33 pages · 13 bookmarks · 4 galleries open". */
  readonly summary: string
  /** When the book last went out, already formatted, or `null` for never. */
  readonly publishedAt: string | null
}

/** One row of SCREENS.md §2.1's "Lately" card. */
export interface LatelyRow {
  /** Stable key: the collection and the row id. Never a position (§0.9). */
  readonly id: string
  /** The 82px Courier timestamp. */
  readonly at: string
  /** The description beside it, Garamond 16.5px. */
  readonly what: string
}

/** Everything SCREENS.md §2.1 draws. */
export interface OverviewView {
  /** The four cards of the stat grid, in the order it prints them. */
  readonly stats: readonly OverviewStat[]
  /** "Waiting to go out" — the Publish screen's own list, unchanged. */
  readonly waiting: readonly PendingChange[]
  /** "The book, live". */
  readonly book: LiveBook
  /** "Needs a look". */
  readonly needsALook: readonly Prompt[]
  /** "Lately", newest first, at most {@link LATELY_SHOWN} rows. */
  readonly lately: readonly LatelyRow[]
}

/**
 * Which journeys this screen is about: the ones not in the trash.
 *
 * The same line `readNavCounts.ts` draws, so the stat grid's "Journeys" and
 * the rail's own number count one set. An ARCHIVED journey is still a live
 * journey here for that reason — it is on a shelf, not deleted
 * (`journeyStatus.ts`) — and the book summary below excludes it separately,
 * where the exclusion is about what a reader can see rather than about what
 * the author has.
 */
const LIVE = { deletedAt: { exists: false } } as const

/**
 * How the Lately card writes a timestamp.
 *
 * THE DATE, NOT "2h ago", which is `readJourneysScreen.ts`'s decision arriving
 * here for its own reason: a relative string is a function of the current
 * instant, this screen is rendered once on the server and never re-rendered,
 * and CLAUDE.md §2.3 requires an injected clock this repository's read
 * signatures have nowhere to take one from. `docs/deviations.md` §54 records
 * it. The prototype's "2h ago"/"yesterday" column is what this replaces.
 */
const WHEN = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * What a `pages` row's relationship holds after a `depth: 0` read.
 *
 * `readPendingChanges.ts`'s `ownerOf`, for its reason: Payload populates a
 * relationship to the depth of the operation, the TYPE still allows the whole
 * document, and a cast that guessed wrong would file a page under the wrong
 * journey rather than fail.
 * @param journey - The relationship value as Payload returned it.
 * @returns The journey's row id, or `null` when the row belongs to none.
 */
/* c8 ignore next -- the refusing arm is unreachable at `depth: 0`, where Payload hands over a bare id; it exists because the TYPE allows the whole document. */
const ownerOf = (journey: unknown): number | null => (typeof journey === 'number' ? journey : null)

/** One thing that changed, with the instant it is sorted by still on it. */
interface Stamped {
  readonly row: LatelyRow
  readonly at: string
}

/**
 * Builds one Lately row.
 *
 * The sort key is carried BESIDE the row rather than looked up by position in
 * a parallel list: two lists zipped by index drift the moment either drops an
 * entry, and all three builders below can drop one.
 * @param kind - Which collection the row is in, for the key.
 * @param row - Its row id.
 * @param what - The description.
 * @param at - When it last changed, as an ISO string.
 * @returns The stamped row.
 */
const aLatelyRow = (kind: string, row: number, what: string, at: string): Stamped => ({
  row: { id: `${kind}:${String(row)}`, at: WHEN.format(new Date(at)), what },
  at,
})

/**
 * The library counts, spelled as inversions.
 * @param clips - Whether this is the clip half or the everything-else half.
 * @param extra - A further clause, for the "of those" figure.
 * @returns The `where`.
 */
const libraryWhere = (clips: boolean, extra: Where = {}): Where => ({
  and: [{ kind: clips ? { equals: 'clip' } : { not_equals: 'clip' } }, extra],
})

/**
 * Everything SCREENS.md §2.1's Overview draws.
 *
 * @param payload - The Local API instance the rows live behind. A parameter so
 *   the query count is observable; see this module's header.
 * @param scope - The hoisted {@link AdminScope}, spread into every query.
 * @returns The four cards' data. See {@link OverviewView}.
 * @throws From Payload, when a read is refused by the access rules the scope
 *   switches on — a bug in the guard that admitted the session, not a state a
 *   card can draw.
 * @example
 * const scope = await adminScope(session)
 * const view = await readOverview(await getPayload(), scope)
 */
export const readOverview = async (payload: Payload, scope: AdminScope): Promise<OverviewView> => {
  const journeys = await payload.find({
    collection: 'journeys',
    ...scope,
    depth: 0,
    pagination: false,
    sort: 'order',
    select: {
      name: true,
      slug: true,
      _status: true,
      archived: true,
      hiddenFromBookmarks: true,
      updatedAt: true,
    },
    where: LIVE,
  })

  const live = journeys.docs.filter((journey) => isRowId(journey.id))
  const liveIds = live.map((journey) => journey.id)
  const names = new Map(live.map((journey) => [journey.id, journey.name]))

  /**
   * One live journey's name.
   * @param row - Its row id.
   * @returns The name.
   */
  /* c8 ignore next -- the fallback is unreachable: every id asked about here came out of a query keyed on `liveIds`. Named once so the three call sites below do not each carry an arm nothing can take (CLAUDE.md §2.1). */
  const nameOf = (row: number): string => names.get(row) ?? ''

  const [pages, photographs, photographsInBook, clips, clipsWithPoster, book, waiting, editions] = await Promise.all([
    payload.find({
      collection: 'pages',
      ...scope,
      depth: 0,
      pagination: false,
      select: { journey: true, title: true, _status: true, slots: true, updatedAt: true },
      where: { journey: { in: liveIds } },
    }),
    payload.count({ collection: 'media', ...scope, where: libraryWhere(false) }),
    payload.count({ collection: 'media', ...scope, where: libraryWhere(false, { inBook: { equals: true } }) }),
    payload.count({ collection: 'media', ...scope, where: libraryWhere(true) }),
    payload.count({ collection: 'media', ...scope, where: libraryWhere(true, { posterAt: { exists: true } }) }),
    payload.findGlobal({ slug: 'book', ...scope, depth: 0, select: { title: true, yearsShown: true } }),
    // THE PUBLISH SCREEN'S OWN READ, called rather than re-derived. See this
    // module's header.
    readPendingChanges(payload, scope),
    readEditions(payload, scope),
  ])

  const frames = await payload.find({
    collection: 'media',
    ...scope,
    depth: 0,
    pagination: false,
    // THE DIARY'S OWN SORT, so "the first clip with no poster" is the first
    // one an author meets on §2.5's grid rather than the lowest row id.
    sort: [...GALLERY_FRAME_SORT],
    // The PUBLIC answer: a frame an editor has already withheld is not a frame
    // a reader is waiting on a caption for. One definition of "a gallery
    // frame", asked for rather than re-spelled (`../galleryFrames`).
    where: galleryFrameWhere(liveIds, ephemeraMediaIds(pages.docs)),
    select: { journey: true, kind: true, caption: true, alt: true, posterAt: true, filename: true, updatedAt: true },
  })

  /**
   * One frame as a prompt's target, or `null` when its journey cannot be
   * branded — unreachable while Postgres mints integer ids.
   * @param frame - The media row.
   * @returns The need, or `null`.
   */
  const needOf = (frame: (typeof frames.docs)[number]): FrameNeed | null => {
    const owner = ownerOf(frame.journey)
    /* c8 ignore next -- every row here came out of a query keyed on these journey ids at `depth: 0`. */
    if (owner === null) return null
    const branded = journeyId(String(owner))
    const id = mediaId(String(frame.id))
    /* c8 ignore next -- both brands refuse only the empty string, and both ids came from Postgres. */
    if (!branded.ok || !id.ok) return null

    return { id: id.value, journey: branded.value, journeyName: nameOf(owner) }
  }

  /**
   * The frames a prompt is about.
   * @param wanted - Which frames this prompt cares about.
   * @returns Those frames, as needs, in gallery order.
   */
  const needs = (wanted: (frame: (typeof frames.docs)[number]) => boolean): readonly FrameNeed[] =>
    frames.docs.flatMap((frame): FrameNeed[] => {
      if (!wanted(frame)) return []
      const need = needOf(frame)
      /* c8 ignore next -- `needOf`'s own refusals are unreachable, above; this is the arm that would carry one. */
      return need === null ? [] : [need]
    })

  const publishedJourneys = live.filter((journey) => journey._status === 'published')
  const inBookmarks = publishedJourneys.filter(
    (journey) => journey.archived !== true && journey.hiddenFromBookmarks !== true,
  )
  const galleriesOpen = new Set(
    frames.docs.flatMap((frame) => {
      const owner = ownerOf(frame.journey)
      /* c8 ignore next -- `galleryFrameWhere` keyed this query on `liveIds`, so every row here names one of them. */
      return owner === null ? [] : [owner]
    }),
  )
  const publishedPages = pages.docs.filter((page) => page._status === 'published')

  const lately = [
    ...live.map((journey) => aLatelyRow('journey', journey.id, `The ${journey.name} journey`, journey.updatedAt)),
    ...pages.docs.flatMap((page): Stamped[] => {
      const owner = ownerOf(page.journey)
      /* c8 ignore next -- `journey` is `required: true` on the collection and this read is `depth: 0`. */
      if (owner === null) return []
      return [aLatelyRow('page', page.id, `${page.title ?? 'A page'}, in ${nameOf(owner)}`, page.updatedAt)]
    }),
    /* c8 ignore next -- `filename` is written by Payload's own upload handler, so a `media` row without one is a row that was never uploaded; the fallback exists because the generated type allows it. */
    ...frames.docs.map((frame) => aLatelyRow('media', frame.id, frame.filename ?? 'A file', frame.updatedAt)),
  ]
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, LATELY_SHOWN)
    .map((stamped) => stamped.row)

  return {
    stats: overviewStats({
      journeys: live.length,
      journeysInDraft: live.length - publishedJourneys.length,
      pages: pages.docs.length,
      pagesInDraft: pages.docs.length - publishedPages.length,
      photographs: photographs.totalDocs,
      photographsInBook: photographsInBook.totalDocs,
      clips: clips.totalDocs,
      clipsWithPoster: clipsWithPoster.totalDocs,
    }),
    waiting,
    book: {
      /* c8 ignore next 2 -- a `book` global with no title and no years at all is a fresh install; `diary_test` is shared and seeded, so no case can reach these arms without emptying a global three other integration files read. `readPendingChanges.ts` carries the same treatment for the same reason. */
      title: book.title ?? '',
      years: book.yearsShown ?? '',
      // WHAT A READER WOULD FIND, not what the author has — see `bookSummary`.
      summary: bookSummary({
        pages: publishedPages.length,
        bookmarks: inBookmarks.length,
        galleries: galleriesOpen.size,
      }),
      /* c8 ignore next -- a diary with no published version of any journey, which is the same fresh install: the seeded `diary_test` always has one. */
      publishedAt: editions[0]?.at ?? null,
    },
    needsALook: prompts({
      clipsWithoutPosters: needs((frame) => frame.kind === 'clip' && typeof frame.posterAt !== 'number'),
      framesWithoutCaptions: needs((frame) => (frame.caption ?? '') === ''),
      framesWithoutAltText: needs((frame) => (frame.alt ?? '') === ''),
      publishedJourneys: publishedJourneys.length,
    }),
    lately,
  }
}
