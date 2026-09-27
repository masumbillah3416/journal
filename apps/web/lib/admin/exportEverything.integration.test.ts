/**
 * exportEverything.integration.test.ts — behaviour spec for the one feature
 * `SECURITY.md` asks for by name under "The thing most likely to actually hurt
 * you".
 *
 * Integration test (CLAUDE.md §2): the properties are about a real Payload
 * config and a real database. Which collections exist, what a `users` row
 * actually stores, and whether any of it reaches the output are questions no
 * stub can answer — and the last one is the whole reason this file exists.
 *
 * ═══ THE SECRET CASE IS A SEARCH OF THE BYTES, NOT OF THE SHAPE ═══
 *
 * An account is created with a known password, its stored `hash` and `salt`
 * are read straight out of Postgres, and the serialised dump is searched for
 * them. A case that only checked for a `users` KEY would pass a dump that
 * embedded an account inside a relationship, inside a version row, or inside
 * a global — which is exactly how a credential leaves a system nobody thought
 * was holding one.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, like every integration
 * file here.
 * Depends on: vitest, @travel-diary/domain/ids, ../testPayload, ./adminScope,
 * ./exportEverything.
 */
import { userId } from '@travel-diary/domain/ids'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestPayload } from '../testPayload'
import { adminScope, type AdminScope } from './adminScope'
import {
  ALWAYS_EXPORTED,
  CONTENT,
  EXPORTED_FIELDS,
  GLOBALS,
  WITHHELD,
  WITHHELD_FIELDS,
  declaredFieldPaths,
  exportEverything,
  onlyExportedFields,
} from './exportEverything'

/** What every row this file writes carries, so cleanup can find them all. */
const MARKER = 'test-export-everything'

/** A password that is not one, but is long enough to be stored like one. */
const NOT_A_PASSWORD = 'not-a-real-password-but-a-long-one'

/** The instant every dump in this file is stamped with. */
const AT = Date.parse('2026-09-27T10:00:00.000Z')

