/**
 * journeyMutations — what SCREENS.md §2.2's four row actions actually do to
 * the database, and the Zod parses that stand between a `POST` and them.
 *
 * ═══ WHY THE DECISIONS ARE HERE AND NOT IN `actions.ts` ═══
 *
 * A Server Action is dispatched by Next.js under an opaque action id and needs
 * a request context no Vitest project has, so a `'use server'` module carries a
 * whole-file `c8 ignore` in this repository
 * (`app/(admin)/admin/media/actions.ts` is the worked example). Anything
 * DECIDED there is therefore decided where nothing measures it. So the actions
 * module is the guard and the wiring, and everything with a branch in it — the
 * parses, the slug that must not collide, the three pages a new journey gets,
 * the copy that must be a draft, the soft delete — lives here, behind a
 * `Payload` parameter, and is executed by
 * `journeyMutations.integration.test.ts`.
 *
 * ═══ ZOD PARSES `FormData`, BECAUSE `FormData` IS WHAT ARRIVES ═══
 *
 * Every caller is a `<form action={…}>`, so the untrusted value is a form body
 * and not an object. Parsing the object a test would have found convenient
 * would be validating a shape no client produces. `z.coerce.number()` on the
 * row reference is what keeps `Number('nonsense')` from reaching the driver as
 * `NaN`, which is the same reasoning `accountRowId` carries in the domain.
 *
 * ═══ WHAT A NON-DRAFT UPDATE COSTS, MEASURED ═══
 *
 * Archiving and trashing write the MAIN row, because the list reads the main
 * row — and Payload merges such a write into the NEWEST VERSION, which for a
 * journey in the `edited` state is the author's unpublished rewrite. This block
 * used to say the cost was that the journey "stops reporting `edited`". That
 * was the smaller half. The larger half is that the rewrite was written into
 * the main row and the journey left the public book, and the fix is
 * {@link writeJourneyFlag} below — read its header before changing either flag
 * write.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — the collection's shape stops here,
 * and the screen's actions speak in journeys and row ids. DTO for
 * {@link NewJourney}, which is the panel's three fields and not a journey row.
 *
 * ═══ EXACTLY ONE EXPORT HERE DESTROYS ANYTHING, AND IT IS NAMED ═══
 *
 * This header said "nothing here calls `payload.delete` on a journey" for
 * three tasks, and SCREENS.md §2.10's "Delete for good" is the button that
 * makes it false. {@link deleteJourneyForGood} is the only hard delete in
 * Phase 4. Everything else is still a `deletedAt` (CLAUDE.md §7), and
 * {@link softDeleteJourney} and {@link restoreJourney} are the two halves of
 * it.
 *
 * WHAT "FOR GOOD" REACHES, decided here rather than left as a word. A journey
 * is not a row, it is a row and everything keyed to it, and two of those
 * things can be pointed at from OUTSIDE the journey. So the order is:
 *
 *   1. The journey's own `pages`. Explicitly, because the constraint does NOT
 *      do it: `pages_journey_id_journeys_id_fk` is `ON DELETE SET NULL`
 *      (`confdeltype = 'n'`, read out of `pg_constraint`), so deleting the
 *      journey alone would leave every page of it in the table with a null
 *      owner — orphan rows that violate the collection's own `required` and
 *      that no screen in this repository can reach or remove.
 *   2. The journey's own `media`. Explicitly, for the same reason and one
 *      more: `media.journey` is a single `relationship`, not `hasMany`
 *      (`apps/web/collections/media.ts`), so a photograph belongs to exactly
 *      one journey and cross-journey SHARING is not the hazard — but the
 *      constraint is `SET NULL` here too. Deleting them is what makes §2.9's
 *      "Space used" able to go DOWN, which is the only way an author ever
 *      reclaims space: nothing else in this repository removes a `media` row.
 *   3. The journey.
 *
 * WHAT CLEARS THE REFERENCES TO THOSE PHOTOGRAPHS IS POSTGRES, NOT THIS
 * FUNCTION, and that sentence is a measurement. This schema allows exactly two
 * references from outside a journey — `pages.slots[].media`, an upload
 * relationship with no journey constraint of its own, and `about.portrait` —
 * and a hard delete that left either would leave a book slot or an About mount
 * pointing at a row that is gone. Task 7 spent a step making that SURVIVABLE
 * rather than impossible, which is precisely why it must not be shipped on
 * purpose. This function was written to clear both; BOTH MUTATIONS THAT
 * DELETED THAT CODE LEFT THE CASES GREEN, because
 * `pages_slots_media_id_media_id_fk` and `about_portrait_id_media_id_fk` are
 * both `ON DELETE SET NULL`. So the code is gone and the cases are not:
 * `clears the slot a deleted photograph was in` and `clears the About portrait
 * when it was one of the deleted photographs` assert the property against the
 * database that actually keeps it.
 *
 * THE SAME MEASUREMENT IS WHY THE PAGES ARE STILL DELETED HERE. A mutation
 * that removed that statement ALSO left its case green — and that was the
 * case's defect, not the statement's: it counted pages `where journey equals
 * <id>`, which a `SET NULL` satisfies by orphaning them rather than removing
 * them. The case now holds the page row ids and asks for those.
 *
 * IT REFUSES A JOURNEY THAT IS NOT IN THE TRASH. The only route to it is
 * §2.10, which lists nothing else, so a request naming a live journey is a
 * stale page, a typed id or a replayed POST — and none of those may destroy
 * one. `docs/deviations.md` §102 carries the decision and what it costs.
 *
 * INVARIANT — the trash is a `deletedAt`, and the one function that deletes a
 * journey row refuses to run on a journey that is not in it.
 * Depends on: zod, `payload` (types), `AdminScope` (./adminScope).
 */
