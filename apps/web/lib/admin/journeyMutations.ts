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
 * row. Payload's `update` without `draft: true` also saves a version, and
 * `@payloadcms/drizzle`'s `createVersion` clears `latest` on every other
 * version of that document — so a journey that had unpublished edits waiting
 * stops reporting `edited` once it is archived. That is Payload's versioning,
 * not a choice here, and the alternative is worse: a `draft: true` write would
 * leave `archived` in a version the screen never reads, so the button would do
 * nothing visible. `journeyMutations.integration.test.ts` records the
 * behaviour; SCREENS.md §2.8's Publish screen is where it is owned.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — the collection's shape stops here,
 * and the screen's actions speak in journeys and row ids. DTO for
 * {@link NewJourney}, which is the panel's three fields and not a journey row.
 *
 * INVARIANT — nothing here calls `payload.delete` on a journey. The trash is a
 * `deletedAt` (CLAUDE.md §7, and `apps/web/collections/journeys.ts` puts the
 * column in the first migration for exactly this).
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

/** What the create panel's three inputs must amount to. */
const NEW_JOURNEY = z.object({
  name: z.string().trim().min(1),
  place: z.string().trim().min(1),
  dates: z.string().trim().min(1),
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
  await payload.update({
    collection: 'journeys',
    id: journey,
    ...scope,
    data: { archived: row.archived !== true },
  })
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
  await payload.update({
    collection: 'journeys',
    id: journey,
    ...scope,
    data: { deletedAt: new Date().toISOString() },
  })
}
