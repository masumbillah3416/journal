/**
 * exportEverything — SCREENS.md §2.9's "Export everything", which
 * `SECURITY.md` closes by asking for it by name: *"The design's 'Export
 * everything' is a genuine feature, not a nicety — wire it up"*, under the
 * heading "The thing most likely to actually hurt you".
 *
 * ═══ WHAT IS IN IT, AND WHAT IS NOT ═══
 *
 * Every row of every collection this repository calls CONTENT, every global,
 * and a manifest of the media library — each file's key, size and hash. **Not
 * the photographs themselves.** The bucket is backed up by the bucket's own
 * versioning (`docs/runbook.md`), and a serverless function cannot stream
 * 40GB in a request; an "Export everything" that quietly excluded the
 * photographs would be worse than one that says what it holds, so the dump
 * says so in a field of its own and `docs/runbook.md` repeats it.
 *
 * ═══ EVERY COLLECTION IS CLASSIFIED, OR THE EXPORT REFUSES ═══
 *
 * This is the part that is about `users`, `sessions`, `otpChallenges` and
 * `signInAttempts`. A dump enumerated from the Payload config — which is the
 * right anti-drift shape, because a collection added later is exported the day
 * it lands — picks those four up without anybody choosing it, and they hold
 * password hashes, session identifiers, one-time-code hashes and the IP
 * addresses of every sign-in attempt. `SECURITY.md` calls Export "the thing
 * most likely to actually hurt you"; it means losing the data, and a dump that
 * leaks credentials hurts differently.
 *
 * So every collection and every global the config declares must appear in
 * {@link CONTENT} or {@link WITHHELD}, and one that appears in neither makes
 * this function THROW naming it (standing orders, species 6: refuse what you
 * do not recognise rather than recognising what to refuse). A collection added
 * later is therefore refused until somebody has decided which it is — which is
 * a broken export for one commit, and is the direction that fails safely.
 *
 * ═══ AND EVERY FIELD, WHICH IS WHERE THIS GUARD WAS ONE LEVEL TOO COARSE ═══
 *
 * The first version of this classified COLLECTIONS and never FIELDS, and the
 * review measured what that costs: a `webhookSecret` column added to
 * `journeys` and set to `sk-live-…` on every row **reached the dump with all
 * twelve cases green**. A collection is not a unit of sensitivity — a
 * credential arrives as a field on a collection somebody already decided was
 * content.
 *
 * So {@link EXPORTED_FIELDS} names every field path the dump may carry, and a
 * path the config declares that appears in neither it nor
 * {@link WITHHELD_FIELDS} makes this function THROW naming it. A field added
 * later is refused until somebody has decided which it is, exactly as a
 * collection is.
 *
 * THE GLOBALS GET THE SAME MECHANISM RATHER THAN A `WITHHELD` LIST OF THEIR
 * OWN, and that is deliberate: the scenario `docs/deviations.md` §100 names as
 * the thing that would reverse its no-challenge decision is **a book password
 * on the `site` global** — a FIELD on a global that is otherwise entirely
 * content. Withholding whole globals could not express that; withholding a
 * field can.
 *
 * THAT INCLUDES PAYLOAD'S OWN FOUR. `buildConfig` injects `payload-kv`,
 * `payload-locked-documents`, `payload-preferences` and `payload-migrations`,
 * so the enumeration finds collections `apps/web/payload.config.ts` does not
 * declare — and a Payload upgrade that adds a fifth breaks this export until
 * somebody classifies it. That is a real maintenance cost, accepted: the
 * alternative is a rule that silently exports whatever a dependency decides to
 * add to the database.
 *
 * ═══ IT IS JSON, NOT A ZIP ═══
 *
 * The brief asked for a ZIP. This repository has no archive library, and
 * hand-rolling the container format would add code whose only possible test is
 * a parse of its own output — the two agreeing while both are wrong is the
 * fixture defect this phase has watched. What the feature is FOR is the data,
 * and one JSON document holds all of it, is readable by anything, and is
 * verifiable field by field. `docs/deviations.md` §103 records it and what
 * would reverse it.
 *
 * PATTERNS (CLAUDE.md §3.3): DTO — {@link DiaryExport} is a document, not a
 * set of rows, and nothing downstream sees a Payload query.
 *
 * INVARIANT — no `WITHHELD` collection's rows appear anywhere in the output,
 * and every collection the config declares is in exactly one of the two lists.
 * `exportEverything.integration.test.ts` asserts both, and asserts that a real
 * account's stored hash and salt are absent from the serialised bytes.
 * Depends on: `payload` (types), `config` (../payload), `AdminScope`
 * (./adminScope).
 */
