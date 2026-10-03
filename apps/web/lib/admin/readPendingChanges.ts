/**
 * readPendingChanges — the rows SCREENS.md §2.8's Changes card lists, which
 * are also SCREENS.md §2.1's "Waiting to go out" rows: the same data drawn
 * twice, read once.
 *
 * ═══ "WAITING" IS A FACT ABOUT THE VERSIONS TABLE, NOT ABOUT A COLUMN ═══
 *
 * `readJourneysScreen.ts` establishes the mechanism and this module shares it:
 * Payload does not write the main collection row when it saves a draft
 * (`collections/operations/utilities/update.js` guards the `updateOne` with
 * `if (!isSavingDraft)`), so `_status` on the main row is the PUBLISHED state
 * and the newer draft exists only in `_journeys_v` / `_pages_v`, where
 * `@payloadcms/drizzle`'s `createVersion` stamps the new row `latest: true`.
 * So "waiting" is "its latest version is a draft", asked once per collection
 * for every row at once.
 *
 * A journey that has NEVER been published is waiting too, and falls out of the
 * same query rather than needing a second: its only versions are drafts, so
 * its latest one is one.
 *
 * ═══ TWO COLLECTIONS, BECAUSE TWO COLLECTIONS HAVE VERSIONS ═══
 *
 * `DATA_MODEL.md` puts `versions: { drafts: true }` on `journeys` and `pages`
 * and on nothing else. A `media` row, the `book` global, the `about` global
 * and the `site` global are written live — a caption, an upload, a bookmark
 * reorder and a cover title reach a reader the moment they are saved. So this
 * screen lists fewer kinds of thing than the handoff's prototype does, and
 * `docs/deviations.md` §87 records what that costs it. Nothing here invents a
 * pending state for a row that has none.
 *
 * ═══ FOUR QUERIES, NEVER FOUR PER JOURNEY ═══
 *
 * `readJourneysScreen.ts`'s shape: one `find` over the journeys, one
 * `findVersions` over their ids, one `find` over their pages, one
 * `findVersions` over the page ids. {@link QUERIES_PER_READ} is the number,
 * and the integration file pins it from both sides by adding rows and reading
 * again.
 *
 * ARCHIVED JOURNEYS ARE NOT WAITING. `readBookBundle` excludes them, so
 * nothing about an archived journey is between an author and a reader:
 * publishing it would put no page in the book. It is the same "a shelf, not a
 * stage" reading `journeyStatus.ts` already takes, and it is asserted from
 * both sides rather than left to the `where` clause to imply.
 *
 * THE SCOPE IS HANDED IN, NOT FETCHED, for `readNavCounts.ts`'s reason:
 * `adminScope` reads the account's row, so a module that called it per query
 * would be four `users` lookups per request.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — one module owns how "waiting to go
 * out" is fetched, and neither screen sees a Payload document. DTO:
 * `PendingChange` is the card's row, not a version row.
 *
 * INVARIANT — every change this returns names a row whose latest version is a
 * draft, so publishing it always has something to publish, and the id it
 * carries is the one `publishSelection` parses back.
 * Depends on: `PendingChange`/`changeId` (@travel-diary/domain/admin/pendingChange),
 * `journeyId` (@travel-diary/domain/ids), `payload` (types), `AdminScope`
 * (./adminScope).
 */
import {
  changeId,
  type ChangeKind,
  type ChangeTone,
  type PendingChange,
} from '@travel-diary/domain/admin/pendingChange'
import { journeyId } from '@travel-diary/domain/ids'
import type { Payload, Where } from 'payload'
import type { AdminScope } from './adminScope'

/**
 * How many statements one read of this screen costs, whatever the diary holds.
 *
 * Pinned from BOTH sides by `readPendingChanges.integration.test.ts`: the
 * collections asked about, in order, and this number. A per-journey query
 * makes the second reading longer than the first.
 */
export const QUERIES_PER_READ = 4

/**
 * Which journeys can have something waiting: the ones the book would hold if
 * they were published.
 *
 * Not in the trash and not on the shelf — `readBookBundle` applies the same
 * two exclusions plus `_status`, and this query deliberately does NOT apply
 * `_status`, because an unpublished journey is the largest pending change
 * there is.
 */
const WAITABLE = { and: [{ deletedAt: { equals: null } }, { archived: { not_equals: true } }] } satisfies Where

/**
 * The versions query that answers "is this row's newest version a draft".
 * @param parents - The row ids to ask about.
 * @returns The `where` both version queries use.
 */
