/**
 * bookAccess.integration.test.ts — behaviour spec for the two `site` settings
 * the PUBLIC diary answers to: `passwordProtect` and `indexGalleries`.
 *
 * Integration test (CLAUDE.md §2): the subject is what a real `site` global,
 * written through a real Payload into a real Postgres, hands back — including
 * what an UNSET checkbox column comes back as, which is the one thing no stub
 * can tell you and the one thing both defaults turn on.
 *
 * ═══ THE GLOBAL IS RESTORED IN A `finally`, AND THAT IS NOT TIDINESS ═══
 *
 * `diary_test` is shared by every integration file in this run, and both of
 * these settings change what the PUBLIC diary serves. A case that threw while
 * `passwordProtect` was on would leave every later case — and, if this were
 * ever pointed at a developer's own database, the developer's own book —
 * refused. `readGalleryDownload.integration.test.ts` established the shape;
 * {@link withSite} is the same one, widened to both columns, and the
 * before/after dump at the bottom of this file is what proves it held.
 *
 * ═══ WHAT THIS FILE DOES NOT COVER, STATED RATHER THAN IMPLIED ═══
 *
 * That a REQUEST is refused. The gate's HTTP behaviour — a 401 for `/p/1`
 * with the setting on, a 200 with it off, and the two robots directives — is
 * `e2e/bookGate.spec.ts`'s, because it needs a running Next server and a
 * Vitest integration run has Postgres and no server at all. This file is what
 * the route entries ask; that file is what a reader gets.
 *
 * Uses `getTestPayload()` rather than `getPayload()`, like every integration
 * file here — but the module under test reads through `getPayload()`, which
 * resolves to the same `diary_test` instance under
 * `vitest.integration.config.ts`'s `DATABASE_URL`.
 * Depends on: vitest, ../lib/payload, ./testPayload, ./bookAccess.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { bookIsGated, galleriesAreIndexable, readPublicAccess } from './bookAccess'
import { getPayload } from './payload'
import { getTestPayload } from './testPayload'

describe('the site settings the public diary answers to', () => {
  let payload: Awaited<ReturnType<typeof getTestPayload>>

  /** The whole `site` global as it stood before this file ran. */
  let dumpedBefore = ''

  /**
   * Every column of the `site` global except the one a write is SUPPOSED to
   * move.
   *
   * `updatedAt` changes on every `updateGlobal`, including the restoring one,
   * so comparing it would fail for the one reason that is not a leak. Every
   * OTHER column is compared — §13's rule, which is that a restore checking
   * one column certifies the damage it did to the others.
   * @param global - The global, as Payload returned it.
   * @returns Its columns, minus `updatedAt`, as a stable string.
   */
  const dumped = (global: object): string =>
    JSON.stringify(Object.fromEntries(Object.entries(global).filter(([column]) => column !== 'updatedAt')))

  beforeAll(async () => {
    payload = await getTestPayload()
    dumpedBefore = dumped(await payload.findGlobal({ slug: 'site', depth: 0 }))
  })

  afterAll(async () => {
    // THE DUMP-AND-DIFF EVERY TASK SINCE 9 HAS DONE for `media` and
    // `journeys`, over the global this file writes. It is the check that says
    // the `finally` below actually held, rather than the file asserting that
    // it wrote one.
    expect(dumped(await payload.findGlobal({ slug: 'site', depth: 0 }))).toBe(dumpedBefore)
  })

  /**
   * Runs one assertion with the two public settings held at known values, and
   * puts both back whatever happens.
   *
   * @param settings - What to set for the duration.
   * @param body - The assertion to run while they are set.
   */
  const withSite = async (
    settings: { readonly passwordProtect?: boolean | null; readonly indexGalleries?: boolean | null },
    body: () => Promise<void>,
  ): Promise<void> => {
    const before = await payload.findGlobal({
      slug: 'site',
      depth: 0,
      select: { passwordProtect: true, indexGalleries: true },
    })
    await payload.updateGlobal({ slug: 'site', depth: 0, data: settings })
    try {
      await body()
    } finally {
      await payload.updateGlobal({
        slug: 'site',
        depth: 0,
        data: {
          passwordProtect: before.passwordProtect ?? false,
          indexGalleries: before.indexGalleries ?? true,
        },
      })
    }
  }

  it('reports the book gated once the author has passworded the whole book', async () => {
    await withSite({ passwordProtect: true }, async () => {
      expect(bookIsGated(await readPublicAccess())).toBe(true)
    })
  })

  it('reports the same book open with the setting off, so the gate is the setting and not the module', async () => {
    // THE OTHER HALF, and it is the half that makes the first one mean
    // something: a `bookIsGated` returning `true` unconditionally passes the
    // case above and fails this one.
    await withSite({ passwordProtect: false }, async () => {
      expect(bookIsGated(await readPublicAccess())).toBe(false)
    })
  })

  it('reports the galleries indexable while the author allows it, and not once they do not', async () => {
    await withSite({ indexGalleries: true }, async () => {
      expect(galleriesAreIndexable(await readPublicAccess())).toBe(true)
    })
    await withSite({ indexGalleries: false }, async () => {
      expect(galleriesAreIndexable(await readPublicAccess())).toBe(false)
    })
  })

  it('reads the two settings and nothing else, in one round trip', async () => {
    // §7: select narrowly, set `depth`. Every public page of the diary asks
    // this question, so a read that paid for the whole global — including the
    // analytics id and the description — would be on the critical path of
    // every page load in the book.
    //
    // RESTORED IN A `finally`, for the reason
    // `readGalleryDownload.integration.test.ts` gives at its own spy: the
    // instance is memoised and shared with every later case in this run.
    const spy = vi.spyOn(await getPayload(), 'findGlobal')
    try {
      await readPublicAccess()

      expect(spy.mock.calls).toHaveLength(1)
      expect(spy.mock.calls[0]?.[0]).toMatchObject({
        slug: 'site',
        depth: 0,
        select: { passwordProtect: true, indexGalleries: true },
      })
    } finally {
      spy.mockRestore()
    }
  })

  it('takes an unset column as the default the collection declares, rather than as “off”', async () => {
    // WHAT POSTGRES ACTUALLY HANDS BACK for a checkbox nobody has ever
    // written is `null`, not `false` — which is why this case is an
    // integration test. The two defaults point in OPPOSITE directions
    // (`apps/web/globals/site.ts`: `passwordProtect` false, `indexGalleries`
    // true), so a module coercing both with `=== true` would silently stop
    // indexing a fresh install's galleries, and one coercing both with
    // `!== false` would gate a fresh install's book.
    await withSite({ passwordProtect: null, indexGalleries: null }, async () => {
      const access = await readPublicAccess()

      expect([bookIsGated(access), galleriesAreIndexable(access)]).toEqual([false, true])
    })
  })
})