import type { Payload } from 'payload'
import type { AdminScope } from './adminScope'

/**
 * The collections whose rows are the author's own content, and go out whole.
 *
 * Nothing in these holds a credential: `media` is files and captions,
 * `journeys` and `pages` are what a reader can already see or is about to.
 */
export const CONTENT: readonly string[] = ['media', 'journeys', 'pages']

/**
 * The collections that never leave this database, each with the reason.
 *
 * `jobs` is here for a different reason from the other three: it holds no
 * secret, but it is a QUEUE — a record of work in flight against a store and a
 * pipeline — and restoring one into a different database would re-run work
 * against rows that may not be there. It is machinery, not content.
 */
export const WITHHELD: Readonly<Record<string, string>> = {
  users: 'password hashes, salts, reset tokens and lockout state',
  sessions: 'the stored form of every live session identifier',
  otpChallenges: 'the hashed form of every one-time code still in its window',
  signInAttempts: 'the IP address of every sign-in attempt, which is the only PII here',
  jobs: 'a queue of work in flight, which is machinery rather than content',
  // PAYLOAD'S OWN FOUR, which `buildConfig` injects rather than
  // `payload.config.ts` declaring them — so they are classified here and not
  // there. None is content, and a restore builds its own.
  'payload-kv': 'Payload’s internal key-value cache, rebuilt on demand',
  'payload-locked-documents': 'which documents an editor has open right now, which is true for minutes',
  'payload-preferences': 'each account’s own admin-UI preferences, which belong to an account this dump withholds',
  'payload-migrations': 'the ledger of which migrations have run against THIS database, which a restore rebuilds',
}

/** The globals that go out. All three are content; none holds a credential. */
export const GLOBALS: readonly string[] = ['book', 'about', 'site']

/**
 * The row keys Payload owns, which no `fields` list declares and which every
 * dump carries.
 *
 * `id` is the row's identity and a restore needs it to re-point a
 * relationship; `globalType` is how Payload labels a global's row. Both are
 * bookkeeping rather than content, and both are exported because a dump
 * without them is not restorable. `createdAt`, `updatedAt` and `_status` ARE
 * declared fields and are classified below with the rest.
 */
export const ALWAYS_EXPORTED: readonly string[] = ['id', 'globalType']

/**
 * Every field path each exported collection and global may carry.
 *
 * WRITTEN OUT RATHER THAN DERIVED, and that is the whole mechanism: derived
 * from the config, a new field would be exported the day it lands, which is
 * the defect this list exists to close. A path is dotted for a group, an array
 * or a nested upload size (`furniture.accent`, `highlights.text`,
 * `sizes.thumb.url`), and an array's index is not part of it.
 *
 * Nothing here is a credential. `media.url`, `thumbnailURL` and every
 * `sizes.*.url` are addresses the public diary already prints;
 * `journeys.slug` is in every public URL; `about.replyTo` and `site.replyTo`
 * are addresses the author publishes on purpose.
 */
