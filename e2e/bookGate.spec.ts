/**
 * bookGate.spec.ts — the two `site` settings that change what a READER is
 * served, measured against a running server by toggling them.
 *
 * ═══ WHY THIS IS A BROWSER SPEC AND NOT AN INTEGRATION TEST ═══
 *
 * The properties are HTTP ones: a STATUS for `/p/1` and the BODY of
 * `/robots.txt`. A Vitest integration run has Postgres and no Next server at
 * all, so neither can be observed there — `apps/web/lib/bookAccess.ts`'s own
 * integration test covers what the route entries ASK, and this file covers
 * what a reader GETS. A test that cannot run is worse than no test, because
 * the file exists and looks like coverage.
 *
 * ═══ WHY IT IS A COMMAND OF ITS OWN, AND RUNS IN ONE PROJECT ═══
 *
 * Both settings are SITE-WIDE. `playwright.config.ts` sets
 * `fullyParallel: true` and runs three viewport projects, so a case here that
 * closed the book would 401 every other spec's `/p/<n>` mid-run — the whole
 * suite failing for a reason none of those files could name. So this file is
 * not in `npm run test:e2e`: it has `npm run test:gate`, which names one
 * project, and `e2e/ciRegistration.test.ts` is extended to count that script
 * as registration. Inside the file, `describe.configure({ mode: 'serial' })`
 * keeps its own cases from overlapping each other.
 *
 * ═══ THE GLOBAL IS RESTORED IN A `finally`, AND DUMPED EITHER SIDE ═══
 *
 * This is the first fixture in this phase that can lock the owner out of
 * their own book: `playwright.config.ts`'s local `webServer` runs `npm run
 * dev` against the DEVELOPER'S OWN `diary` database, so a case that threw
 * while `passwordProtect` was on would leave the local diary answering 401
 * until somebody worked out why. {@link withSetting} restores in a `finally`
 * rather than after the assertion, and the whole global is dumped before the
 * run and diffed after it — the treatment every task since 9 has given
 * `media` and `journeys`.
 *
 * ═══ WHAT EACH CASE IS FOR ═══
 *
 *   - Two halves of the gate, differing in ONE global, so a gate that refuses
 *     everything fails as loudly as one that refuses nothing.
 *   - The galleries and the downloads beneath them, because a closed book
 *     whose photographs are still served by id is "the content fetchable",
 *     which is the sentence SECURITY.md's requirement is written against.
 *   - Both sides of `indexGalleries`, in `robots.txt` and in the gallery
 *     page's own directive. The INVERSE case is the one that stops the
 *     directive being a hard-coded `noindex` nobody can turn off — and it is
 *     also what proves `app/robots.ts` is not prerendered, since a baked
 *     answer fails one side or the other whichever way the build froze it.
 *
 * ═══ THE DIRECTIVE IS A META TAG, NOT AN `X-Robots-Tag` HEADER ═══
 *
 * Measured, not chosen: a Next.js page component cannot set a response header
 * (`next/headers`' `headers()` is read-only and `metadata.robots` emits a
 * `<meta>` and no header — verified against this app on Next 16.3.3).
 * `docs/deviations.md` §101 carries it. The header half of SECURITY.md's
 * requirement IS served where a header can be set: the download handler
 * beneath the gallery, which is a Route Handler.
 *
 * Depends on: @playwright/test, `getPayload` (apps/web/lib/payload) — the
 * same in-process Payload `e2e/support/adminSession.ts` uses, writing to the
 * database the server under test reads.
 */
import { expect, test } from '@playwright/test'
import { getPayload } from '../apps/web/lib/payload'

/** The page of the book every case here asks for. */
const A_PAGE = '/p/1'

/** A seeded journey with a published gallery. */
const A_GALLERY = '/gallery/tokyo'

/**
 * Payload's own bookkeeping on a global, which no write here authors.
 *
 * `updatedAt` moves on every `updateGlobal`, including the restoring one, so
 * comparing it would fail for the one reason that is not a leak. The other
 * three are the row's identity, and they are excluded for a reason this run
 * MEASURED rather than assumed: a diary whose settings have never been saved
 * has NO `site` row at all — `findGlobal` synthesises the declared defaults
 * and returns them without an `id`, a `createdAt` or a `globalType` — and the
 * first write materialises one. So the row's EXISTENCE is not a column and
 * cannot be put back. Every AUTHORED column is compared, which is the point:
 * a restore that checks one column certifies the damage it did to the others.
 */
const PAYLOAD_OWNED = new Set(['id', 'createdAt', 'updatedAt', 'globalType'])

/**
 * Every authored column of the `site` global, as a stable string.
 *
 * @returns The dump.
 */
