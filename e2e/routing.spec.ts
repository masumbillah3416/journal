/**
 * routing.spec.ts — what the diary's addresses promise, asserted from outside.
 *
 * The design spec's §8 makes `/p/<n>` a REAL, 1-indexed path rather than a
 * hash, for one reason: the deep links have to be indexable and shareable.
 * That promise has six observable parts, and this file is one case per part:
 *
 *   1. **The content is in the HTML.** Asserted with `request.get`, never
 *      `page.goto` — a crawler runs no JavaScript, so neither may the
 *      assertion that stands in for one. (`e2e/serverWindow.spec.ts` proves
 *      the same thing exhaustively across all thirty-three routes; the case
 *      here is the readable statement of the rule those thirty-three enforce.)
 *   2. **An address the book has no page for is a 404**, not a page the
 *      reader did not ask for and not a crash — Task 13's routing decision,
 *      taken in `addressedPageIndex` (@travel-diary/domain/pageAddress) and
 *      turned into a response by the route's `notFound()`.
 *   3. **Every page has a title and a description of its own.** Thirty-three
 *      results wearing one title are thirty-three results nobody can tell
 *      apart, which throws away most of what real paths bought.
 *   4. **`/m/<n>` is not an address.** Since the split of the two reading
 *      surfaces across two route entries
 *      (`docs/adr/0012-two-route-entries-for-two-reading-surfaces.md`), the
 *      mobile surface has a route of its own, reached by a rewrite that
 *      leaves the reader's address at `/p/<n>`. Left reachable, it would be
 *      a second address for every page in the book - so `apps/web/middleware.ts`
 *      sends it back to the first, and BOTH entries answer `/p/<n>` with the
 *      same title, description and canonical link. A mobile-user-agent
 *      crawler (Googlebot's smartphone crawler is one) is served the mobile
 *      entry, so metadata that held in only one of them would be metadata
 *      half the crawlers never saw.
 *   5. **`?pages=all` points back at `/p/<n>`.** The book asks for the rest
 *      of itself by putting that query on the address it is already on
 *      (`docs/adr/0009-server-rendered-page-window.md`), which makes it a
 *      real, reachable URL serving the same page under a second address. A
 *      canonical link is what stops that from being duplicate content, and
 *      ADR 0009's own concerns list asked Task 13 for it by name.
 *   6. **There is a `robots.txt`, and it invites the diary in.** Every promise
 *      above is about being indexable; serving no robots.txt at all leaves
 *      that permissive by omission rather than by decision, which is not what
 *      `SECURITY.md` asks for. `apps/web/public/robots.txt` is the file, and
 *      its own header records what Phase 4 owes: a generated route that reads
 *      `site.indexGalleries`, plus the `X-Robots-Tag` half of the same
 *      requirement.
 *
 * THE GALLERY CASE IS THE ONE THAT WILL OUTLIVE THIS TASK. The spec calls it
 * out specifically — "returning from a gallery restores `/p/<n>`, not `/`" —
 * and `/gallery/<slug>` is Task 14's to build. The case does not wait for it:
 * `Notes.tsx` and `FramesII.tsx` already render the gallery button as a real
 * `<a href="/gallery/<slug>">` (Task 10/11, deliberately, so it would be a
 * navigation rather than a click handler), and a navigation to a route that
 * does not exist yet is still a navigation with a history entry. So the case
 * turns pages, clicks the real link, goes back, and requires the address the
 * reader was on. It passes today against a 404 and it will keep passing when
 * Task 14 puts a gallery there — the thing under test is the diary's history
 * behaviour, which is this task's, not the gallery's markup, which is not.
 *
 * What makes it work is `Book.tsx`'s `history.replaceState`: the reader's
 * page is written onto the CURRENT history entry rather than pushed as a new
 * one, so the entry the gallery link pushes from already reads `/p/5`. Were
 * the book to write the address with a push, or not at all, this case fails.
 * THE PAGE-NOT-FOUND VIEW'S OWN AXE CASE IS IN `e2e/a11y.spec.ts`, not here,
 * beside the six diary pages' - that file is where "every route has one" can
 * be read off in a single list, and splitting it would be the beginning of
 * the drift `e2e/ciRegistration.spec.ts` exists to stop.
 * Depends on: @playwright/test, `WHOLE_BOOK_QUERY`
 * (@travel-diary/domain/contentWindow), `waitForLiveBook` (./support/liveBook),
 * the running app from
 * playwright.config.ts's `webServer`, and the seeded diary
 * (`npm run db:seed`): 10 journeys, 33 pages, the first of them Tokyo.
 */