import type { Payload } from 'payload'
import { z } from 'zod'
import type { AdminScope } from './adminScope'

/** The three fields SCREENS.md §2.2's create panel collects. */
export interface NewJourney {
  /** Where the journey went — the panel's "Where", the row's Caveat 30px line. */
  readonly name: string
  /** The country — the panel's "Country", the row's Garamond italic line. */
  readonly place: string
  /** Free text, as the author types it: "28 Oct – 6 Nov 2026". */
  readonly dates: string
}

/**
 * What the create panel's three inputs must amount to.
 *
 * EACH REFUSAL CARRIES A SENTENCE AN AUTHOR CAN READ, because since
 * `docs/deviations.md` §104 it is drawn on the screen rather than thrown. Zod's
 * own wording for `min(1)` is "Too small: expected string to have >=1
 * characters", which names the schema's constraint and not the author's
 * mistake.
 *
 * AND IT IS REACHABLE, which is why these three are not left to the browser:
 * all three boxes are `required`, and `required` is satisfied by a box holding
 * three spaces while `trim().min(1)` is not. A browser measured that answering
 * HTTP 500.
 */
const NEW_JOURNEY = z.object({
  name: z.string().trim().min(1, 'where the journey went cannot be blank'),
  place: z.string().trim().min(1, 'the country cannot be blank'),
  dates: z.string().trim().min(1, 'the dates cannot be blank'),
})

/**
 * What every row-action form carries.
 *
 * `z.coerce.number()` and then `int().positive()`: a row id is a positive
 * integer, and `'nonsense'` coerces to `NaN`, which `int()` refuses. Without
 * this the value reaches Postgres as `NaN` and escapes as a raw `Failed query`.
 */
const JOURNEY_REF = z.object({ journey: z.coerce.number().int().positive() })

/**
 * The three pages a new journey is created with.
 *
 * The create panel says so out loud — "three pages are created — notes, then
 * two of frames" — and this is the half of that sentence a test can check.
 * The titles and layouts are `apps/web/scripts/seed.ts`'s, which are
 * SCREENS.md §1.3–§1.5's own: Notes is a text spread, Frames I is three up and
 * Frames II is four up.
 */
export const NEW_JOURNEY_PAGES: readonly {
  readonly title: string
  readonly kind: 'notes' | 'frames'
  readonly layout: 'three-up' | 'four-up' | 'full-bleed' | 'text-spread'
}[] = [
  { title: 'Notes', kind: 'notes', layout: 'text-spread' },
  { title: 'Frames I', kind: 'frames', layout: 'three-up' },
  { title: 'Frames II', kind: 'frames', layout: 'four-up' },
]

