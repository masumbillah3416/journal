/**
 * smoke.spec.ts — zero-console-error gate for every route this app serves.
 *
 * This is the single most important suite in the harness. The handoff's own
 * defect log (CLAUDE.md §10, SCREENS.md) is mostly *silent* failures — a
 * swallowed click, a missing derivative, a rejected autoplay promise — none
 * of which move a pixel, so a screenshot-only check would pass right through
 * them. `console` (error level) and `pageerror` listeners are attached
 * *before* navigation, so nothing fired during the initial load can be missed.
 *
 * Two routes exist today: `/cms` (Payload's own admin, mounted per
 * `apps/web/payload.config.ts`'s `routes.admin`) and `/p/<n>`, the public
 * diary page added with the book itself (Task 7), and the gallery route and
 * its lightbox (Task 14). Phase 2 Task 7 adds a third surface, the bespoke
 * admin's `/admin/sign-in`. Add one `test()` per route
 * as routes are built; do not assert against a route that does not exist yet.
 *
 * The last case covers an address no route file declares and every browser
 * asks for anyway. It is asserted with `request.get` rather than by watching
 * a page load, because whether a browser fetches `/favicon.ico` at all
 * depends on the browser and on whether it is headed: the sweep's headed run
 * recorded the 404 as a console error on every cold load and Lighthouse
 * recorded it on a production build, while the two headless cases above
 * stayed green through the whole defect. A direct request is the reproduction
 * that does not depend on that difference.
 * Depends on: @playwright/test, the running app from playwright.config.ts's
 * `webServer`.
 */
import { expect, test } from '@playwright/test'
import { drawsMobileReadingMode } from './support/surface'

test('loads /cms without console errors or page errors', async ({ page }) => {
  const errors: string[] = []

  // Attached before goto(): a listener registered after navigation starts
  // can miss errors thrown during the initial document load.
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })

  const response = await page.goto('/cms', { waitUntil: 'networkidle' })

  // A route that 500s never reaches the console-error checks below with a
  // meaningful failure message — assert the transport succeeded first.
  expect(response?.ok(), `expected /cms to respond 2xx, got ${String(response?.status())}`).toBe(true)

  // React hydration runs after the `load`/`networkidle` navigation events
  // resolve, and a hydration-time warning or error — exactly the kind of
  // silent defect this suite exists to catch — can land a beat later than
  // either of those. A fixed grace period is unglamorous but reliable here;
  // there is no DOM signal to wait on for "hydration finished" in general.
  await page.waitForTimeout(500)

  expect(errors).toEqual([])
})

test('loads /p/1 without console errors or page errors', async ({ page }) => {
  const errors: string[] = []

  // Attached before goto(), for the same reason as the /cms case above.
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })

  const response = await page.goto('/p/1', { waitUntil: 'networkidle' })

  expect(response?.ok(), `expected /p/1 to respond 2xx, got ${String(response?.status())}`).toBe(true)

  // The book hydrates into a client component that measures its container and
  // sets a scale; a hydration mismatch between the server's unmeasured render
  // and the client's would surface here, a beat after networkidle, and
  // nowhere else.
  await page.waitForTimeout(500)

  expect(errors).toEqual([])
})

test('loads /admin/sign-in without console errors or page errors', async ({ page }) => {
  const errors: string[] = []

  // Attached before goto(), for the same reason as the two cases above.
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })

  const response = await page.goto('/admin/sign-in', { waitUntil: 'networkidle' })

  expect(response?.ok(), `expected /admin/sign-in to respond 2xx, got ${String(response?.status())}`).toBe(true)

  // The password pane is a client component rendered by a server one, so a
  // hydration mismatch - the class of defect that would appear if any of its
  // markup were decided in the browser rather than on the server - lands a
  // beat after networkidle and nowhere else. That is precisely what this
  // screen must not do: the code-step footer is the server's answer.
  await page.waitForTimeout(500)

  expect(errors).toEqual([])
})

test('preloads no stylesheet the page then never uses', async ({ page, viewport }) => {
  // PH1-005, and the same class as DIARY-006 (docs/qa/2026-09-01-diary-sweep.md),
  // which was fixed rather than tolerated: a clean load prints nothing to the
  // console. Chrome warns when a `link rel=preload` goes unused "within a few
  // seconds from the window's load event", so the wait below is the warning's
  // own window rather than a guess - the assertion is the ABSENCE of output,
  // which needs a bounded one.
  //
  // WARNING level, not error: this is the level the sweep found it at, and
  // nothing else in this suite watches it. Filtered to the preload warning
  // rather than asserting an empty array, so an unrelated third-party notice
  // does not make this case about something else.
  if (drawsMobileReadingMode(viewport)) {
    // The mobile surface is a different route entry with its own document
    // (docs/adr/0012), and its console is silent - this defect was the book
    // surface's. `/p/<n>` at this project serves the mobile mode, so there is
    // no book document here to instrument.
    test.skip()
  }

  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning') {
      warnings.push(message.text())
    }
  })

  await page.goto('/p/3', { waitUntil: 'load' })
  await page.waitForTimeout(4_000)

  expect(warnings.filter((text) => text.includes('was preloaded using link preload but not used'))).toEqual([])
})