import { WHOLE_BOOK_QUERY } from '@travel-diary/domain/contentWindow'
import { expect, test } from '@playwright/test'
import { waitForLiveBook } from './support/liveBook'
import { drawsMobileReadingMode } from './support/surface'

/**
 * A phone's user agent, which is what gets a request served the mobile
 * reading surface's own route entry (@travel-diary/domain/readingSurface).
 * Named here rather than taken from the project, so the two cases about the
 * two surfaces' agreement ask BOTH questions wherever they run.
 */
const PHONE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

/** A desktop browser's user agent, which names no device kind and so gets the book. */
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/** The flip's own duration, plus the arming and settling either side of it. */
const A_WHOLE_TURN_MS = 1_100

/** The value of a `<meta name="...">` in a raw HTML document. */
const metaContent = (html: string, name: string): string | null => {
  const match = new RegExp(`<meta name="${name}" content="([^"]*)"`).exec(html)
  return match?.[1] ?? null
}

/** The `href` of the document's `<link rel="canonical">`, if it has one. */
const canonicalHref = (html: string): string | null => {
  const match = /<link rel="canonical" href="([^"]*)"/.exec(html)
  return match?.[1] ?? null
}

/** The document's `<title>`, if it has one. */
const documentTitle = (html: string): string | null => {
  const match = /<title>([^<]*)<\/title>/.exec(html)
  return match?.[1] ?? null
}

test('serves a page’s own content in the HTML, for a crawler that runs no script', async ({ request }) => {
  const html = await (await request.get('/p/3')).text()

  expect(html).toContain('Tokyo')
})

test('serves a robots.txt, and one that lets a crawler read the diary', async ({ request }) => {
  // Every promise above is about a deep link being indexable, and until the
  // Phase 1 final review this repository served no robots.txt at all. That is
  // permissive by omission rather than by decision, and it is not what
  // SECURITY.md asks for: it requires `site.indexGalleries` respected "in
  // robots.txt AND with X-Robots-Tag". The setting defaults to true
  // (apps/web/globals/site.ts) and the Settings screen that could change it is
  // Phase 4, so the file that matches the default is the only honest one to
  // serve today - and this case is what says so out loud, and what fails if the
  // file is ever dropped. Phase 4 replaces the static file with a generated
  // route that reads the setting; docs/security.md's own row records that debt.
  const response = await request.get('/robots.txt')
  const body = await response.text()

  expect(response.status()).toBe(200)
  expect(body).toContain('User-agent: *')
  expect(body).toContain('Allow: /')
  // The admin is authenticated, so nothing behind it is indexable anyway; it is
  // named so a crawler does not spend requests finding that out.
  expect(body).toContain('Disallow: /cms')
  // Nothing here may forbid the diary itself. A `Disallow: /p/` would undo
  // every other case in this file without failing one of them.
  expect(body).not.toMatch(/^Disallow: \/(p|gallery)?$/m)
})

test('answers an out-of-range page number with a 404 rather than a page the reader did not ask for', async ({
  request,
}) => {
  expect((await request.get('/p/999')).status()).toBe(404)
})

test('answers the page number one past the end of the book with a 404', async ({ request }) => {
  expect((await request.get('/p/34')).status()).toBe(404)
})

test('answers page zero with a 404, since the first page a reader sees is page one', async ({ request }) => {
  expect((await request.get('/p/0')).status()).toBe(404)
})

test('answers an address that is not a page number at all with a 404, not a crash', async ({ request }) => {
  expect((await request.get('/p/tokyo')).status()).toBe(404)
})

test('still serves the last real page of the book, so the 404 boundary is off by nothing', async ({ request }) => {
  expect((await request.get('/p/33')).status()).toBe(200)
})

test('shows the reader a way back into the book when there is no such page', async ({ page }) => {
  const response = await page.goto('/p/999')

  expect(response?.status()).toBe(404)
  await expect(page.getByRole('link', { name: /open the diary/i })).toHaveAttribute('href', '/p/1')
})

test('titles each page for what is printed on it, not for the book it is in', async ({ request }) => {
  const notes = documentTitle(await (await request.get('/p/3')).text())
  const framesI = documentTitle(await (await request.get('/p/4')).text())

  expect(notes).toBe('Tokyo — Notes · Wanderings')
  expect(framesI).toBe('Tokyo — Frames I · Wanderings')
})

