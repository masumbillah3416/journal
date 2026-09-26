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
}

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
    collections[slug] = rows.docs
  }

  const globals: Record<string, unknown> = {}
  for (const slug of declaredGlobals(payload)) {
    globals[slug] = await payload.findGlobal({ slug, ...scope, depth: 0 })
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
