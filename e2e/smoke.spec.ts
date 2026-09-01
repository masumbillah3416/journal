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
 * diary page added with the book itself (Task 7). Add one `test()` per route
 * as routes are built; do not assert against a route that does not exist yet.
 * Depends on: @playwright/test, the running app from playwright.config.ts's
 * `webServer`.
 */
import { expect, test } from '@playwright/test'

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
