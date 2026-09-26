/**
 * publishSelection — SCREENS.md §2.8's three writes, and the design spec §8
 * sentence this repository has been carrying as a gap since Phase 1:
 * "Publishing triggers on-demand revalidation of affected paths only."
 *
 * ═══ WHY THE PATHS ARE RETURNED AND NOT REVALIDATED HERE ═══
 *
 * Every other write in this directory leaves `revalidatePath` to its
 * `actions.ts`, and a `…RevalidationRegistration.test.ts` reads the addresses
 * off that source — because a `'use server'` module is dispatched under an
 * opaque action id and no Vitest project can execute one. That instrument
 * reads CONSTANTS. This screen's set is COMPUTED, one path per page of a
 * journey, so there is no constant for a registration test to find and no
 * amount of file reading can check it. So this function answers the addresses
 * and `app/(admin)/admin/publish/actions.ts` spends them in one loop — which
 * puts the decision back where an integration test can execute it, and leaves
 * the action holding only wiring, exactly as the others do.
 *
 * ═══ THE BOOK IS READ BEFORE THE PUBLISH, AND THAT IS THE CORRECT ORDER ═══
 *
 * A cache entry can only exist for an address that has been SERVED, and only
 * the addresses of the book as it stands have been served. Publishing a
 * journey the book does not hold yet inserts three leaves and renumbers
 * everything after them, so every existing `/p/<n>` becomes stale — which is
 * `affectedPaths`' own insertion arm — while the three new addresses have
 * nothing cached under them to invalidate. Reading the bundle afterwards would
 * name those three and miss the renumbering, which is the wrong half.
 *
 * ═══ PUBLISHING IS THE MERGE TRAP, SPENT DELIBERATELY ═══
 *
 * Payload's `updateByID` fetches the document it merges into with
 * `getLatestCollectionVersion`, which is passed no `published` key — so the
 * merge source is the NEWEST VERSION whatever `draft` says. Four sibling
 * modules carry a two-write dance to work AROUND that. Here it is the
 * mechanism: `update({ data: { _status: 'published' } })` takes the pending
 * draft and makes it live, which is exactly what this button means. It is
 * asserted rather than assumed — the publish case reads the note back through
 * `readBookBundle`, the diary's own mapper.
 *
 * ═══ AN EMPTY SELECTION PUBLISHES NOTHING ═══
 *
 * Said out loud because the alternative reading is available and is the worst
 * default this screen could have: the array IS the selection, so `[]` is
 * "nothing was ticked" and never "everything". Both halves are asserted — no
 * row moves and no path comes back.
 *
 * ═══ EVERY ID IS PARSED, AND A STALE ONE IS DROPPED ═══
 *
 * An id that does not parse is a body no `<form>` of this repository's
 * produces, and it is REFUSED (species 6: the kind must BE one the screen can
 * publish). An id that parses but is no longer waiting is an ordinary stale
 * render — two tabs, or a second press — and it is DROPPED, because there is
 * nothing to publish and nothing to invalidate. SCREENS.md §2.8 draws no error
 * surface for either (`docs/deviations.md` §60), so a refusal arrives as an
 * unhandled Server Action error and a drop arrives as a screen that redraws
 * with the row gone.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — the version tables stop here, and
 * the screen's actions speak in change ids and paths.
 *
 * INVARIANT — nothing here writes a field. Every write is a publish, a revert
 * or a restore of a version that already exists, so no content can be changed
 * by this screen at all.
 * Depends on: `affectedPaths` (@travel-diary/domain/admin/affectedPaths),
 * `parsedChangeId`/`PendingChange` (@travel-diary/domain/admin/pendingChange),
 * `journeyId` (@travel-diary/domain/ids), `payload` (types),
 * `readBookBundle` (../readBookBundle), `AdminScope` (./adminScope),
 * `readPendingChanges` (./readPendingChanges).
 */