export const EXPORTED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  media: [
    'journey',
    'kind',
    'state',
    'failureReason',
    'caption',
    'alt',
    'capturedAt',
    'posterAt',
    'posterImage',
    'durationSec',
    'inBook',
    'hidden',
    'isCover',
    'allowDownload',
    'order',
    'contentHash',
    'updatedAt',
    'createdAt',
    'url',
    'thumbnailURL',
    'filename',
    'mimeType',
    'filesize',
    'width',
    'height',
    'focalX',
    'focalY',
    'sizes.thumb.url',
    'sizes.thumb.width',
    'sizes.thumb.height',
    'sizes.thumb.mimeType',
    'sizes.thumb.filesize',
    'sizes.thumb.filename',
    'sizes.grid.url',
    'sizes.grid.width',
    'sizes.grid.height',
    'sizes.grid.mimeType',
    'sizes.grid.filesize',
    'sizes.grid.filename',
    'sizes.tile.url',
    'sizes.tile.width',
    'sizes.tile.height',
    'sizes.tile.mimeType',
    'sizes.tile.filesize',
    'sizes.tile.filename',
    'sizes.frame.url',
    'sizes.frame.width',
    'sizes.frame.height',
    'sizes.frame.mimeType',
    'sizes.frame.filesize',
    'sizes.frame.filename',
    'sizes.hero.url',
    'sizes.hero.width',
    'sizes.hero.height',
    'sizes.hero.mimeType',
    'sizes.hero.filesize',
    'sizes.hero.filename',
    'sizes.hero2x.url',
    'sizes.hero2x.width',
    'sizes.hero2x.height',
    'sizes.hero2x.mimeType',
    'sizes.hero2x.filesize',
    'sizes.hero2x.filename',
  ],
  journeys: [
    'name',
    'place',
    'slug',
    'dates',
    'startsOn',
    'order',
    'hiddenFromBookmarks',
    'archived',
    'deletedAt',
    'weather',
    'mood',
    'weatherGlyph',
    'furniture.signoff',
    'furniture.stampCountry',
    'furniture.stampValue',
    'furniture.accent',
    'highlights.text',
    'highlights.id',
    'note',
    'tally.key',
    'tally.value',
    'tally.id',
    'updatedAt',
    'createdAt',
    '_status',
  ],
  pages: [
    'journey',
    'kind',
    'title',
    'order',
    'layout',
    'slots.role',
    'slots.media',
    'slots.caption',
    'slots.alt',
    'slots.focalX',
    'slots.focalY',
    'slots.id',
    'updatedAt',
    'createdAt',
    '_status',
  ],
  book: [
    'title',
    'subtitle',
    'owner',
    'coverCloth',
    'yearsShown',
    'contentsNote',
    'flipDurationMs',
    'galleryThumbPx',
    'showDecorations',
    'showRibbon',
    'showCounter',
    'journeyOrderMode',
    'updatedAt',
    'createdAt',
  ],
  about: [
    'portrait',
    'portraitCaption',
    'paragraphs.text',
    'paragraphs.id',
    'kit.text',
    'kit.id',
    'replyTo',
    'updatedAt',
    'createdAt',
  ],
  site: [
    'name',
    'domain',
    'description',
    'replyTo',
    'analyticsId',
    'allowDownloads',
    'allowShare',
    'indexGalleries',
    'passwordProtect',
    'touchPageTurn',
    'updatedAt',
    'createdAt',
  ],
}

/**
 * The field paths that are classified and still never leave, with the reason.
 *
 * EMPTY TODAY, AND THAT IS A STATEMENT RATHER THAN A PLACEHOLDER: nothing this
 * schema currently declares on an exported collection or global is a
 * credential, and every path is accounted for in {@link EXPORTED_FIELDS}. The
 * list exists because the next credential this schema grows will be a FIELD —
 * `docs/deviations.md` §100 names a book password on the `site` global as
 * exactly that — and a path here is CLASSIFIED, so
 * {@link refuseTheUnclassified} stays quiet about it while
 * {@link onlyExportedFields} leaves it out. It is data rather than a
 * mechanism: nothing here has an arm that could rot unexercised.
 */
export const WITHHELD_FIELDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {}

/** What a field looks like to the walk below, whatever kind it is. */
interface DeclaredField {
  /** Named fields have one; a `row` or a `collapsible` does not. */
  readonly name?: string
  /** A group, an array, a row, a collapsible or an upload's `sizes`. */
  readonly fields?: readonly DeclaredField[]
  /** A `tabs` field's tabs, each of which carries its own `fields`. */
  readonly tabs?: readonly DeclaredField[]
}