const dumpSite = async (): Promise<string> => {
  const payload = await getPayload()
  const site: object = await payload.findGlobal({ slug: 'site', depth: 0 })
  return JSON.stringify(Object.fromEntries(Object.entries(site).filter(([column]) => !PAYLOAD_OWNED.has(column))))
}

/**
 * Runs one assertion with one public setting held at a known value, and puts
 * it back whatever happens.
 *
 * @param settings - What to set for the duration.
 * @param body - The assertion to run while it is set.
 */
const withSetting = async (
  settings: { readonly passwordProtect?: boolean; readonly indexGalleries?: boolean },
  body: () => Promise<void>,
): Promise<void> => {
  const payload = await getPayload()
  const before = await payload.findGlobal({
    slug: 'site',
    depth: 0,
    select: { passwordProtect: true, indexGalleries: true },
  })
  await payload.updateGlobal({ slug: 'site', depth: 0, data: settings })
  try {
    await body()
  } finally {
    // RESTORED IN A `finally`, NOT AFTER THE ASSERTION. A throw above leaves
    // the developer's own diary gated otherwise.
    await payload.updateGlobal({
      slug: 'site',
      depth: 0,
      data: { passwordProtect: before.passwordProtect ?? false, indexGalleries: before.indexGalleries ?? true },
    })
  }
}

/** The value of a `<meta name="robots">` in a raw HTML document, or `null`. */
const robotsMeta = (html: string): string | null => /<meta name="robots" content="([^"]*)"/.exec(html)?.[1] ?? null

test.describe.configure({ mode: 'serial' })