/**
 * The create panel's three fields, or a throw.
 *
 * @param form - The body the browser posted.
 * @returns The parsed fields, trimmed.
 * @throws {z.ZodError} When any field is missing, empty or not a string — which
 *   is a request nobody's browser sent, so there is no screen state for it.
 * @example
 * readNewJourney(form) // { name: 'Kyoto', place: 'Japan', dates: '…' }
 */
export const readNewJourney = (form: FormData): NewJourney => NEW_JOURNEY.parse(Object.fromEntries(form))

/**
 * The journey a row action was submitted for.
 *
 * @param form - The body the browser posted.
 * @returns The journey's row id.
 * @throws {z.ZodError} When the field is absent or is not a positive integer.
 * @example
 * readJourneyRef(form) // 42
 */
export const readJourneyRef = (form: FormData): number => JOURNEY_REF.parse(Object.fromEntries(form)).journey

/**
 * A slug from a journey's name: lowercase, words joined by hyphens.
 * @param name - What the author typed.
 * @returns The slug stem, which may be empty for a name of pure punctuation.
 */
const slugStem = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * A slug no journey already holds.
 *
 * ONE QUERY, NOT ONE PER CANDIDATE. `slug` is `unique: true` on the collection,
 * so a second "Kyoto" would be refused by the index rather than renamed — and
 * asking the database once per candidate would be an N+1 in the shape of a
 * loop. Every slug that starts with the stem is fetched once and the first free
 * suffix is chosen in memory.
 *
 * `journey` FALLS BACK TO A TIMESTAMP for a name with no letters or digits in
 * it at all, which is the one case {@link slugStem} can answer with the empty
 * string. An empty stem would otherwise make every such journey collide with
 * every other.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param name - The journey's name.
 * @returns A slug that is free at the moment it is read.
 */
const freeSlug = async (payload: Payload, scope: AdminScope, name: string): Promise<string> => {
  const stem = slugStem(name) === '' ? `journey-${String(Date.now())}` : slugStem(name)
  const taken = await payload.find({
    collection: 'journeys',
    ...scope,
    depth: 0,
    pagination: false,
    select: { slug: true },
    where: { slug: { like: stem } },
  })
  const used = new Set(taken.docs.map((journey) => journey.slug))

  // A loop rather than a list of candidates with a fallback: the set of taken
  // slugs is finite, so the loop always ends, and there is no unreachable arm
  // to leave a branch nothing can cover.
  let candidate = stem
  let suffix = 2
  while (used.has(candidate)) {
    candidate = `${stem}-${String(suffix)}`
    suffix += 1
  }
  return candidate
}

/**
 * A field's value, or `null`.
 *
 * NOT DEFENSIVENESS — A TYPE OBLIGATION. `exactOptionalPropertyTypes` refuses
 * an explicit `undefined` where Payload's generated `data` type says
 * `string | null`, so every optional field a copy carries over has to be
 * narrowed. Written once rather than at each field: eleven `?? null`s are
 * eleven branches, most of which no fixture can take because Payload fills the
 * field's default, and one helper is two branches that the copy cases take both
 * of (a journey with its furniture filled in, and one without).
 * @param value - What the source row held.
 * @returns The value, or `null` where there was none.
 */
const orNull = <Value>(value: Value | null | undefined): Value | null => value ?? null

/**
 * An array field's rows.
 *
 * Payload answers `[]` for an array field with no rows rather than `null`, so
 * the fallback below is unreachable against today's collections — it is written
 * rather than cast because the generated type allows `null` and a future
 * `select` or `depth` could produce one, and it carries the `c8 ignore`
 * CLAUDE.md §2.1 asks for in place of a branch nothing can cover.
 * @param value - The array field as the source row held it.
 * @returns Its rows.
 */
const rowsOf = <Value>(value: readonly Value[] | null | undefined): readonly Value[] =>
  /* c8 ignore next -- see above: Payload answers `[]`, never null or undefined */
  value ?? []

