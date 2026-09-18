/**
 * readNavCounts — the four numbers the admin rail prints beside its buttons.
 *
 * FOUR QUERIES, NEVER FOUR LISTS. Each number is `payload.count`, which is a
 * `SELECT count(*)` and loads no rows at all — the rail is drawn on every admin
 * screen, so a count that paid for the list would put the whole media library
 * and every journey on the wire twelve screens over (CLAUDE.md §6).
 *
 * WHY NOT `find({ limit: 0 })`, which is the obvious spelling: in Payload
 * `limit: 0` means NO LIMIT. `find`'s `usePagination = pagination && limit !== 0`
 * turns paging off, and `@payloadcms/drizzle`'s `findMany` maps `limit === 0` to
 * `undefined`, so the query runs with no `LIMIT` clause and every row is
 * hydrated to read one integer off the envelope. That is the exact N+1-adjacent
 * cost this module exists to avoid, and it is why the four calls below are
 * `count` rather than `find`.
 *
 * THE SCOPE IS HANDED IN, NOT FETCHED. `adminScope` reads the account's row, so
 * a module that called it once per count would be four `users` lookups per
 * request. The caller hoists it — `const scope = await adminScope(session)` —
 * and this spreads the one value into each call, which is also what keeps
 * Payload's access rules ON for all four (Phase 4 Tasks 1 and 2).
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. It is four reads and one
 * object; a Repository over four integers would be ceremony.
 *
 * INVARIANT — a journey is in exactly one of `journeys` and `trashed`, and a
 * journey in the trash is in neither `unpublished` nor `journeys`. The trash is
 * not a queue waiting to go out.
 * Depends on: `payload` (types), `AdminScope` (./adminScope).
 */
import type { Payload } from 'payload'
import type { AdminScope } from './adminScope'

/** What the rail prints beside its buttons. */
export interface NavCounts {
  /** Live journeys — everything not in the trash. */
  readonly journeys: number
  /** Every row in the media library. */
  readonly media: number
  /** Live journeys that have never been published, for the header's chip. */
  readonly unpublished: number
  /** Journeys in the trash, kept for thirty days. */
  readonly trashed: number
}

/**
 * What marks a journey as moved to the trash.
 *
 * `deletedAt` is a plain indexed date column on the collection rather than
 * Payload's own `trash` feature (see `apps/web/collections/journeys.ts`), so
 * nothing excludes these rows automatically and every query below says which
 * side of the line it wants.
 */
const LIVE = { deletedAt: { exists: false } } as const

/** The same column, the other way round. */
const TRASHED = { deletedAt: { exists: true } } as const

/**
 * The four counts, in four queries.
 *
 * @param payload - The Local API instance the rows live behind.
 * @param scope - The hoisted {@link AdminScope}; see this module's header for
 *   why it is a parameter rather than something this module fetches.
 * @returns The four numbers, each straight from Postgres.
 * @throws From Payload, when a count is refused by the access rules the scope
 *   switches on — which is a bug in the guard that admitted the session, not a
 *   state a rail can draw.
 * @example
 * const scope = await adminScope(session)
 * const counts = await readNavCounts(await getPayload(), scope)
 */
export const readNavCounts = async (payload: Payload, scope: AdminScope): Promise<NavCounts> => {
  const [journeys, media, unpublished, trashed] = await Promise.all([
    payload.count({ collection: 'journeys', ...scope, where: LIVE }),
    payload.count({ collection: 'media', ...scope }),
    payload.count({ collection: 'journeys', ...scope, where: { ...LIVE, _status: { equals: 'draft' } } }),
    payload.count({ collection: 'journeys', ...scope, where: TRASHED }),
  ])

  return {
    journeys: journeys.totalDocs,
    media: media.totalDocs,
    unpublished: unpublished.totalDocs,
    trashed: trashed.totalDocs,
  }
}
