/**
 * readTrashScreen — the rows SCREENS.md §2.10's one card prints.
 *
 * ═══ WHAT IS IN THE TRASH IS A COLUMN, NOT A COLLECTION ═══
 *
 * `journeys.deletedAt` is a plain indexed date rather than Payload's own
 * `trash` feature (`apps/web/collections/journeys.ts`), so this screen is the
 * INVERSE of the `{ deletedAt: { exists: false } }` clause every other admin
 * read applies — one definition, read both ways, rather than two ideas of
 * what "deleted" means.
 *
 * ═══ THE COUNTDOWN'S CLOCK IS INJECTED, AND STOPS AT NOTHING ═══
 *
 * `now` is a parameter (CLAUDE.md §2.3) and `daysUntilGone`
 * (`@travel-diary/domain/admin/trashCountdown`) does the arithmetic. NOTHING
 * SWEEPS THE TRASH: no job, no cron and no hook removes a row when its thirty
 * days are up, so a row past the window is still listed, still restorable,
 * and says so rather than counting down to a promise this repository does not
 * keep. `deleteJourneyForGood` runs because an author pressed a button.
 *
 * ═══ THE COUNTS ARE DERIVED, AND THEY ARE ABOUT WHAT COMES BACK ═══
 *
 * §2.10's row says "{place} · 3 pages · {n} photographs", which is what a
 * restore would return — so the pages and the media counted here are the ones
 * still keyed to the journey, not the ones it had when it was thrown away.
 * `DATA_MODEL.md`'s "Derived, not stored" applies: nothing holds either
 * number.
 *
 * ═══ NO N+1 ═══
 *
 * Three statements, whatever the trash holds: the journeys, their pages, and
 * their media. {@link QUERIES_PER_READ} is pinned from both sides by
 * `readTrashScreen.integration.test.ts`. THE SCOPE IS HANDED IN, NOT FETCHED,
 * for `readNavCounts.ts`'s reason.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — one module owns how the Trash screen
 * is fetched. DTO: {@link TrashRow} is a row of the card, not a `journeys`
 * document.
 *
 * INVARIANT — every row this returns has a `deletedAt`, and every row keyed by
 * its own journey id (CLAUDE.md §0.9). The screen's Put back and Delete for
 * good post that id and nothing positional.
 * Depends on: `daysUntilGone`/`goesForGoodLine`
 * (@travel-diary/domain/admin/trashCountdown), `journeyId`
 * (@travel-diary/domain/ids), `payload` (types), `AdminScope` (./adminScope).
 */