describe('exportEverything', () => {
  let payload: Awaited<ReturnType<typeof getTestPayload>>
  let scope: AdminScope
  let accountId = 0

  beforeAll(async () => {
    payload = await getTestPayload()
    const account = await payload.create({
      collection: 'users',
      data: { email: `${MARKER}@example.test`, password: NOT_A_PASSWORD },
    })
    accountId = account.id
    const branded = userId(String(account.id))
    if (!branded.ok) throw new Error(branded.error)
    scope = await adminScope({ user: branded.value })
  }, 180_000)

  afterAll(async () => {
    await payload.delete({ collection: 'users', id: accountId })
  })

  it('classifies every collection the Payload config declares, in one list or the other', () => {
    // THE ANTI-DRIFT CASE. A collection added later is in neither list, and
    // this is what says so — before the export does, and before it has had a
    // chance to put something in a file the author downloads.
    const declared = payload.config.collections.map((collection) => collection.slug)
    const unclassified = declared.filter((slug) => !CONTENT.includes(slug) && !(slug in WITHHELD))

    expect(unclassified, 'these collections are declared and classified in neither CONTENT nor WITHHELD').toEqual([])
  })

  it('classifies every global the config declares', () => {
    const declared = payload.config.globals.map((global) => global.slug)

    expect(declared.filter((slug) => !GLOBALS.includes(slug))).toEqual([])
  })

  it('exports every content collection the config declares, so one added later is in it the day it lands', async () => {
    const dump = await exportEverything(payload, scope, AT)

    expect(Object.keys(dump.collections).sort()).toEqual([...CONTENT].sort())
  })

  it('exports every global', async () => {
    const dump = await exportEverything(payload, scope, AT)

    expect(Object.keys(dump.globals).sort()).toEqual([...GLOBALS].sort())
  })

  it('holds the journeys the database holds, rather than an empty shape of them', async () => {
    // THE SENTINEL. Every assertion above is about KEYS, and a dump whose
    // every collection was an empty array would satisfy all of them.
    const journeys = await payload.count({ collection: 'journeys' })
    const dump = await exportEverything(payload, scope, AT)

    expect(dump.collections['journeys']).toHaveLength(journeys.totalDocs)
    expect(journeys.totalDocs).toBeGreaterThan(0)
  })

  it('names no withheld collection at all, not even as an empty key', async () => {
    const dump = await exportEverything(payload, scope, AT)

    expect(Object.keys(WITHHELD).filter((slug) => slug in dump.collections)).toEqual([])
  })

  it('carries no account’s stored hash or salt anywhere in its bytes', async () => {
    // THE CASE THAT MATTERS. Read out of Postgres, then searched for in the
    // serialised dump — not compared against a shape, because a credential
    // that leaked through a relationship, a version row or a global would
    // satisfy every structural assertion in this file.
    const stored = await payload.findByID({ collection: 'users', id: accountId, depth: 0, showHiddenFields: true })
    const secrets = [stored.hash, stored.salt].filter((value): value is string => typeof value === 'string')
    expect(secrets.length, 'the fixture account stores no hash or salt, so this case would prove nothing').toBe(2)

    const serialised = JSON.stringify(await exportEverything(payload, scope, AT))

    expect(secrets.filter((secret) => serialised.includes(secret))).toEqual([])
  })

  it('carries no account’s email either, which is the only PII this site holds', async () => {
    const serialised = JSON.stringify(await exportEverything(payload, scope, AT))

    expect(serialised).not.toContain(`${MARKER}@example.test`)
  })

  it('lists every stored file by key, size and hash, and none of their bytes', async () => {
    const files = await payload.count({ collection: 'media' })
    const dump = await exportEverything(payload, scope, AT)

    expect(dump.mediaManifest).toHaveLength(files.totalDocs)
    expect(files.totalDocs).toBeGreaterThan(0)
    expect(Object.keys(dump.mediaManifest[0] ?? {}).sort()).toEqual(['contentHash', 'filename', 'filesize', 'id'])
  })

  it('says what it leaves out, so nobody has to read this file to know', async () => {
    const dump = await exportEverything(payload, scope, AT)

    expect(dump.excludes.join(' ')).toContain('the photographs and clips themselves')
    expect(dump.excludes.filter((line) => line.includes('users'))).toHaveLength(1)
  })

  it('stamps the dump from the clock it was given, not from one of its own', async () => {
    expect((await exportEverything(payload, scope, AT)).takenAt).toBe('2026-09-27T10:00:00.000Z')
  })

  it('classifies every FIELD the config declares on an exported collection or global', () => {
    // THE REVIEW'S F5, AT THE LEVEL IT WAS MISSED. The first version of this
    // guard classified COLLECTIONS and never FIELDS, and a `webhookSecret`
    // column planted on `journeys` reached the dump with all twelve cases
    // green. A collection is not a unit of sensitivity.
    const sources = [
      ...payload.config.collections
        .filter((collection) => CONTENT.includes(collection.slug))
        .map((collection) => ({ slug: collection.slug, fields: collection.fields })),
      ...payload.config.globals.map((global) => ({ slug: global.slug, fields: global.fields })),
    ]
    expect(sources.length, 'no exported collections or globals were found').toBe(CONTENT.length + GLOBALS.length)

    const unclassified = sources.flatMap(({ slug, fields }) =>
      declaredFieldPaths(fields)
        .filter((path) => !(EXPORTED_FIELDS[slug] ?? []).includes(path) && WITHHELD_FIELDS[slug]?.[path] === undefined)
        .map((path) => `${slug}.${path}`),
    )

    expect(unclassified, 'these fields are declared and classified in neither list').toEqual([])
  })

  it('refuses a config declaring a FIELD nobody has classified, and names it', async () => {
    // THE REVIEWER'S PROBE, DRIVEN RATHER THAN DESCRIBED — planted on the real
    // config, in the real collection, and put back in a `finally`. The
    // reviewer planted the same field with a real column and a real
    // `sk-live-…` value and watched it reach the dump; this is what now stops
    // it, one commit earlier than a database migration.
    const journeys = payload.config.collections.find((collection) => collection.slug === 'journeys')
    expect(journeys, 'the journeys collection is not in the config').toBeDefined()
    const declared = journeys?.fields ?? []
    const planted = { name: 'webhookSecret', type: 'text' } as unknown as (typeof declared)[number]
    if (journeys !== undefined) journeys.fields = [...declared, planted]

    try {
      await expect(exportEverything(payload, scope, AT)).rejects.toThrow(/journeys\.webhookSecret/u)
    } finally {
      if (journeys !== undefined) journeys.fields = declared
    }
  })

  it('refuses a field planted on a GLOBAL too, which is where the next credential lands', async () => {
    // `docs/deviations.md` §100 names a book password on the `site` global as
    // exactly what would reverse its no-challenge decision. A guard that only
    // watched collections would ship it whole.
    const site = payload.config.globals.find((global) => global.slug === 'site')
    expect(site, 'the site global is not in the config').toBeDefined()
    const declared = site?.fields ?? []
    const planted = { name: 'bookPassword', type: 'text' } as unknown as (typeof declared)[number]
    if (site !== undefined) site.fields = [...declared, planted]

    try {
      await expect(exportEverything(payload, scope, AT)).rejects.toThrow(/site\.bookPassword/u)
    } finally {
      if (site !== undefined) site.fields = declared
    }
  })

  it('drops a key no classification names, however deep it sits, and keeps its siblings', () => {
    // THE PROJECTION IS POSITIVE, and this is the case that says so. The first
    // attempt at this fix stripped a blocklist instead; that list is empty, so
    // the call site was a no-op — bypassing it entirely left all eighteen
    // cases green. A positive projection is doing work on every row of every
    // dump, and it fails CLOSED.
    const projected = onlyExportedFields(
      {
        id: 41,
        name: 'Reykjavik',
        webhookSecret: 'sk-live-REVIEW-PROBE-SECRET',
        furniture: { accent: '#3d817e', signoff: 'S', apiKey: 'sk-live-NESTED' },
        highlights: [
          { text: 'kept', id: '1' },
          { text: 'also kept', id: '2' },
        ],
      },
      ['name', 'furniture.accent', 'furniture.signoff', 'highlights.text', 'highlights.id'],
    )

    expect(JSON.stringify(projected)).not.toContain('sk-live-')
    expect(projected).toEqual({
      id: 41,
      name: 'Reykjavik',
      furniture: { accent: '#3d817e', signoff: 'S' },
      highlights: [
        { text: 'kept', id: '1' },
        { text: 'also kept', id: '2' },
      ],
    })
  })

  it('keeps an array element’s own keys on every element, because an index is not part of a path', () => {
    const projected = onlyExportedFields(
      {
        tally: [
          { key: 'a', value: 'kept', secret: 'sk-live-ONE' },
          { key: 'b', value: 'kept', secret: 'sk-live-TWO' },
        ],
      },
      ['tally.key', 'tally.value'],
    )

    expect(JSON.stringify(projected)).not.toContain('sk-live-')
    expect(projected).toEqual({
      tally: [
        { key: 'a', value: 'kept' },
        { key: 'b', value: 'kept' },
      ],
    })
  })

  it('hands a leaf back unchanged, because a string is not a row to walk into', () => {
    expect(onlyExportedFields('a caption', [])).toBe('a caption')
    expect(onlyExportedFields(null, [])).toBeNull()
  })

  it('refuses a field with no name rather than skipping what is inside it', () => {
    // The walk had arms for Payload's unnamed containers and for `tabs`. This
    // config declares neither, so both were speculative code nothing could
    // drive — and a walk that SILENTLY skipped one would hide every field
    // inside it from the classification, which is the hole this module exists
    // to close.
    expect(() => declaredFieldPaths([{ fields: [{ name: 'hidden' }] }])).toThrow(/no name/u)
  })

  it('carries every row through that projection, so a real dump holds only classified keys', async () => {
    // AT THE CALL SITE, not at the function: every key of every exported row,
    // compared against the classification. It is what fails if a row ever
    // arrives carrying something nobody named.
    const dump = await exportEverything(payload, scope, AT)
    const stray: string[] = []
    for (const [slug, rows] of Object.entries(dump.collections)) {
      for (const row of rows) {
        for (const key of Object.keys(row as Record<string, unknown>)) {
          const classified =
            ALWAYS_EXPORTED.includes(key) ||
            (EXPORTED_FIELDS[slug] ?? []).some((path) => path === key || path.startsWith(`${key}.`))
          if (!classified) stray.push(`${slug}.${key}`)
        }
      }
    }

    expect(stray, 'these keys reached the dump and no classification names them').toEqual([])
  })

  it('carries Payload’s own two row keys, which no field list declares', () => {
    // `id` is what a restore re-points a relationship with and `globalType` is
    // how Payload labels a global's row, so a dump without them is not a
    // restore. They are named rather than left to be noticed missing from the
    // field lists.
    expect(ALWAYS_EXPORTED).toEqual(['id', 'globalType'])
  })

  it('refuses a config declaring a collection nobody has classified', async () => {
    // THE REFUSAL, DRIVEN RATHER THAN DESCRIBED, and against the REAL config
    // rather than a stand-in: the list is the one the module reads, with one
    // slug appended for the length of the assertion and put back in a
    // `finally`. A copied Payload would be a copy of the shape under test.
    const declared = payload.config.collections
    const ledgers = { slug: 'ledgers' } as unknown as (typeof declared)[number]
    payload.config.collections = [...declared, ledgers]
    try {
      await expect(exportEverything(payload, scope, AT)).rejects.toThrow(/ledgers/u)
    } finally {
      payload.config.collections = declared
    }
  })
})