/**
 * Every field path a `fields` list declares.
 *
 * A named field with children contributes its children's dotted paths and not
 * its own — `furniture` is not a value, `furniture.accent` is. An unnamed
 * container (`row`, `collapsible`) contributes its children at the parent's
 * own depth, which is what Payload stores.
 * @param fields - The sanitised field list.
 * @param prefix - The dotted path so far.
 * @returns Every leaf path, in declaration order.
 * @example
 * declaredFieldPaths([{ name: 'furniture', fields: [{ name: 'accent' }] }])
 * // ['furniture.accent']
 */
export const declaredFieldPaths = (fields: readonly DeclaredField[], prefix = ''): readonly string[] => {
  const paths: string[] = []
  for (const field of fields) {
    if (typeof field.name === 'string') {
      const path = `${prefix}${field.name}`
      if (field.fields === undefined) paths.push(path)
      else paths.push(...declaredFieldPaths(field.fields, `${path}.`))
    } else if (field.fields !== undefined) {
      paths.push(...declaredFieldPaths(field.fields, prefix))
    } else if (field.tabs !== undefined) {
      for (const tab of field.tabs) paths.push(...declaredFieldPaths(tab.fields ?? [], prefix))
    }
  }
  return paths
}

/** A value that may hold further named values. */
type Row = Record<string, unknown>

/**
 * Whether a value is a plain object this walk should descend into.
 * @param value - The value.
 * @returns `true` for an object that is not an array and not `null`.
 */
const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A row reduced to the paths {@link EXPORTED_FIELDS} names for its slug.
 *
 * ═══ POSITIVE, NOT A BLOCKLIST, AND THAT IS A CORRECTION ═══
 *
 * The first attempt at F5's fix stripped the paths in a `WITHHELD_FIELDS`
 * blocklist. That list is empty — nothing this schema declares on an exported
 * collection is a credential — so the call site was a NO-OP: bypassing it
 * entirely left all eighteen cases green, which is the species this repository
 * has now found more than any other. A positive projection is doing real work
 * on every row of every dump, and it fails CLOSED: a key nobody classified is
 * absent from the output rather than present in it.
 *
 * It is the second of two mechanisms and deliberately not the only one.
 * {@link refuseTheUnclassified} throws for a field nobody has classified, so
 * the author is told rather than quietly given a smaller file; this is what
 * holds if that check is ever loosened.
 *
 * AN ARRAY'S INDEX IS NOT PART OF A PATH, so `highlights.text` keeps that key
 * on every element.
 * @param row - The row, as Payload returned it.
 * @param exported - The dotted paths that may leave.
 * @param prefix - The dotted path of `row` itself.
 * @returns The row the dump carries.
 * @example
 * onlyExportedFields({ name: 'x', secret: 'y' }, ['name']) // { name: 'x' }
 */
export const onlyExportedFields = (row: unknown, exported: readonly string[], prefix = ''): unknown => {
  if (Array.isArray(row)) return row.map((item) => onlyExportedFields(item, exported, prefix))
  if (!isRow(row)) return row

  const kept: Row = {}
  for (const [key, value] of Object.entries(row)) {
    const path = `${prefix}${key}`
    // PAYLOAD'S OWN TWO are carried at the top level whatever the field lists
    // say, because no `fields` list declares them and a dump without them is
    // not a restore. Deeper, `id` is an array row's own key and IS declared
    // (`highlights.id`), so the exemption is anchored to the top level.
    if (prefix === '' && ALWAYS_EXPORTED.includes(key)) {
      kept[key] = value
      continue
    }
    // A CONTAINER IS KEPT WHEN ANY OF ITS CHILDREN IS. `furniture` is not a
    // path in its own right; `furniture.accent` is.
    const isContainer = exported.some((candidate) => candidate.startsWith(`${path}.`))
    if (isContainer) {
      kept[key] = onlyExportedFields(value, exported, `${path}.`)
      continue
    }
    if (exported.includes(path)) kept[key] = value
  }
  return kept
}

/** One file in the media manifest. */
export interface ManifestEntry {
  /** The media row this file belongs to. */
  readonly id: number
  /** The stored key, which is what a bucket restore is matched against. */
  readonly filename: string
  /** Its size in bytes, so a restore can be checked without fetching it. */
  readonly filesize: number
  /** The content hash the ingest pipeline computed, or `null` for a row without one. */
  readonly contentHash: string | null
}