/**
 * Creates a journey and the three pages it opens onto.
 *
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}, spread into every write.
 * @param input - See {@link NewJourney}.
 * @returns The new journey's row id.
 * @throws From Payload, when a write is refused by the access rules the scope
 *   switches on.
 * @example
 * await createJourneyRow(payload, scope, { name: 'Kyoto', place: 'Japan', dates: 'a week' })
 */
export const createJourneyRow = async (payload: Payload, scope: AdminScope, input: NewJourney): Promise<number> => {
  const created = await payload.create({
    collection: 'journeys',
    ...scope,
    // A NEW JOURNEY IS A DRAFT, which is what the panel's own line promises:
    // "Starts as a draft — no bookmark until you publish."
    draft: true,
    data: { ...input, slug: await freeSlug(payload, scope, input.name), archived: false },
  })

  await Promise.all(
    NEW_JOURNEY_PAGES.map((page, order) =>
      payload.create({
        collection: 'pages',
        ...scope,
        draft: true,
        data: { journey: created.id, kind: page.kind, title: page.title, layout: page.layout, order },
      }),
    ),
  )

  return created.id
}

/**
 * Copies a journey and its pages, always as drafts.
 *
 * TWO QUERIES FOR THE PAGES, NOT ONE PER PAGE ON THE READ SIDE: they are
 * fetched in one `find` and then created, which is as few writes as there are
 * pages — a copy has to write each row it copies.
 *
 * THE COPY IS A DRAFT EVEN WHEN THE SOURCE IS PUBLISHED. A duplicate that went
 * out the moment it was made would publish an unedited copy of somebody's
 * journey, with "(copy)" in the book's own contents.
 *
 * ═══ FOUR COLUMNS ARE DELIBERATELY NOT CARRIED, AND NOTHING ELSE IS ═══
 *
 * `name` becomes "<name> (copy)"; `slug` is unique on the collection, so the
 * copy takes a free one; `archived` and `deletedAt` are reset, because a copy
 * starts off the shelf and out of the trash whatever the source was in. Every
 * other column the collection declares is carried — which used to be true of
 * all but `order` and `hiddenFromBookmarks`, silently, so an author who had
 * kept a journey out of the book's bookmarks got a duplicate that was in them
 * (review round 1, finding 3).
 *
 * THE LIST IS JUDGED BY INVERSION rather than by cases that each name the
 * fields they check, which is what let those two hide:
 * `journeyMutations.integration.test.ts` reads the field names off
 * `apps/web/collections/journeys.ts` itself, subtracts the four above by name
 * and with their reasons, and requires everything left to match — so a field a
 * later task adds fails there until somebody decides about it.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param journey - The row id to copy.
 * @returns The new journey's row id.
 * @throws From Payload, when the id names no row or a write is refused.
 * @example
 * await duplicateJourneyRow(payload, scope, 42)
 */
export const duplicateJourneyRow = async (payload: Payload, scope: AdminScope, journey: number): Promise<number> => {
  const source = await payload.findByID({ collection: 'journeys', id: journey, ...scope, depth: 0 })
  const name = `${source.name} (copy)`

  const created = await payload.create({
    collection: 'journeys',
    ...scope,
    draft: true,
    data: {
      name,
      place: source.place,
      dates: source.dates,
      slug: await freeSlug(payload, scope, name),
      archived: false,
      order: orNull(source.order),
      hiddenFromBookmarks: orNull(source.hiddenFromBookmarks),
      startsOn: orNull(source.startsOn),
      weather: orNull(source.weather),
      mood: orNull(source.mood),
      weatherGlyph: orNull(source.weatherGlyph),
      // Payload fills a group field with its own defaults, so `furniture` is
      // always an object here and the fallback is unreachable — the same type
      // obligation `orNull` carries, for a shape `orNull` cannot express. It is
      // the ONE branch this module's suite cannot take, which is why
      // `vitest.integration.config.ts` gates it at the measured 95 rather than
      // at 100. A `c8 ignore` was tried first and does not suppress a branch
      // the v8 provider counts inside an object literal.
      furniture: source.furniture ?? {},
      // THE ARRAY ROW IDS ARE STRIPPED, on both of these and on a page's
      // `slots` below. Payload gives every array row an `id` of its own, and
      // handing the SOURCE's ids to a create asks it to insert rows that
      // already exist — measured, and it fails as `The following field is
      // invalid: id` rather than as anything that names the array.
      highlights: rowsOf(source.highlights).map((highlight) => ({ text: highlight.text })),
      note: orNull(source.note),
      tally: rowsOf(source.tally).map((entry) => ({ key: orNull(entry.key), value: orNull(entry.value) })),
    },
  })

  const pages = await payload.find({
    collection: 'pages',
    ...scope,
    depth: 0,
    pagination: false,
    sort: 'order',
    where: { journey: { equals: journey } },
  })

  await Promise.all(
    pages.docs.map((page) =>
      payload.create({
        collection: 'pages',
        ...scope,
        draft: true,
        data: {
          journey: created.id,
          kind: page.kind,
          title: orNull(page.title),
          order: page.order,
          layout: orNull(page.layout),
          // The array's own row ids belong to the SOURCE page; carrying them
          // over would ask Payload to create rows that already exist.
          slots: rowsOf(page.slots).map((slot) => ({
            role: orNull(slot.role),
            media: orNull(slot.media),
            caption: orNull(slot.caption),
            alt: orNull(slot.alt),
            focalX: orNull(slot.focalX),
            focalY: orNull(slot.focalY),
          })),
        },
      }),
    ),
  )

  return created.id
}