test('walks every page kind of the mobile reading mode without console errors', async ({ page, viewport }) => {
  // The `/p/1` case above already instruments the mobile surface's Cover at
  // the `mobile` project, since that route serves whichever surface the
  // reader's device asks for (SCREENS.md §1.10,
  // docs/adr/0011-two-reading-surfaces-chosen-on-the-server.md). What it
  // cannot cover is the surface's OTHER three page kinds, its drawer and its
  // one hydration-time swap - a phone reader meets all of them and none of
  // them was instrumented until this case existed. Every failure this suite
  // exists to catch on this surface is silent: a hydration mismatch between
  // the server's `served` surface and the client's measured one, an image
  // whose derivative 404s behind a mount that still lays out perfectly, a
  // drawer that throws on open.
  test.skip(!drawsMobileReadingMode(viewport), 'the mobile reading mode is not drawn at or above 860px')

  const errors: string[] = []
  const failed: string[] = []

  // Attached before the first goto(), for the same reason as the cases above.
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${String(response.status())} ${response.url()}`)
  })

  // Cover, Contents, a Notes page, a Frames page and About - §1.10's four
  // kinds, with both of the journey page's shapes.
  for (const path of ['/p/1', '/p/2', '/p/3', '/p/4', '/p/33']) {
    const response = await page.goto(path, { waitUntil: 'networkidle' })
    expect(response?.ok(), `expected ${path} to respond 2xx, got ${String(response?.status())}`).toBe(true)
    await expect(page.locator('[data-mobile-page]')).toBeVisible()
  }

  await page.locator('[data-burger]').click()
  await expect(page.locator('[data-drawer]')).toBeVisible()

  // The same grace period the cases above use: a hydration-time error lands a
  // beat after `networkidle`, and there is no DOM signal for "hydration
  // finished" to wait on instead.
  await page.waitForTimeout(500)

  expect({ errors, failed }).toEqual({ errors: [], failed: [] })
})

test('loads a journey’s gallery, and its open lightbox, without console errors', async ({ page }) => {
  const errors: string[] = []

  // Attached before goto(), for the same reason as the two cases above.
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })

  const response = await page.goto('/gallery/patagonia', { waitUntil: 'networkidle' })

  expect(response?.ok(), `expected the gallery to respond 2xx, got ${String(response?.status())}`).toBe(true)

  // THE LIGHTBOX IS OPENED INSIDE THIS CASE, not left to
  // `e2e/gallery.spec.ts`. It is a client component that mounts a document
  // key listener, moves focus and reads `navigator`; every one of those is a
  // way to throw at mount rather than at assertion time, and this is the only
  // suite watching `pageerror` at all. The grid's own hydration - sixty-one
  // tiles arriving as props into a `'use client'` boundary - is what the
  // first half of the case covers.
  await page.locator('[data-tile]').nth(2).click()
  await expect(page.locator('[data-lightbox]')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Escape')

  await page.waitForTimeout(500)

  expect(errors).toEqual([])
})

/** The address with no page behind it, used by the case below and its filter. */
const NO_SUCH_PAGE = '/p/999'

test('renders the page-not-found view without console errors or page errors', async ({ page }) => {
  const errors: string[] = []

  // Attached before goto(), for the same reason as the two cases above.
  page.on('console', (message) => {
    // THE ONE EXPECTED CONSOLE ERROR ON THIS ROUTE, EXCLUDED BY ITS SOURCE
    // URL RATHER THAN BY ITS TEXT. Chromium logs "Failed to load resource:
    // the server responded with a status of 404 (Not Found)" for the
    // DOCUMENT's own response, and a 404 is the correct response here - the
    // whole point of the route. The message text does not name the resource,
    // so filtering on the text would also swallow a genuinely broken
    // stylesheet, font or image on this page; `location().url` does name it,
    // and it is the address under test only for the document's own entry.
    if (message.type() === 'error' && message.location().url.endsWith(NO_SUCH_PAGE)) return
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })

  const response = await page.goto(NO_SUCH_PAGE, { waitUntil: 'networkidle' })

  // A 404 is the CORRECT response here, so `ok()` is the wrong assertion -
  // what this case is about is that a route which deliberately throws
  // `notFound()` renders its view cleanly rather than logging on the way.
  expect(response?.status(), 'an address with no page must be 404, not 200 or 500').toBe(404)
  await page.waitForTimeout(500)

  expect(errors).toEqual([])
})

test('serves an icon at /favicon.ico, which a browser asks for without being told to', async ({ request }) => {
  const response = await request.get('/favicon.ico')

  expect(response.status(), 'a cold load must not report a failed response').toBe(200)
})