/** What "Export everything" hands the author. */
export interface DiaryExport {
  /** When the dump was taken, as an ISO instant. */
  readonly takenAt: string
  /** What is deliberately NOT in it, in words, so the file explains itself. */
  readonly excludes: readonly string[]
  /** Every content collection, by slug, with all of its rows. */
  readonly collections: Readonly<Record<string, readonly unknown[]>>
  /** Every global, by slug. */
  readonly globals: Readonly<Record<string, unknown>>
  /** One entry per stored file: key, size and hash, never the bytes. */
  readonly mediaManifest: readonly ManifestEntry[]
}

/** What the dump says about itself, so nobody has to guess what it holds. */
const EXCLUDES: readonly string[] = [
  'the photographs and clips themselves — only their keys, sizes and hashes are here; the files are backed up where they are stored (docs/runbook.md)',
  ...Object.entries(WITHHELD).map(([slug, why]) => `the ${slug} collection — ${why}`),
  ...Object.entries(WITHHELD_FIELDS).flatMap(([slug, fields]) =>
    Object.entries(fields).map(([path, why]) => `${slug}.${path} — ${why}`),
  ),
]

/**
 * A collection slug, as Payload's own operations demand it.
 *
 * Payload types `collection` as a union of the slugs this config declares,
 * and the whole point of this module is that it enumerates the config rather
 * than naming them — so the two meet here, where a slug that came OUT of
 * `payload.config.collections` is handed back to `payload.find`. Taken off
 * Payload's own parameter rather than written out: no assertion is needed
 * (the config's own slugs already have this type — measured, by writing one
 * and watching `no-unnecessary-type-assertion` report it), and a hand-written
 * union would be a second copy of the collection list in the file whose
 * subject is not having one.
 */
type CollectionSlug = Parameters<Payload['count']>[0]['collection']

/** A global slug, for {@link CollectionSlug}'s reason. */
type GlobalSlug = Parameters<Payload['findGlobal']>[0]['slug']

/**
 * Every collection slug the Payload config declares.
 * @param payload - The Local API instance, which carries the config.
 * @returns The slugs, in the order the config lists them.
 */
const declaredCollections = (payload: Payload): readonly CollectionSlug[] =>
  payload.config.collections.map((collection) => collection.slug)

/**
 * Every global slug the Payload config declares.
 * @param payload - The Local API instance.
 * @returns The slugs.
 */
const declaredGlobals = (payload: Payload): readonly GlobalSlug[] => payload.config.globals.map((global) => global.slug)

/**
 * Refuses a config holding anything nobody has classified.
 *
 * @param payload - The Local API instance.
 * @throws {Error} Naming every unclassified slug. See this module's header.
 */
const refuseTheUnclassified = (payload: Payload): void => {
  const unclassified = [
    ...declaredCollections(payload).filter((slug) => !CONTENT.includes(slug) && !(slug in WITHHELD)),
    ...declaredGlobals(payload).filter((slug) => !GLOBALS.includes(slug)),
  ]
  if (unclassified.length > 0) {
    throw new Error(
      `export: ${unclassified.join(', ')} is declared in the Payload config and classified in neither CONTENT nor WITHHELD. Decide before it is exported.`,
    )
  }

  // AND THE FIELDS, which is where this guard was one level too coarse: a
  // credential arrives as a field on a collection somebody already decided was
  // content. See this module's header.
  const unclassifiedFields = exportedFieldSources(payload).flatMap(({ slug, fields }) =>
    declaredFieldPaths(fields)
      .filter((path) => !(EXPORTED_FIELDS[slug] ?? []).includes(path) && WITHHELD_FIELDS[slug]?.[path] === undefined)
      .map((path) => `${slug}.${path}`),
  )
  if (unclassifiedFields.length > 0) {
    throw new Error(
      `export: ${unclassifiedFields.join(', ')} is declared in the Payload config and classified in neither EXPORTED_FIELDS nor WITHHELD_FIELDS. Decide before it is exported.`,
    )
  }
}