/**
 * Writes one operational flag to a journey without publishing anything.
 *
 * ═══ WHY THIS IS TWO WRITES AND NOT ONE `payload.update` ═══
 *
 * `archived` and `deletedAt` are shelf and bin markers, not content — but they
 * live on a collection with `versions.drafts` on, and Payload's `update` does
 * not offer a way to say so. `updateByID` fetches the document to merge into
 * with `getLatestCollectionVersion`, which is passed no `published` flag, so it
 * always returns the NEWEST VERSION; `updateDocument` then writes that merge to
 * the main row whenever `draft` is not set. For a journey in the `edited` state
 * the newest version is the author's unpublished rewrite, so a one-line
 * `payload.update({ data: { archived: true } })` wrote that rewrite into the
 * main row and stamped it `_status: 'draft'`.
 *
 * MEASURED, AND IT IS WHAT A READER WOULD HAVE SEEN: one press of Archive took
 * a published journey out of the public book — `readBookBundle.ts` selects
 * `_status: { equals: 'published' }` — and left the only way back through a
 * Publish of the half-finished text. `softDeleteJourney` was the same two
 * lines, so the §2.10 trash round trip did it too (fix round 2, finding 1).
 *
 * ═══ WHAT THE TWO WRITES ARE ═══
 *
 * FIRST, the main row is written from ITS OWN content plus the flag, so the
 * merge above has nothing of the draft's left to win with and `_status` stays
 * where it was. SECOND, when the newest version is a draft, that draft is saved
 * again with the flag on it — because the first write made a non-draft version
 * the latest one, and `@payloadcms/drizzle`'s `createVersion` clears `latest`
 * on every other row, which would have left the screen reporting `published`
 * for a journey with a rewrite still waiting.
 *
 * THE SECOND WRITE IS CONDITIONED ON THE NEWEST VERSION BEING A DRAFT, not on
 * the main row being published, and that matters for the journey that has never
 * gone out: nothing writes ITS main row either, so its newest draft is the only
 * copy of every edit since it was created, and a first write that made the
 * stale main row the newest version would throw all of them away.
 *
 * THE COST, stated rather than hidden: two version rows per flag write instead
 * of one, and one of them is a republish of what was already published. A
 * journey with no pending draft pays one extra read and nothing else.
 *
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param journey - The row id.
 * @param flag - The one column being written.
 * @throws From Payload, when the id names no row or a write is refused.
 */
const writeJourneyFlag = async (
  payload: Payload,
  scope: AdminScope,
  journey: number,
  flag: { readonly archived: boolean } | { readonly deletedAt: string | null },
): Promise<void> => {
  const [live, newest] = await Promise.all([
    payload.findByID({ collection: 'journeys', id: journey, ...scope, depth: 0 }),
    payload.findByID({ collection: 'journeys', id: journey, ...scope, depth: 0, draft: true }),
  ])

  await payload.update({ collection: 'journeys', id: journey, ...scope, data: { ...live, ...flag } })

  if (newest._status === 'draft') {
    await payload.update({
      collection: 'journeys',
      id: journey,
      ...scope,
      draft: true,
      data: { ...newest, ...flag },
    })
  }
}