const latestIsDraft = (parents: readonly number[]): Where => ({
  and: [{ parent: { in: parents } }, { latest: { equals: true } }, { 'version._status': { equals: 'draft' } }],
})

/**
 * How the `{when}` half of a change's second line is written.
 *
 * THE DATE, NOT "2h ago", and that is `readJourneysScreen.ts`'s decision
 * arriving here for its own reason: a relative string is a function of the
 * current instant, this screen is rendered once on the server and never
 * re-rendered, and CLAUDE.md §2.3 requires an injected clock that a repository
 * whose signature the phase fixed has nowhere to take one from.
 * `docs/deviations.md` §54 records it, and §87 records that it applies here.
 */
const WHEN = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * What a `pages` row's relationship holds after a `depth: 0` read.
 *
 * `readJourneysScreen.ts`'s `ownerOf`, for its reason: Payload populates a
 * relationship to the depth of the operation, the TYPE still allows the whole
 * document, and a cast that guessed wrong would key a change to the wrong
 * journey rather than fail.
 * @param journey - The relationship value as Payload returned it.
 * @returns The journey's row id, or `null` when the row belongs to none.
 */
/* c8 ignore next -- the refusing arm is unreachable at `depth: 0`, where Payload hands over a bare id; it exists because the TYPE allows the whole document and a cast that guessed wrong would key a change to the wrong journey rather than fail. */
const ownerOf = (journey: unknown): number | null => (typeof journey === 'number' ? journey : null)

/**
 * A version's own row id, as the string a hidden form field carries back.
 *
 * TAKES `unknown` ON PURPOSE. Payload TYPES `findVersions`' `id` as a string
 * and Postgres HANDS BACK A NUMBER — a failing-run dump showed
 * `{ id: 724, … }`, unquoted — so a `String()` applied to the typed value is a
 * no-op to the compiler and the linter, and the conversion that is actually
 * needed never happens. Widening to `unknown` first is what makes the call
 * real. The mismatch is Payload's; the narrow type is this module's, because
 * {@link Edition.id} is posted and `restoreEdition` compares it as text
 * (review F6).
 * @param id - The version's id, as Payload typed it and Postgres returned it.
 * @returns The same id, as a string.
 */
const versionId = (id: unknown): string => String(id)

/**
 * The row id a version's `parent` names.
 *
 * Payload types `parent` as `string | number`, because a Mongo adapter mints
 * string ids. This repository is Postgres-only (`docs/architecture.md`), so
 * every id here is already a number — and `Number` is TOTAL rather than a
 * narrowing branch, which keeps a arm nothing can take out of the coverage
 * gate (CLAUDE.md §2.1: an unreachable branch is not a decision).
 * @param parent - The version's `parent`, as Payload typed it.
 * @returns The row id.
 */
const parentRow = (parent: string | number): number => Number(parent)

/** One journey, as much of it as a change row needs. */
interface JourneyFacts {
  readonly name: string
  readonly slug: string
}

/**
 * One change with the timestamp it is sorted by still on it.
 *
 * The sort key is carried BESIDE the row rather than looked up by position in
 * a parallel list: two lists zipped by index drift the moment either drops an
 * entry, and both of the builders below can drop one.
 */
interface Stamped {
  readonly change: PendingChange
  readonly at: string
}

/**
 * Builds one row of the Changes card.
 * @param kind - Which collection the row is in.
 * @param row - Its row id.
 * @param facts - Its journey's name and slug.
 * @param journey - Its journey's row id.
 * @param what - The change text, Garamond 17px.
 * @param where - The `{location}` half of the line beneath it.
 * @param at - When the draft was saved, as an ISO string.
 * @returns The change, or `null` when the journey id cannot be branded —
 *   unreachable while Postgres mints integer ids.
 */
const aChange = (
  kind: ChangeKind,
  tone: ChangeTone,
  row: number,
  facts: JourneyFacts,
  journey: number,
  what: string,
  where: string,
  at: string,
): PendingChange | null => {
  const branded = journeyId(String(journey))
  /* c8 ignore next -- `journeyId` refuses only the empty string and this id came from Postgres; a returned `null` rather than the `!` CLAUDE.md §0.8 bans. */
  if (!branded.ok) return null

  return {
    id: changeId(kind, row),
    kind,
    tone,
    journey: branded.value,
    slug: facts.slug,
    text: what,
    location: where,
    at: WHEN.format(new Date(at)),
  }
}