test.describe('the settings a reader is served', () => {
  let dumpedBefore = ''

  test.beforeAll(async () => {
    dumpedBefore = await dumpSite()
  })

  test.afterAll(async () => {
    expect(await dumpSite()).toBe(dumpedBefore)
  })

  test('refuses the book to a reader with no password once the whole book is protected', async ({ request }) => {
    await withSetting({ passwordProtect: true }, async () => {
      // ONE STATUS, not a list of acceptable ones. `maxRedirects: 0` is what
      // makes the status readable at all — a following request reports the
      // landing page's 200 and says nothing about the gate.
      const gated = await request.get(A_PAGE, { maxRedirects: 0 })

      expect(gated.status()).toBe(401)
    })
  })

  test('serves the same address once the setting is off, so the gate is the setting and not the route', async ({
    request,
  }) => {
    await withSetting({ passwordProtect: false }, async () => {
      const open = await request.get(A_PAGE, { maxRedirects: 0 })

      expect(open.status()).toBe(200)
    })
  })

  test('closes the galleries with the book, so the content is not left fetchable beside it', async ({ request }) => {
    await withSetting({ passwordProtect: true }, async () => {
      expect((await request.get(A_GALLERY, { maxRedirects: 0 })).status()).toBe(401)
    })
  })

  test('opens the galleries again with the book, so the gallery gate is the setting too', async ({ request }) => {
    await withSetting({ passwordProtect: false }, async () => {
      expect((await request.get(A_GALLERY, { maxRedirects: 0 })).status()).toBe(200)
    })
  })

  test('refuses a photograph by its own address once the book is closed, because that is what leaving the content fetchable means', async ({
    request,
  }) => {
    // THE ONE THAT WOULD OTHERWISE BE MISSED. The pages are gated above; a
    // download handler left open serves every frame of every journey by id
    // to anybody who has ever seen one, which is precisely the state
    // SECURITY.md's "a client-side check leaves the content fetchable"
    // describes. Phase 3 Task 11 made such a response uncacheable so a proxy
    // could not outlive the gate; this is the gate.
    const open = await request.get(A_GALLERY)
    const frame = /\/gallery\/tokyo\/download\/(\d+)/.exec(await open.text())?.[0]
    expect(frame, 'the gallery draws no download link, so this case would prove nothing').toBeTruthy()

    await withSetting({ passwordProtect: true }, async () => {
      expect((await request.get(frame ?? '', { maxRedirects: 0 })).status()).toBe(401)
    })
  })

  test('refuses the media index once the book is closed, because a list of every photograph is content', async ({
    request,
  }) => {
    // F1. The gate was spent at four ADDRESSES and the fifth is not an address
    // this repository wrote: `/api/media` is Payload's own REST route, and
    // `apps/web/collections/media.ts`'s `read` rule is what stands there. A
    // closed book that still hands an anonymous caller a paginated index of
    // every non-hidden photograph — id, filename, caption, alt — leaves the
    // content fetchable, which is SECURITY.md's sentence verbatim.
    await withSetting({ passwordProtect: true }, async () => {
      const index = await request.get('/api/media?limit=3', { maxRedirects: 0 })

      expect(index.status()).toBe(403)
    })
  })

  test('refuses the same index through GraphQL, which is a second door onto one rule', async ({ request }) => {
    // THE SECOND SURFACE, and the reason the fix belongs at the access rule
    // rather than at a route: REST and GraphQL are two callers of one
    // predicate, and a per-route fix would leave whichever one nobody
    // remembered.
    await withSetting({ passwordProtect: true }, async () => {
      const graphql = await request.post('/api/graphql', {
        data: { query: '{ allMedia(limit: 2) { docs { id filename url caption } } }' },
        headers: { 'content-type': 'application/json' },
        maxRedirects: 0,
      })

      expect(await graphql.text()).not.toContain('"filename"')
    })
  })

  test('refuses the photograph’s own bytes, at the URL the book’s markup prints', async ({ request }) => {
    // THE THIRD SURFACE, AND THE ONE THAT MATTERS MOST. The URL is HARVESTED
    // from the open book rather than written here: `/api/media/file/<name>` is
    // what the diary's own `<img>` tags resolve to, so a fixture that invented
    // a filename would be testing an address no reader ever holds.
    const open = await request.get('/p/1')
    const printed = [...(await open.text()).matchAll(/\/api\/media\/file\/[A-Za-z0-9._-]+/gu)].map((match) => match[0])
    const bytes = printed[0]
    expect(bytes, 'the open book printed no media file URL, so this case would prove nothing').toBeTruthy()

    await withSetting({ passwordProtect: true }, async () => {
      const refused = await request.get(bytes ?? '', { maxRedirects: 0 })

      expect(refused.status()).toBe(403)
    })
  })

  test('serves that same photograph again once the book is open, so the refusal is the setting', async ({
    request,
  }) => {
    // THE OTHER HALF. A media rule that refused every signed-out caller would
    // pass the three cases above and take the whole public diary dark.
    const open = await request.get('/p/1')
    const printed = [...(await open.text()).matchAll(/\/api\/media\/file\/[A-Za-z0-9._-]+/gu)].map((match) => match[0])
    const bytes = printed[0]
    expect(bytes, 'the open book printed no media file URL').toBeTruthy()

    await withSetting({ passwordProtect: false }, async () => {
      const served = await request.get(bytes ?? '', { maxRedirects: 0 })

      expect(served.status()).toBe(200)
      expect(served.headers()['content-type']).toContain('image/')
    })
  })

  test('disallows the galleries in robots.txt when the author has turned indexing off', async ({ request }) => {
    await withSetting({ indexGalleries: false }, async () => {
      const body = await (await request.get('/robots.txt')).text()

      expect(body).toContain('Disallow: /gallery/')
    })
  })

  test('sends X-Robots-Tag noindex on a gallery page for the same setting, because robots.txt does not unindex a known URL', async ({
    request,
  }) => {
    // `SECURITY.md` asks for this header by name, and Task 13 first shipped a
    // `<meta>` tag instead on the premise that the middleware could not read a
    // database. The review measured that premise false on Next 16.3.3, so the
    // header is set — and the tag is kept, because it is what the page can say
    // on its own if the middleware ever stops running. Both are asserted.
    await withSetting({ indexGalleries: false }, async () => {
      const response = await request.get(A_GALLERY)

      expect(response.headers()['x-robots-tag']).toBe('noindex')
      expect(robotsMeta(await response.text())).toBe('noindex')
    })
  })

  test('sends neither once indexing is allowed again', async ({ request }) => {
    // THE CASE THAT STOPS THIS BEING A HARD-CODED `noindex`, and the one that
    // stops `app/robots.ts` being prerendered: this runs against a server
    // that was started before any of these settings were written, so a baked
    // `/robots.txt` fails one side or the other whichever way the build
    // froze it.
    await withSetting({ indexGalleries: true }, async () => {
      const body = await (await request.get('/robots.txt')).text()
      const response = await request.get(A_GALLERY)

      expect(body).not.toContain('Disallow: /gallery/')
      expect(response.headers()['x-robots-tag']).toBeUndefined()
      expect(robotsMeta(await response.text())).toBeNull()
    })
  })

  test('still invites a crawler into the book itself while the galleries are closed to it', async ({ request }) => {
    // The `indexGalleries` setting is about the GALLERIES. A version that
    // answered it with a bare `Disallow: /` would satisfy every case above
    // and would quietly unindex thirty-three deep links whose indexability is
    // the entire reason the diary uses real paths (design spec §8).
    await withSetting({ indexGalleries: false }, async () => {
      const body = await (await request.get('/robots.txt')).text()

      expect(body).toContain('Allow: /')
      expect(body).not.toMatch(/^Disallow: \/(p)?$/m)
    })
  })
})
