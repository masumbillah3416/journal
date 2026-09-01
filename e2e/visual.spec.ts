/**
 * visual.spec.ts — visual regression mechanism, proven against the one route
 * that exists.
 *
 * CLAUDE.md §2 requires a visual-regression suite covering "every page type
 * and every admin screen, at each breakpoint" once those pages exist. The
 * public diary and the bespoke admin panel are Phase 1+ (see smoke.spec.ts's
 * header) — the design they will guard is not built yet, so this file cannot
 * honestly cover them. What it *can* do today is prove the mechanism itself
 * works: `/cms` (Payload's own admin, already live per
 * `apps/web/payload.config.ts`) is snapshotted at all three breakpoint
 * projects, using the same `toHaveScreenshot` machinery, thresholds
 * (`playwright.config.ts`'s `maxDiffPixelRatio`) and baseline-vs-diff
 * workflow that will guard the real diary and admin screens later.
 *
 * Baselines live in `e2e/visual.spec.ts-snapshots/` (one file per project,
 * auto-named by Playwright) and are committed — a snapshot with no baseline
 * to compare against protects nothing.
 * Depends on: @playwright/test, the running app from playwright.config.ts's
 * `webServer`.
 */
import { expect, test } from '@playwright/test'

test('matches the baseline screenshot of /cms', async ({ page }) => {
  await page.goto('/cms', { waitUntil: 'networkidle' })

  // Payload renders its create-first-user/login form asynchronously; wait for
  // the form rather than a fixed timeout, so the snapshot is never taken
  // mid-render (a flaky "diff" that is really just a race).
  await expect(page.locator('form')).toBeVisible()

  // In local dev mode (not CI's production build), Next/Turbopack briefly
  // shows its own "Rendering..." dev-tools overlay while it lazily compiles
  // a route on first request — real, but not part of the app under test.
  // Under concurrent workers hitting a cold route at once, that overlay can
  // still be up when `form` becomes visible; this is a flaky *false*
  // diff, not drift, so it is waited out rather than snapshotted.
  await expect(page.getByText(/Rendering/)).toBeHidden()

  await expect(page).toHaveScreenshot('cms-admin.png', { fullPage: true })
})