/**
 * Everything waiting to go out, newest first.
 *
 * @param payload - The Local API instance the rows live behind. A parameter so
 *   the query count is observable; see this module's header.
 * @param scope - The hoisted {@link AdminScope}, spread into every query.
 * @returns One {@link PendingChange} per row whose latest version is a draft,
 *   most recently edited first.
 * @throws From Payload, when a read is refused by the access rules the scope
 *   switches on — a bug in the guard that admitted the session, not a state a
 *   card can draw.
 * @example
 * const scope = await adminScope(session)
 * const waiting = await readPendingChanges(await getPayload(), scope)
 */
export const readPendingChanges = async (payload: Payload, scope: AdminScope): Promise<readonly PendingChange[]> => {
  const journeys = await payload.find({
    collection: 'journeys',
    ...scope,
    depth: 0,
    pagination: false,
    sort: 'order',
    select: { name: true, slug: true, _status: true },
    where: WAITABLE,
  })

  const ids = journeys.docs.map((journey) => journey.id)
  // Nothing to ask about, and `{ in: [] }` is three statements Postgres would
  // run for an answer that cannot have rows in it.
  /* c8 ignore next -- a diary with no live journeys at all, which is a fresh install: `diary_test` is shared and seeded, so no integration case can reach this arm without emptying a database other files are reading. `readGalleriesScreen.ts` carries the same arm with the same note. */
  if (ids.length === 0) return []

  const facts = new Map<number, JourneyFacts>(
    journeys.docs.map((journey) => [journey.id, { name: journey.name, slug: journey.slug }]),
  )

  const journeyDrafts = await payload.findVersions({
    collection: 'journeys',
    ...scope,
    depth: 0,
    pagination: false,
    select: { parent: true, updatedAt: true },
    where: latestIsDraft(ids),
  })

  const pages = await payload.find({
    collection: 'pages',
    ...scope,
    depth: 0,
    pagination: false,
    select: { journey: true, title: true, _status: true },
    where: { journey: { in: ids } },
  })

  const pageDrafts = await payload.findVersions({
    collection: 'pages',
    ...scope,
    depth: 0,
    pagination: false,
    select: { parent: true, updatedAt: true },
    where: latestIsDraft(pages.docs.map((page) => page.id)),
  })

  const published = new Set(journeys.docs.flatMap((journey) => (journey._status === 'published' ? [journey.id] : [])))
  const pagesById = new Map(pages.docs.map((page) => [page.id, page]))

  const fromJourneys = journeyDrafts.docs.flatMap((version): readonly Stamped[] => {
    const row = parentRow(version.parent)
    const journey = facts.get(row)
    /* c8 ignore next -- the version query was built from these very journey ids. */
    if (journey === undefined) return []
    // THE TEXT NAMES THE STATE, NOT THE EDIT. Nothing here diffs two versions,
    // so a line claiming WHAT changed would be a line this module invented;
    // `docs/deviations.md` §87 records the gap against the prototype's own
    // "Note rewritten on the Tokyo entry".
    const live = published.has(row)
    const what = live
      ? `${journey.name} has been edited since it was published`
      : `${journey.name} has never been published`
    const built = aChange(
      'journey',
      live ? 'edited' : 'added',
      row,
      journey,
      row,
      what,
      `${journey.name} · journey`,
      version.updatedAt,
    )
    /* c8 ignore next -- the `null` arm is `aChange`'s own unreachable brand refusal, above. */
    return built === null ? [] : [{ change: built, at: version.updatedAt }]
  })

  const fromPages = pageDrafts.docs.flatMap((version): readonly Stamped[] => {
    const row = parentRow(version.parent)
    const page = pagesById.get(row)
    /* c8 ignore next -- the version query was built from these very ids. */
    if (page === undefined) return []
    const owner = ownerOf(page.journey)
    /* c8 ignore next -- `journey` is `required: true` on the collection and every read here is `depth: 0`, so the relationship is always a bare id. */
    if (owner === null) return []
    const journey = facts.get(owner)
    /* c8 ignore next -- the page query was built from these very journey ids. */
    if (journey === undefined) return []
    const title = page.title ?? 'A page'
    const live = page._status === 'published'
    const built = aChange(
      'page',
      live ? 'edited' : 'added',
      row,
      journey,
      owner,
      live ? `${title} has been edited since it was published` : `${title} has never been published`,
      `${journey.name} · ${title}`,
      version.updatedAt,
    )
    /* c8 ignore next -- as above: the `null` arm is `aChange`'s unreachable brand refusal. */
    return built === null ? [] : [{ change: built, at: version.updatedAt }]
  })

  // NEWEST FIRST, because the card is a list of what just happened. Sorted on
  // the version's own `updatedAt`, carried beside each row rather than looked
  // up by position — two lists zipped by index drift the moment either drops
  // an entry.
  return [...fromJourneys, ...fromPages]
    .sort((left, right) => right.at.localeCompare(left.at))
    .map((stamped) => stamped.change)
}