import { affectedPaths } from '@travel-diary/domain/admin/affectedPaths'
import { changeId, parsedChangeId, type ChangeKind, type PendingChange } from '@travel-diary/domain/admin/pendingChange'
import { journeyId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import { readBookBundle } from '../readBookBundle'
import type { AdminScope } from './adminScope'
import { readPendingChanges } from './readPendingChanges'

/**
 * Which Payload collection each {@link ChangeKind} is a row of.
 *
 * A TABLE RATHER THAN A STRING BUILT AT THE CALL SITE. The kind arrives from a
 * form, and a collection slug interpolated from user input is a row id pointed
 * at whatever table the poster named. This maps only the two kinds
 * `parsedChangeId` admits.
 */
const COLLECTION = { journey: 'journeys', page: 'pages' } as const satisfies Record<ChangeKind, 'journeys' | 'pages'>

/**
 * The parsed ids a selection names, or a refusal.
 * @param ids - The ids the ticks posted.
 * @returns One parse per id.
 * @throws {Error} When any id names nothing this screen can publish.
 */
const parsedAll = (ids: readonly string[]): readonly { readonly kind: ChangeKind; readonly row: number }[] =>
  ids.map((id) => {
    const parsed = parsedChangeId(id)
    if (parsed === null) throw new Error(`publishSelection: ${id} names nothing this screen can publish`)
    return parsed
  })

/**
 * The change ids the ticked boxes posted.
 *
 * `getAll` rather than `Object.fromEntries`, which keeps only the LAST of a
 * repeated name — and the Changes card posts one `change` field per ticked row.
 * A `File` entry is not a string and is dropped here, which
 * {@link publishSelection}'s parse would then have refused anyway.
 * @param form - The body the publish form posted.
 * @returns The ids, in document order.
 * @example
 * await publishSelection(payload, scope, readSelection(form))
 */
export const readSelection = (form: FormData): readonly string[] =>
  form.getAll('change').flatMap((value) => (typeof value === 'string' ? [value] : []))

/**
 * The edition id a row's Restore posted.
 * @param form - The body the Editions card's own form posted.
 * @returns The id, or `''` when the field is absent, which the read refuses.
 * @example
 * await restoreEdition(payload, scope, readEdition(form))
 */
export const readEdition = (form: FormData): string => {
  const posted = form.get('edition')
  return typeof posted === 'string' ? posted : ''
}

/**
 * Publishes the ticked changes, and answers the diary addresses they made stale.
 *
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}, spread into every call.
 * @param ids - The ids the ticked rows posted. An empty array publishes
 *   nothing; see this module's header.
 * @returns Every diary path the publish invalidated, each once. Empty when
 *   nothing was published.
 * @throws {Error} When an id names nothing this screen can publish.
 * @throws From Payload, when a write is refused by the access rules.
 * @example
 * for (const path of await publishSelection(payload, scope, ['journey:12'])) revalidatePath(path)
 */
export const publishSelection = async (
  payload: Payload,
  scope: AdminScope,
  ids: readonly string[],
): Promise<readonly string[]> => {
  const parsed = parsedAll(ids)
  if (parsed.length === 0) return []

  const waiting = new Map((await readPendingChanges(payload, scope)).map((change) => [change.id, change]))
  // A STALE ID IS DROPPED, not published: it names a row whose newest version
  // is already the published one, so there is nothing to publish and nothing
  // to invalidate.
  const selected = parsed.flatMap((one): readonly PendingChange[] => {
    const change = waiting.get(changeId(one.kind, one.row))
    return change === undefined ? [] : [change]
  })
  if (selected.length === 0) return []

  // BEFORE THE WRITES. See this module's header: the addresses that can be
  // stale are the addresses that have been served.
  const paths = affectedPaths(selected, await readBookBundle())

  for (const one of parsed) {
    if (!waiting.has(changeId(one.kind, one.row))) continue
    await payload.update({ collection: COLLECTION[one.kind], id: one.row, ...scope, data: { _status: 'published' } })
  }

  return paths
}

/**
 * The newest PUBLISHED version of one row, which is the version a reader is
 * being served.
 *
 * Shared by the two writes that both need it and would otherwise ask the same
 * question twice: a revert restores it, and a restore of an OLDER edition must
 * refuse it. `-updatedAt` with `limit: 1` rather than `latest: true`, because
 * `latest` is the newest version of any status — on a row with a pending draft
 * that is the draft, which is the opposite of what both callers want.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param collection - Which versioned collection the row is in.
 * @param row - The row id.
 * @returns The version, or `undefined` when the row has never been published.
 */
const newestPublishedVersion = async (
  payload: Payload,
  scope: AdminScope,
  collection: 'journeys' | 'pages',
  row: number,
): Promise<{ readonly id: string | number } | undefined> => {
  const published = await payload.findVersions({
    collection,
    ...scope,
    depth: 0,
    limit: 1,
    sort: '-updatedAt',
    select: { parent: true },
    where: { and: [{ parent: { equals: row } }, { 'version._status': { equals: 'published' } }] },
  })
  return published.docs[0]
}

/**
 * Discards one pending change, putting the row back to the version readers are
 * already looking at.
 *
 * IT RESTORES THE NEWEST PUBLISHED VERSION rather than deleting the draft,
 * because Payload has no "discard draft" operation and the published version
 * is exactly what "what readers already see" means. The live row therefore
 * does not move — it is written from content identical to its own — which is
 * the column the case checks, because a revert that published the draft on its
 * way to discarding it would satisfy "no longer waiting" on its own.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param id - The id the row's Revert posted.
 * @returns Nothing. A revert changes no published content, so it invalidates
 *   no diary address — only the admin screens that list it, which is the
 *   action's own business.
 * @throws {Error} When the id names nothing this screen can revert, or when
 *   the row has never been published and so has nothing behind it.
 * @throws From Payload, when the write is refused by the access rules.
 * @example
 * await revertChange(payload, scope, 'journey:12')
 */
export const revertChange = async (payload: Payload, scope: AdminScope, id: string): Promise<void> => {
  const parsed = parsedChangeId(id)
  if (parsed === null) throw new Error(`revertChange: ${id} names nothing this screen can revert`)

  const newest = await newestPublishedVersion(payload, scope, COLLECTION[parsed.kind], parsed.row)
  if (newest === undefined) {
    throw new Error(`revertChange: ${id} has never been published, so there is nothing behind it to go back to`)
  }

  await payload.restoreVersion({ collection: COLLECTION[parsed.kind], id: String(newest.id), ...scope })
}

/**
 * Puts an older edition of a journey back on the page a reader is looking at.
 *
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param edition - The version's row id, as `readEditions` gave it.
 * @returns Every diary path the restore invalidated.
 * @throws {Error} When the id names no version of a journey.
 * @throws From Payload, when the write is refused by the access rules.
 * @example
 * for (const path of await restoreEdition(payload, scope, '904')) revalidatePath(path)
 */
export const restoreEdition = async (
  payload: Payload,
  scope: AdminScope,
  edition: string,
): Promise<readonly string[]> => {
  // THE VERSION IS READ BEFORE IT IS RESTORED, because the restore's own
  // answer carries the document rather than the journey this screen has to
  // name a path for — and because a bad id must refuse before it writes.
  const version = await payload
    .findVersionByID({ collection: 'journeys', id: edition, ...scope, depth: 0 })
    .catch(() => null)
  if (version === null) throw new Error(`restoreEdition: ${edition} names no edition of this book`)

  // `parent` is `string | number` in Payload's types because a Mongo adapter
  // mints string ids; this repository is Postgres-only, and `String` is total
  // either way.
  const parent = Number(version.parent)
  const branded = journeyId(String(parent))
  /* c8 ignore next -- `journeyId` refuses only the empty string and this id came from Postgres; guarded rather than asserted, because CLAUDE.md §0.8 bans the `!`. */
  if (!branded.ok) throw new Error(`restoreEdition: ${edition} names no journey`)

  // THE LIVE EDITION IS REFUSED, and this is the write half of a pair.
  // `restoreVersion` makes the restored version the LATEST one, so restoring
  // the version a reader is already served changes nothing they can see and
  // silently takes the author's pending draft off the Changes card.
  // `EditionsCard.tsx` disables that row's control; this refuses the `POST`
  // that reaches past it, exactly as `revertChange` refuses a row with nothing
  // behind it. Review F1 is what this pair closes.
  const newest = await newestPublishedVersion(payload, scope, 'journeys', parent)
  if (newest !== undefined && String(newest.id) === edition) {
    throw new Error(`restoreEdition: ${edition} is the edition readers are already being served`)
  }

  const change: PendingChange = {
    id: changeId('journey', parent),
    kind: 'journey',
    // A SYNTHETIC ROW, built only so `affectedPaths` can be asked about it —
    // it is never drawn, so the tone is the one a restored journey would have
    // on the card: the book already holds it.
    tone: 'edited',
    journey: branded.value,
    slug: version.version.slug,
    text: `${version.version.name} restored`,
    location: `${version.version.name} · journey`,
    at: version.updatedAt,
  }
  const paths = affectedPaths([change], await readBookBundle())

  await payload.restoreVersion({ collection: 'journeys', id: edition, ...scope })

  return paths
}
