/**
 * readJourneysScreen — the rows SCREENS.md §2.2's table prints, in a fixed
 * number of queries.
 *
 * ═══ FOUR QUERIES, NEVER FOUR PER JOURNEY ═══
 *
 * Payload has no `GROUP BY`, so the obvious spelling of "how many pages does
 * each journey have" is a `count` inside the map — one query per journey, which
 * is exactly the N+1 CLAUDE.md §6 forbids and which nothing about a ten-row
 * seed would make visible. Instead: one `find` over the journeys, then ONE
 * `find` over `pages` and ONE over `media` with `where: { journey: { in: ids } }`
 * and a select narrow enough to tally in memory, and ONE `findVersions` over
 * the same ids. Four statements, whatever the row count, which is what "no N+1"
 * means here.
 *
 * `limit: 0` IS NOT HOW A COUNT IS SPELLED in Payload — it means NO limit, so
 * the query runs with no `LIMIT` clause and hydrates every row to read one
 * integer. `pagination: false` is the spelling that means "all of them", and it
 * is what the three grouped reads want anyway: they need the rows, not a total.
 * `readNavCounts.ts` carries the same note for the opposite case.
 *
 * ═══ WHY THE VERSIONS TABLE IS A FOURTH QUERY AND NOT A COLUMN ═══
 *
 * `edited` means "published, and something newer is not", and NOTHING on the
 * main row records it. Payload does not write the main collection row when it
 * saves a draft — `collections/operations/utilities/update.js` guards the
 * `updateOne` with `if (!isSavingDraft)` — so `_status` there is the PUBLISHED
 * state and the newer draft exists only in `_journeys_v`, where
 * `@payloadcms/drizzle`'s `createVersion` stamps the new row `latest: true` and
 * clears the flag on the rest. So "has a newer draft" is "its latest version is
 * a draft", asked once for every journey at once. The plan said three queries;
 * it was written before that was measured, and the count here is the measured
 * one (`readJourneysScreen.integration.test.ts` pins it from both sides).
 *
 * ═══ THE CHIPS FILTER IN MEMORY, AND THAT IS NOT LAZINESS ═══
 *
 * Three of the five chips could be pushed into the `where`; `edited` cannot,
 * because it is derived from two tables. Splitting the difference would give
 * two code paths deciding one question, and `journeyStatus` is the module that
 * exists so the Journeys screen and the Publish screen cannot disagree about a
 * word. The set filtered over is one author's live journeys, bounded by the
 * rail's own `journeys` count, and the query that fetches it is unconditional
 * either way.
 *
 * THE SCOPE IS HANDED IN, NOT FETCHED, for the reason `readNavCounts.ts` gives:
 * `adminScope` reads the account's row, so a module that called it per query
 * would be four `users` lookups per request.
 *
 * THE PAYLOAD INSTANCE IS A PARAMETER so the query count is observable. A
 * module that reached for `getPayload()` itself could not be asked how many
 * questions it asks; the screen passes `await getPayload()` and a test passes
 * whatever it wants to watch.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — one module owns how a screen's rows
 * are fetched and shaped, and the screen never sees a Payload document. DTO:
 * {@link JourneyRow} is the screen's shape, not the collection's.
 *
 * INVARIANT — every row this returns is live (`deletedAt` unset). The trash is
 * `/admin/trash`'s subject, and a journey appearing on both screens would let
 * an author edit something they had thrown away.
 * Depends on: `payload` (types), `JourneyStatus`/`journeyStatus`
 * (@travel-diary/domain/admin/journeyStatus), `JourneyId`/`journeyId`
 * (@travel-diary/domain/ids), `AdminScope` (./adminScope).
 */