import { daysUntilGone, goesForGoodLine } from '@travel-diary/domain/admin/trashCountdown'
import { journeyId, type JourneyId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import type { AdminScope } from './adminScope'

/**
 * How many statements one read of this screen costs, whatever the trash holds.
 *
 * The journeys, their pages and their media. Pinned from BOTH sides by
 * `readTrashScreen.integration.test.ts`.
 */
export const QUERIES_PER_READ = 3

/** One row of SCREENS.md §2.10's card. */
export interface TrashRow {
  /** The journey, branded. Every row is addressed by this, never by index (§0.9). */
  readonly id: JourneyId
  /** Caveat 27px, the row's top line. */
  readonly name: string
  /** The line beneath it — "{place} · 3 pages · {n} photographs". */
  readonly summary: string
  /** "goes for good in 30 days", or what is true once the window has passed. */
  readonly goesForGood: string
  /** How many days are left, for anything that needs the number rather than the sentence. */
  readonly daysLeft: number
  /** The 46px thumb's derivative URL, or `null` for a journey with no cover. */
  readonly thumbSrc: string | null
}

/** What marks a journey as thrown away — the inverse of every other read's clause. */
const IN_THE_TRASH = { deletedAt: { exists: true } } as const

/**
 * What a `pages` or `media` row's relationship holds after a `depth: 0` read.
 *
 * `readOverview.ts`'s `ownerOf`, for its reason: Payload populates a
 * relationship to the depth of the operation, the TYPE still allows the whole
 * document, and a cast that guessed wrong would file a row under the wrong
 * journey rather than fail.
 * @param journey - The relationship value as Payload returned it.
 * @returns The journey's row id, or `null` when the row belongs to none.
 */
/* c8 ignore next -- the refusing arm is unreachable at `depth: 0`, where Payload hands over a bare id; it exists because the TYPE allows the whole document. */
const ownerOf = (journey: unknown): number | null => (typeof journey === 'number' ? journey : null)

/**
 * How many rows each journey owns.
 * @param rows - The rows, already fetched.
 * @returns One count per journey that owns at least one.
 */
const tallyByJourney = (rows: readonly { readonly journey?: unknown }[]): ReadonlyMap<number, number> => {
  const tally = new Map<number, number>()
  for (const row of rows) {
    const owner = ownerOf(row.journey)
    if (owner !== null) tally.set(owner, (tally.get(owner) ?? 0) + 1)
  }
  return tally
}

/** What a media row contributes to the row's thumb. */
interface ThumbRow {
  readonly journey?: unknown
  readonly isCover?: boolean | null
  readonly sizes?: { readonly thumb?: { readonly url?: string | null } }
}

/**
 * The `thumb` derivative URL of each journey's cover.
 *
 * NEVER THE ORIGINAL (CLAUDE.md §6), `readJourneysScreen.ts`'s rule one screen
 * over: a 46px square drawn from a 4000px upload is the whole media library on
 * the wire for one list. A cover whose `thumb` is missing answers `null`,
 * which the card draws as the empty paper square rather than as a broken
 * image.
 * @param rows - The media rows, already fetched.
 * @returns One URL per journey that has a cover with a derivative.
 */
const coversByJourney = (rows: readonly ThumbRow[]): ReadonlyMap<number, string> => {
  const covers = new Map<number, string>()
  for (const row of rows) {
    const owner = ownerOf(row.journey)
    const thumb = row.sizes?.thumb?.url
    if (owner !== null && row.isCover === true && typeof thumb === 'string') covers.set(owner, thumb)
  }
  return covers
}

/**
 * The plural of a count, written the way §2.10's line writes it.
 * @param count - How many.
 * @param singular - The word for one.
 * @returns "1 page", "3 pages".
 */
const counted = (count: number, singular: string): string => `${String(count)} ${singular}${count === 1 ? '' : 's'}`

/**
 * Everything SCREENS.md §2.10's Trash card draws.
 *
 * @param payload - The Local API instance the rows live behind. A parameter so
 *   the query count is observable; see this module's header.
 * @param scope - The hoisted {@link AdminScope}, spread into every query.
 * @param now - The reading of the clock the countdown is taken at.
 * @returns One row per journey in the trash, newest first — the order an
 *   author looks for what they just threw away.
 * @throws From Payload, when a read is refused by the access rules the scope
 *   switches on.
 * @example
 * const rows = await readTrashScreen(await getPayload(), scope, Date.now())
 */
export const readTrashScreen = async (
  payload: Payload,
  scope: AdminScope,
  now: number,
): Promise<readonly TrashRow[]> => {
  const journeys = await payload.find({
    collection: 'journeys',
    ...scope,
    depth: 0,
    pagination: false,
    // NEWEST FIRST: what an author is looking for is what they just threw
    // away, and the row at the bottom is the one closest to being gone.
    sort: '-deletedAt',
    select: { name: true, place: true, deletedAt: true },
    where: IN_THE_TRASH,
  })

  const ids = journeys.docs.map((journey) => journey.id)
  const [pages, media] = await Promise.all([
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
      select: { journey: true, isCover: true, sizes: true, kind: true },
      where: { journey: { in: ids } },
    }),
  ])

  const pageCount = tallyByJourney(pages.docs)
  // PHOTOGRAPHS, NOT EVERY FILE. §2.10's line says "photographs", and the
  // inversion is `readOverview.ts`'s: a row the ingest pipeline has not
  // reached has no `kind` at all, so counting `'still'` would drop it.
  const photographCount = tallyByJourney(media.docs.filter((row) => row.kind !== 'clip'))
  const covers = coversByJourney(media.docs)

  return journeys.docs.flatMap((journey): TrashRow[] => {
    const branded = journeyId(String(journey.id))
    /* c8 ignore next -- the brand refuses only the empty string, and every id here came from Postgres. */
    if (!branded.ok) return []

    /* c8 ignore next -- the empty-string arm is unreachable: every row here came out of a query keyed on `deletedAt: { exists: true }`. It is here because the generated TYPE allows `string | null`, and `daysUntilGone` answers 0 for a stamp that is not an instant rather than NaN. */
    const days = daysUntilGone(journey.deletedAt ?? '', now)

    return [
      {
        id: branded.value,
        name: journey.name,
        // THE PLACE IS ALWAYS THERE, and this line used to guard against its
        // being empty. It cannot be: `place` is `required: true` on the
        // collection, and Postgres refused the fixture that tried to create a
        // journey without one — `ValidationError: The following field is
        // invalid: Place`. A guard over a shape no writer can produce is the
        // fixture defect this repository has watched before, so it is gone
        // rather than left looking careful.
        summary: [
          journey.place,
          counted(pageCount.get(journey.id) ?? 0, 'page'),
          counted(photographCount.get(journey.id) ?? 0, 'photograph'),
        ].join(' · '),
        goesForGood: goesForGoodLine(days),
        daysLeft: days,
        thumbSrc: covers.get(journey.id) ?? null,
      },
    ]
  })
}
