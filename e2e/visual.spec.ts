/**
 * visual.spec.ts — visual regression for every page type that exists, at
 * every breakpoint.
 *
 * CLAUDE.md §2 requires a visual-regression suite covering "every page type
 * and every admin screen, at each breakpoint". Three exist today: `/cms`
 * (Payload's own admin, which the bespoke admin replaces in a later phase)
 * and the diary's Cover and Contents pages, whose designs landed in Phase 1
 * Task 9 (SCREENS.md §1.1, §1.2). Notes, Frames I/II and About join this file
 * as Tasks 10 and 11 build them.
 *
 * BASELINES ARE GENERATED INSIDE `mcr.microsoft.com/playwright:v1.62.1-noble`,
 * never on a developer's Windows or macOS host (Task 1). Font rasterisation,
 * subpixel rounding and scrollbar metrics differ enough between platforms that
 * a host-generated baseline cannot honestly be compared against CI's Ubuntu
 * runner — every file here is therefore `-linux.png`, and the fix for a
 * platform mismatch is to regenerate in the container, never to loosen
 * `playwright.config.ts`'s `maxDiffPixelRatio`. See
 * `.superpowers/sdd/2026-09-01-phase-1-public-diary/task-1-report.md` for the
 * container invocation.
 *
 * The diary cases snapshot the FULL PAGE rather than the scaled design box,
 * because the design box is drawn with `transform: scale(k)` and what a reader
 * at 390px actually sees is the scaled result — a box-only snapshot would be
 * identical at all three projects and would prove nothing about the
 * breakpoints. The consequence is that these baselines also carry the diary
 * chrome outside the box (bookmark rail, bottom bar), whose designed
 * appearance is Task 12; that task updates these three files, which is
 * expected and is what a baseline is for.
 *
 * KNOWN FIDELITY GAP, recorded rather than hidden: the three Google Fonts the
 * handoff specifies (Caveat, EB Garamond, Courier Prime) are not loaded by any
 * route in this repository yet — README.md's "self-host in production" is
 * unimplemented — so every diary baseline below is rendered in the generic
 * `cursive`/`serif`/`monospace` fallbacks. The baselines still guard layout
 * and geometry drift, which is most of what this suite is for, but they do not
 * yet guard typography. They must ALL be regenerated in the same container on
 * the day the fonts land.
 *
 * Baselines live in `e2e/visual.spec.ts-snapshots/` (one file per test per
 * project, auto-named by Playwright) and are committed — a snapshot with no
 * baseline to compare against protects nothing.
 * Depends on: @playwright/test, the running app from playwright.config.ts's
 * `webServer`, and the seeded diary (`npm run db:seed`).
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

test('matches the baseline screenshot of the Cover page', async ({ page }) => {
  await page.goto('/p/1', { waitUntil: 'networkidle' })

  // Wait for the page itself, not a timeout: the book is server-rendered but
  // `useBookScale` sets the transform on the client, so a snapshot taken
  // before that lands would catch an unscaled box - a flaky false diff.
  await expect(page.locator('[data-page="cover"]')).toBeVisible()
  await expect(page.locator('[data-design-box]')).toHaveAttribute('style', /scale\(/)

  await expect(page).toHaveScreenshot('diary-cover.png', { fullPage: true })
})

test('matches the baseline screenshot of the Contents page', async ({ page }) => {
  await page.goto('/p/2', { waitUntil: 'networkidle' })

  await expect(page.locator('[data-page="contents"]')).toBeVisible()
  await expect(page.locator('[data-design-box]')).toHaveAttribute('style', /scale\(/)

  await expect(page).toHaveScreenshot('diary-contents.png', { fullPage: true })
})