test('describes each page for what is printed on it, so two deep links are not one result', async ({ request }) => {
  const notes = metaContent(await (await request.get('/p/3')).text(), 'description')
  const framesI = metaContent(await (await request.get('/p/4')).text(), 'description')

  expect(notes).toContain('Tokyo')
  expect(framesI).toContain('Tokyo')
  expect(notes).not.toBe(framesI)
})

test('sends the mobile surface’s own route back to the page’s one public address', async ({ request }) => {
  // `/m/<n>` is where the mobile reading surface's route entry lives so the
  // bundler has two entries to split (ADR 0012); it is not an address. Left
  // reachable it would give every page in the book a second URL.
  const response = await request.get('/m/3', { maxRedirects: 0 })

  expect(response.status()).toBe(308)
  expect(new URL(response.headers()['location'] ?? '', 'http://localhost').pathname).toBe('/p/3')
})

test('answers /m/<n> for a page the book does not have with a redirect, not a second 404 path', async ({ request }) => {
  expect((await request.get('/m/999', { maxRedirects: 0 })).status()).toBe(308)
})

test('titles a page the same on both reading surfaces, since a crawler may be served either', async ({ request }) => {
  const book = await (await request.get('/p/3', { headers: { 'user-agent': DESKTOP_USER_AGENT } })).text()
  const mobile = await (await request.get('/p/3', { headers: { 'user-agent': PHONE_USER_AGENT } })).text()

  expect(documentTitle(mobile)).toBe(documentTitle(book))
  expect(documentTitle(mobile)).toBe('Tokyo — Notes · Wanderings')
})

test('describes a page the same on both reading surfaces, and points both at the same canonical', async ({
  request,
}) => {
  const book = await (await request.get('/p/3', { headers: { 'user-agent': DESKTOP_USER_AGENT } })).text()
  const mobile = await (await request.get('/p/3', { headers: { 'user-agent': PHONE_USER_AGENT } })).text()

  expect(metaContent(mobile, 'description')).toBe(metaContent(book, 'description'))
  expect(canonicalHref(mobile)).toBe('/p/3')
  expect(canonicalHref(book)).toBe('/p/3')
})

test('points the whole-book address back at the page’s own URL, so it is not duplicate content', async ({
  request,
}) => {
  const widened = await (await request.get(`/p/3?${WHOLE_BOOK_QUERY}`)).text()

  expect(canonicalHref(widened)).toBe('/p/3')
})

test('gives the page’s own URL the same canonical, so the two addresses agree on which is the one', async ({
  request,
}) => {
  const plain = await (await request.get('/p/3')).text()

  expect(canonicalHref(plain)).toBe('/p/3')
})

test('returning from a gallery restores the page the reader was on, not the cover', async ({ page, viewport }) => {
  // Below 860px there is no book to wait for: the diary draws SCREENS.md
  // §1.10's mobile reading mode, where the same promise is kept by ordinary
  // navigation and is asserted in `e2e/mobile.spec.ts`.
  test.skip(drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

  // Page 3 is the first journey's Notes page, which is the first page of the
  // book carrying a gallery link at all.
  await page.goto('/p/3')
  await waitForLiveBook(page)

  await page
    .getByRole('link', { name: /See full gallery/ })
    .first()
    .click()
  await page.goBack()

  await expect(page).toHaveURL(/\/p\/3$/)
})

test('returning from a gallery restores the page the reader turned to, not the one they arrived on', async ({
  page,
  viewport,
}) => {
  test.skip(drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

  // The stronger half of the same promise: the address the reader shares has
  // to be where READING took them, which is `history.replaceState`'s job on
  // every committed turn, not the address the document was served at.
  await page.goto('/p/3')
  await waitForLiveBook(page)

  // Two turns from page 3 lands on page 5, the journey's Frames II - the next
  // page after this one that carries a gallery link of its own.
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(A_WHOLE_TURN_MS)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(A_WHOLE_TURN_MS)
  await expect(page).toHaveURL(/\/p\/5$/)

  // Scoped to the leaf the reader is actually on. Every leaf of the window is
  // in the document, so an unscoped locator would find page 3's gallery link
  // as well - on a leaf that has already been turned over.
  await page
    .locator('[data-leaf="4"]')
    .getByRole('link', { name: /See full gallery/ })
    .click()
  await page.goBack()

  await expect(page).toHaveURL(/\/p\/5$/)
})