import { JOURNEY_STATUS_FILTERS, journeyStatus, type JourneyStatus } from '@travel-diary/domain/admin/journeyStatus'
import { journeyId, type JourneyId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import type { AdminScope } from './adminScope'

/** One row of SCREENS.md §2.2's table, in the shape the screen draws. */
export interface JourneyRow {
  /** The journey, branded. Every row is addressed by this and never by index. */
  readonly id: JourneyId
  /** Caveat 30px, the top line of the name cell. */
  readonly name: string
  /** Garamond italic 15px, beneath the name. */
  readonly place: string
  /** Free text as the author typed it — "12 – 24 March 2025". */
  readonly dates: string
  /** How many pages the journey holds. */
  readonly pages: number
  /** How many media rows are keyed to it. */
  readonly media: number
  /** When it last changed, already formatted for the `Edited` cell. */
  readonly editedAt: string
  /** The word the pill prints, derived — no column stores it. */
  readonly status: JourneyStatus
  /** The cover's `thumb` derivative URL, or `null` when the journey has no cover. */
  readonly coverSrc: string | null
}

/** What the screen's `searchParams` amount to. */
export interface JourneysQuery {
  /** What the author typed, matched against the name and the place. */
  readonly search: string
  /** Which of SCREENS.md §2.2's five chips is pressed. */
  readonly filter: 'all' | JourneyStatus
}

/**
 * What one Next.js `searchParams` entry can be.
 *
 * A repeated parameter arrives as an array, which is a shape a browser really
 * does produce (`?q=a&q=b`, and a form posted twice) rather than a defensive
 * guess.
 */
type SearchParam = string | readonly string[] | undefined

/**
 * The first value of a `searchParams` entry.
 * @param value - What Next.js handed over.
 * @returns The single value, or `undefined` when there is none.
 */
const firstOf = (value: SearchParam): string | undefined => (typeof value === 'string' ? value : value?.[0])

/**
 * The screen's query, read out of the address it was served at.
 *
 * REFUSES A FILTER NO CHIP OFFERS. `?filter=nonsense` is an address anybody can
 * type; trusting it would draw an empty table under a chip row with nothing
 * pressed, which reads as "there are no journeys". Falling back to `all` shows
 * the list. It is an inversion rather than an enumeration of bad values: the
 * value has to be one `JOURNEY_STATUS_FILTERS` names.
 * @param params - Next.js's own `searchParams`, already awaited.
 * @returns What to ask {@link readJourneysScreen} for.
 * @example
 * journeysQuery({ q: 'bergen', filter: 'edited' }) // { search: 'bergen', filter: 'edited' }
 */
export const journeysQuery = (params: Readonly<Record<string, SearchParam>>): JourneysQuery => {
  const filter = firstOf(params['filter'])
  const offered = JOURNEY_STATUS_FILTERS.find((chip) => chip === filter)
  return { search: firstOf(params['q']) ?? '', filter: offered ?? 'all' }
}

/**
 * What marks a journey as moved to the trash.
 *
 * `deletedAt` is a plain indexed date column rather than Payload's own `trash`
 * feature (see `apps/web/collections/journeys.ts`), so nothing excludes these
 * rows automatically and this query has to say which side of the line it wants.
 */
const LIVE = { deletedAt: { exists: false } } as const

/**
 * How the `Edited` cell prints a timestamp.
 *
 * ═══ AND WHICH TIMESTAMP, WHICH IS THE HALF THAT WAS WRONG ═══
 *
 * It was the MAIN row's `updatedAt`, and this module's own header says in the
 * next block why that is the last PUBLISH rather than the last edit: Payload
 * does not write the main row when it saves a draft. So a journey published
 * eighteen months ago and edited this morning printed an `edited` pill beside
 * the publish date — the pill and the column contradicting each other in
 * exactly the state the fourth query was added to detect, and a journey that
 * had never been published printed its creation date forever (review round 1,
 * finding 1; measured against a real Postgres). The fourth query already
 * fetches the right row, so it now carries `updatedAt` too and the cell reads
 * that, falling back to the main row only for a journey with no newer draft —
 * where the main row IS the last edit.
 *
 * HANDOFF-DEVIATION (docs/deviations.md §54): the design prints a RELATIVE
 * time — "2 months ago", "just now". This prints the date. A relative string
 * is a function of the current instant, and this screen is rendered once on
 * the server and never re-rendered, so "2 months ago" would be true when the
 * response was written and quietly wrong for as long as the tab stayed open —
 * and CLAUDE.md §2.3 requires an injected clock, which a repository whose
 * signature the phase fixed has nowhere to take one from. `en-GB` because the
 * diary's own dates are written that way.
 */
const EDITED_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * What a journey's relationship field holds after a `depth: 0` read.
 *
 * Payload populates a relationship to the depth of the operation, so every read
 * below — all of them `depth: 0` — hands this a bare id. The TYPE still allows
 * the whole document, and a cast that guessed wrong would tally rows against
 * the wrong journey rather than fail, so it is narrowed and never cast
 * (`apps/web/collections/media.ts` does the same for its hook, for the same
 * reason). The refusing arm is what an accidental `depth: 1` would land in: it
 * drops the row from the tally rather than counting it as `NaN`.
 * @param journey - The relationship value as Payload returned it.
 * @returns The journey's row id, or `null` when the row belongs to none.
 */
const ownerOf = (journey: unknown): number | null => (typeof journey === 'number' ? journey : null)

/**
 * How many of `rows` belong to each journey.
 * @param rows - Rows carrying a `journey` relationship.
 * @returns A count per journey row id.
 */
const tallyByJourney = (rows: readonly { readonly journey?: unknown }[]): ReadonlyMap<number, number> => {
  const tally = new Map<number, number>()
  for (const row of rows) {
    const owner = ownerOf(row.journey)
    if (owner !== null) tally.set(owner, (tally.get(owner) ?? 0) + 1)
  }
  return tally
}

/**
 * The `thumb` derivative URL of each journey's cover.
 *
 * NEVER THE ORIGINAL (CLAUDE.md §6): a 44px thumbnail drawn from a 4000px
 * upload is the whole media library on the wire for one list. A cover whose
 * `thumb` is missing — an original too small for the tier — answers `null`,
 * which the table draws as the empty paper square rather than as a broken
 * image.
 * @param rows - The media rows, already fetched.
 * @returns One URL per journey that has a cover with a derivative.
 */
const coversByJourney = (
  rows: readonly {
    readonly journey?: unknown
    readonly isCover?: boolean | null
    readonly sizes?: { readonly thumb?: { readonly url?: string | null } }
  }[],
): ReadonlyMap<number, string> => {
  const covers = new Map<number, string>()
  for (const row of rows) {
    const owner = ownerOf(row.journey)
    const thumb = row.sizes?.thumb?.url
    if (owner !== null && row.isCover === true && typeof thumb === 'string') covers.set(owner, thumb)
  }
  return covers
}

/**
 * The rows SCREENS.md §2.2's table prints.
 *
 * @param payload - The Local API instance the rows live behind. A parameter so
 *   the query count is observable; see this module's header.
 * @param scope - The hoisted {@link AdminScope}, spread into every query.
 * @param query - See {@link JourneysQuery}.
 * @returns The live journeys the chip and the search admit, in the collection's
 *   own order.
 * @throws From Payload, when a read is refused by the access rules the scope
 *   switches on — a bug in the guard that admitted the session, not a state a
 *   table can draw.
 * @example
 * const scope = await adminScope(session)
 * const rows = await readJourneysScreen(await getPayload(), scope, { search: '', filter: 'all' })
 */
export const readJourneysScreen = async (
  payload: Payload,
  scope: AdminScope,
  query: JourneysQuery,
): Promise<readonly JourneyRow[]> => {
  const search = query.search.trim()
  const journeys = await payload.find({
    collection: 'journeys',
    ...scope,
    depth: 0,
    pagination: false,
    sort: 'order',
    select: { name: true, place: true, dates: true, archived: true, updatedAt: true, _status: true },
    where: search === '' ? LIVE : { and: [LIVE, { or: [{ name: { like: search } }, { place: { like: search } }] }] },
  })

  const ids = journeys.docs.map((journey) => journey.id)
  // Nothing to group by, and `{ in: [] }` is a query Postgres would still be
  // asked to run three times for an answer that cannot have rows in it.
  if (ids.length === 0) return []

  const [pages, media, newerDrafts] = await Promise.all([
    payload.find({
      collection: 'pages',
      ...scope,
      depth: 0,
      pagination: false,
      select: { journey: true },
      where: { journey: { in: ids } },
    }),
    payload.find({
      collection: 'media',
      ...scope,
      depth: 0,
      pagination: false,
      select: { journey: true, isCover: true, sizes: true },
      where: { journey: { in: ids } },
    }),
    payload.findVersions({
      collection: 'journeys',
      ...scope,
      depth: 0,
      pagination: false,
      // `updatedAt` as well as `parent`, because this query answers TWO
      // questions about the same row: whether there is a newer draft, and WHEN
      // it was saved. See the Edited note in this module's header.
      select: { parent: true, updatedAt: true },
      where: {
        and: [{ parent: { in: ids } }, { latest: { equals: true } }, { 'version._status': { equals: 'draft' } }],
      },
    }),
  ])

  const pageTally = tallyByJourney(pages.docs)
  const mediaTally = tallyByJourney(media.docs)
  const covers = coversByJourney(media.docs)
  // A MAP RATHER THAN A SET, because the same rows carry the Edited cell's date
  // as well as the pill's word — see the Edited note in this module's header.
  const draftedAt = new Map(newerDrafts.docs.map((version) => [version.parent, version.updatedAt]))

  const rows = journeys.docs.flatMap((journey): readonly JourneyRow[] => {
    const branded = journeyId(String(journey.id))
    // Unreachable while Postgres mints integer ids — `journeyId` refuses only
    // an empty string — and it is a `flatMap` rather than a `!` because
    // CLAUDE.md §0.8 bans the assertion that would hide it.
    /* c8 ignore next */
    if (!branded.ok) return []

    return [
      {
        id: branded.value,
        name: journey.name,
        place: journey.place,
        dates: journey.dates,
        pages: pageTally.get(journey.id) ?? 0,
        media: mediaTally.get(journey.id) ?? 0,
        // The newest draft's timestamp when there is one, and the main row's
        // otherwise. NOT the main row's alone: a draft save does not move it.
        editedAt: EDITED_FORMAT.format(new Date(draftedAt.get(journey.id) ?? journey.updatedAt)),
        status: journeyStatus({
          status: journey._status === 'published' ? 'published' : 'draft',
          hasNewerDraft: draftedAt.has(journey.id),
          archived: journey.archived === true,
        }),
        coverSrc: covers.get(journey.id) ?? null,
      },
    ]
  })

  return query.filter === 'all' ? rows : rows.filter((row) => row.status === query.filter)
}
