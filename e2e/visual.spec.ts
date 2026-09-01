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
 * FONTS: the three Google Fonts the handoff specifies (Caveat, EB Garamond,
 * Courier Prime) are self-hosted via `next/font/local` as of the font-hosting
 * task (docs/adr/0005-font-hosting.md) — every diary baseline below now
 * carries the real typefaces, not the `cursive`/`serif`/`monospace`
 * fallbacks the six original Cover/Contents baselines were captured in. All
 * nine baselines in this file were regenerated together in the pinned
 * container the day the fonts landed, including the three `/cms` ones (that
 * page never uses `@travel-diary/tokens`, so its baseline is unaffected in
 * substance, but it is regenerated in the same run for a matched, dated set).
 * `document.fonts.ready` is awaited before every screenshot below —
 * `font-display: swap` means the very first paint can still show a fallback
 * face while the self-hosted file is fetched, and a snapshot taken during
 * that window is a race, not drift.
 *
 * COVER CONTRAST: the three `diary-cover-*` baselines were regenerated again,
 * in the same pinned container, when the cover's cloth was made opaque across
 * its gradient and the years line's alpha raised to `.78` to bring all five
 * cover lines to WCAG AA (docs/deviations.md §12). They were regenerated with
 * `--update-snapshots=all` rather than the default `changed` mode: at 390px
 * the book is drawn at roughly a third scale, and the `mobile` cover's diff
 * came in UNDER `maxDiffPixelRatio` — so `changed` would have left that one
 * baseline showing the old, failing cover while still reporting a pass, which
 * is exactly the kind of quietly-stale baseline this file exists to prevent.
 * The `/cms` and Contents baselines are untouched by that change and were not
 * regenerated.
 *
 * THE BOOK: all six `diary-*` baselines were regenerated again, in the same
 * pinned container, when the scaled book was centred in the area
 * `useBookScale` measures (`apps/web/components/book/book.module.css`
 * `.bookArea`). What they replaced is the reason `e2e/layout.spec.ts` exists.
 * The `mid` and `mobile` files had been regenerated OVER the defect — the
 * committed `diary-cover-mobile-linux.png` was a picture of the bookmark
 * rail, the counter and two arrows on empty paper, with no book on the page
 * at all, and it had been passing ever since (docs/qa/2026-09-01-diary-sweep.md,
 * DIARY-004). A baseline can only say "this looks like it did last time"; it
 * cannot say "the book is on the screen", because a picture of no book is
 * still a picture, and this suite ratified the S1 defect it was meant to
 * catch. Regenerating these files is therefore only half of that fix. The
 * other half is `e2e/layout.spec.ts`, which asserts in numbers — at all three
 * projects — that the design box is inside the area its scale was measured
 * from, concentric with it, and that `document.elementFromPoint` at that
 * area's centre lands inside the book. Never regenerate a `diary-*` baseline
 * without that suite green in the same run.
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

  // The three self-hosted families use `font-display: swap`, so the first
  // paint can still be showing a fallback face. Waiting for
  // `document.fonts.ready` is what makes this snapshot deterministic rather
  // than a race against the font fetch.
  await page.evaluate(() => document.fonts.ready)

  await expect(page).toHaveScreenshot('diary-cover.png', { fullPage: true })
})

test('matches the baseline screenshot of the Contents page', async ({ page }) => {
  await page.goto('/p/2', { waitUntil: 'networkidle' })

  await expect(page.locator('[data-page="contents"]')).toBeVisible()
  await expect(page.locator('[data-design-box]')).toHaveAttribute('style', /scale\(/)
  await page.evaluate(() => document.fonts.ready)

  await expect(page).toHaveScreenshot('diary-contents.png', { fullPage: true })
})