/**
 * How many editions SCREENS.md §2.8's Editions card lists.
 *
 * A CHOSEN CEILING, AND NOTHING DERIVES IT. §2.8 gives no cap and the
 * prototype's fixture holds six. Twelve is this implementation's: it is a
 * scrolling card rather than a history, and an uncapped `findVersions` over a
 * versioned collection grows by one row per save, for ever. Both sides of it
 * are pinned by cases built from this constant, so the boundary follows it
 * wherever it is moved.
 */
export const EDITIONS_SHOWN = 12

/** One row of SCREENS.md §2.8's Editions card. */
export interface Edition {
  /** The version's own row id, which is what a Restore posts. */
  readonly id: string
  /** The timestamp, Courier 10.5px — "26 Aug 2026 · 19:04". */
  readonly at: string
  /** The description, Garamond 16.5px / 1.35. */
  readonly what: string
  /**
   * Whether this is the edition a reader is looking at — which gets the filled
   * mark, and whose Restore is withheld.
   *
   * PER JOURNEY, NOT PER LIST. A reader is served EACH journey's own newest
   * published version, so every journey has exactly one live edition. The
   * first version of this marked `index === 0` over the whole listing, which
   * on a book with ten journeys drew nine current editions as restorable
   * history — and pressing one of those discards that journey's pending draft
   * for a published state that does not change (review F1).
   */
  readonly live: boolean
}

/**
 * How the Editions card writes a timestamp: the prototype's own
 * "26 Aug 2026 · 19:04", which is a date and a wall-clock time rather than a
 * relative string — see {@link WHEN} for why nothing here is relative.
 */
const EDITION_WHEN = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/**
 * The editions SCREENS.md §2.8's third card lists.
 *
 * ═══ AN EDITION HERE IS ONE JOURNEY'S PUBLISH, NOT THE SITE'S ═══
 *
 * The prototype's rows are site-wide snapshots — "Edition 14 — Patagonia
 * gallery recaptioned, cover cloth changed". Nothing in this data model
 * records one: `DATA_MODEL.md` versions `journeys` and `pages` per row and
 * keeps no publish log, so an "Edition 14" would be a number this repository
 * invented and a description nothing could derive. What IS recorded is every
 * published version of every journey, which is what this lists, newest first.
 * `docs/deviations.md` §87 records the difference and what it costs the card.
 *
 * ONE QUERY, and it selects the journey's own name off the version row rather
 * than joining back to the collection — `readJourneysScreen.ts`'s note that a
 * version query can select `version: { … }` for no extra query, spent here.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @returns At most {@link EDITIONS_SHOWN} editions, newest first. **The first
 *   of EACH `parent` is the live one**, not the first of the list — a reader is
 *   served each journey's own newest published version, so a book of ten
 *   journeys has ten live editions in this list. {@link Edition.live} is the
 *   field that says which; nothing downstream may infer it from position. An
 *   empty diary has none.
 * @throws From Payload, when the read is refused by the access rules.
 * @example
 * const editions = await readEditions(await getPayload(), scope)
 */
export const readEditions = async (payload: Payload, scope: AdminScope): Promise<readonly Edition[]> => {
  const published = await payload.findVersions({
    collection: 'journeys',
    ...scope,
    depth: 0,
    limit: EDITIONS_SHOWN,
    sort: '-updatedAt',
    select: { parent: true, updatedAt: true, version: { name: true } },
    where: { 'version._status': { equals: 'published' } },
  })

  // THE FIRST ROW OF EACH JOURNEY IS THAT JOURNEY'S LIVE ONE, because the list
  // is sorted newest first and a reader is served each journey's own newest
  // published version. Not the first row of the LIST: that marks one edition
  // live for the whole book and lies about every other journey — see
  // {@link Edition.live}.
  const seen = new Set<number>()

  return published.docs.map((version) => {
    const parent = parentRow(version.parent)
    const live = !seen.has(parent)
    seen.add(parent)

    return {
      // The version's own row id — see `versionId` for why the conversion is
      // not the no-op the types make it look like.
      id: versionId(version.id),
      at: EDITION_WHEN.format(new Date(version.updatedAt)).replace(', ', ' · '),
      what: `${version.version.name} published`,
      live,
    }
  })
}