/**
 * Every exported collection and global, with the field list the config
 * declares for it.
 *
 * ONE LIST FOR BOTH, because the classification is the same question on
 * either: which of these values may leave this database.
 * @param payload - The Local API instance, which carries the config.
 * @returns One entry per exported slug.
 */
const exportedFieldSources = (
  payload: Payload,
): readonly { readonly slug: string; readonly fields: readonly DeclaredField[] }[] => [
  ...payload.config.collections
    .filter((collection) => CONTENT.includes(collection.slug))
    .map((collection) => ({ slug: collection.slug, fields: collection.fields })),
  ...payload.config.globals.map((global) => ({
    slug: global.slug,
    fields: global.fields,
  })),
]

/**
 * One row, reduced to what its slug's classification lets out.
 *
 * WHAT IS PROVEN HERE AND WHAT IS NOT, stated rather than implied.
 * {@link onlyExportedFields} is mutation-killed — making it keep every key
 * fails two cases. THIS CALL SITE IS NOT: bypassing it leaves every case
 * green, because every key a real row carries today is classified, so the
 * projection drops nothing from a real dump. Measured, by printing the raw row
 * keys of all three collections and all three globals and comparing them
 * against {@link EXPORTED_FIELDS}.
 *
 * Driving it would need a row carrying an unclassified key, and Payload's
 * Postgres adapter selects the columns its schema knows — so a field declared
 * on the config at runtime does not come back, and a real one needs a
 * migration. `carries every row through that projection, so a real dump holds
 * only classified keys` is the invariant that WOULD fire on the day such a key
 * exists, and it is what this call site rests on until then.
 * @param slug - The collection or global the row belongs to.
 * @param row - The row, as Payload returned it.
 * @returns The row the dump carries.
 */
const exportable = (slug: string, row: unknown): unknown => onlyExportedFields(row, EXPORTED_FIELDS[slug] ?? [])

/**
 * Everything "Export everything" hands the author.
 *
 * @param payload - The Local API instance the rows live behind.
 * @param scope - The hoisted {@link AdminScope}, spread into every query.
 * @param now - The instant to stamp the dump with, injected (CLAUDE.md §2.3).
 * @returns The document. See {@link DiaryExport}.
 * @throws When the config declares a collection or global nobody has
 *   classified, and from Payload when a read is refused.
 * @example
 * const dump = await exportEverything(await getPayload(), scope, Date.now())
 */
export const exportEverything = async (payload: Payload, scope: AdminScope, now: number): Promise<DiaryExport> => {
  refuseTheUnclassified(payload)

  const collections: Record<string, readonly unknown[]> = {}
  for (const slug of declaredCollections(payload)) {
    if (!CONTENT.includes(slug)) continue
    const rows = await payload.find({ collection: slug, ...scope, depth: 0, pagination: false })
    collections[slug] = rows.docs.map((row) => exportable(slug, row))
  }

  const globals: Record<string, unknown> = {}
  for (const slug of declaredGlobals(payload)) {
    globals[slug] = exportable(slug, await payload.findGlobal({ slug, ...scope, depth: 0 }))
  }

  const files = await payload.find({
    collection: 'media',
    ...scope,
    depth: 0,
    pagination: false,
    select: { filename: true, filesize: true, contentHash: true },
  })

  return {
    takenAt: new Date(now).toISOString(),
    excludes: EXCLUDES,
    collections,
    globals,
    mediaManifest: files.docs.map((file) => ({
      id: file.id,
      /* c8 ignore next 2 -- both refusing arms are unreachable through any writer this repository has: `media` is an upload collection, so Payload's own upload handler writes `filename` and `filesize` and a `create` without a file is refused (measured — `cannot be given a media row with no file, which is why nothing sums a missing filesize`, `readSettingsScreen.integration.test.ts`). They exist because the generated TYPE allows null. */
      filename: file.filename ?? '',
      filesize: typeof file.filesize === 'number' ? file.filesize : 0,
      contentHash: file.contentHash ?? null,
    })),
  }
}