/**
 * Puts a journey on the archive shelf, or takes it off.
 *
 * ONE BUTTON, SO IT READS BEFORE IT WRITES. SCREENS.md §2.2's strip prints
 * Archive or Unarchive from the row's own state, and the action it posts is the
 * same one either way.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param journey - The row id.
 * @throws From Payload, when the id names no row or the write is refused.
 * @example
 * await toggleJourneyArchived(payload, scope, 42)
 */
export const toggleJourneyArchived = async (payload: Payload, scope: AdminScope, journey: number): Promise<void> => {
  const row = await payload.findByID({ collection: 'journeys', id: journey, ...scope, depth: 0 })
  await writeJourneyFlag(payload, scope, journey, { archived: row.archived !== true })
}

/**
 * Moves a journey to the trash.
 *
 * A `deletedAt`, NEVER `payload.delete` (CLAUDE.md §7). SCREENS.md §2.10 keeps
 * the trash for thirty days with a restore, so the row has to survive; the
 * pages are left exactly where they are, because a restore returns a journey
 * whole rather than an empty one.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param journey - The row id.
 * @throws From Payload, when the id names no row or the write is refused.
 * @example
 * await softDeleteJourney(payload, scope, 42)
 */
export const softDeleteJourney = async (payload: Payload, scope: AdminScope, journey: number): Promise<void> => {
  await writeJourneyFlag(payload, scope, journey, { deletedAt: new Date().toISOString() })
}

/**
 * Takes a journey back out of the trash.
 *
 * THROUGH {@link writeJourneyFlag}, NOT A BARE `payload.update`, and that is
 * the whole reason this is one line here rather than one line in the action:
 * `journeys` carries `versions.drafts`, so an update that does not say
 * otherwise merges from the NEWEST version and writes it to the main row — a
 * journey with an unpublished rewrite would come back with that rewrite
 * published over its live content. Fix round 2 found exactly that on
 * `archived`; `restoreJourney` is the same write on the same column and gets
 * the same treatment.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param journey - The row id.
 * @throws From Payload, when the id names no row or the write is refused.
 * @example
 * await restoreJourney(payload, scope, 42)
 */
export const restoreJourney = async (payload: Payload, scope: AdminScope, journey: number): Promise<void> => {
  await writeJourneyFlag(payload, scope, journey, { deletedAt: null })
}

/**
 * Removes a trashed journey, its pages and its photographs, for good.
 *
 * The only hard delete in Phase 4. See this module's header for what it
 * reaches and in what order, and `docs/deviations.md` §102 for the decision.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param journey - The row id, which must already be in the trash.
 * @throws When the journey is not in the trash — before anything is deleted —
 *   and from Payload when a read or a write is refused.
 * @example
 * await deleteJourneyForGood(payload, scope, 42)
 */
export const deleteJourneyForGood = async (payload: Payload, scope: AdminScope, journey: number): Promise<void> => {
  const row = await payload.findByID({ collection: 'journeys', id: journey, ...scope, depth: 0 })
  // BEFORE ANYTHING IS DELETED. A refusal after the pages have gone would be
  // a refusal that had already destroyed something.
  if (row.deletedAt === null || row.deletedAt === undefined) {
    throw new Error('a journey is only deleted for good from the trash, and this one is not in it')
  }

  // THE ORDER IS LOAD-BEARING, and it is the same reason twice: every one of
  // these foreign keys is `ON DELETE SET NULL`, so deleting the journey first
  // would null each row's owner and leave both `where` clauses matching
  // nothing — an orphan library, orphan pages, and a storage bar that never
  // goes down. See this module's header for the two statements that were
  // written here, measured, and removed because Postgres already did them.
  await payload.delete({ collection: 'pages', ...scope, where: { journey: { equals: journey } } })
  await payload.delete({ collection: 'media', ...scope, where: { journey: { equals: journey } } })
  await payload.delete({ collection: 'journeys', ...scope, id: journey })
}
