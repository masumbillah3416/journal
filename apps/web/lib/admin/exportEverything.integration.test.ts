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
import { CONTENT, GLOBALS, WITHHELD, exportEverything } from './exportEverything'

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
