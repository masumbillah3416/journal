/**
 * visual.spec.ts — visual regression for every page type that exists, at
 * every breakpoint.
 *
 * CLAUDE.md §2 requires a visual-regression suite covering "every page type
 * and every admin screen, at each breakpoint". Seven exist today: `/cms`
 * (Payload's own admin, which the bespoke admin replaces in a later phase)
 * and all six of the diary's page kinds - Cover, Contents and Notes from
 * Phase 1 Tasks 9 and 10, and Frames I, Frames II and About from Task 11
 * (SCREENS.md §1.1-§1.6). Every page type the book has is now covered.
 *
 * AN EIGHTH VIEW THAT IS NOT A PAGE OF THE BOOK: Task 13's page-not-found
 * view (`app/(diary)/not-found.tsx`), which an address naming no page now
 * renders instead of clamping onto page 33. The design has no 404 screen, so
 * this one is assembled from the design's own surface - desk gradient, paper
 * card, hairline rule, the three type families - and a baseline is what stops
 * it from drifting away from them unnoticed. Its case is the only one here
 * that does not call `settled`: there is no scaled design box on it to wait
 * for, only the fonts.
 *
 * THE TASK 12 REGENERATION (all six `diary-*` cases, eighteen images) is the
 * chrome. SCREENS.md §1.7's bookmark rail, bottom bar and spine ribbon sit
 * OUTSIDE the scaled design box and were, until Task 12, behaviour only — a
 * column of plain one-line tabs, two guillemet arrows and a bare counter.
 * Every diary case here snapshots the FULL PAGE (see below), so every one of
 * them carried that interim chrome and every one of them moves. What replaces
 * it: the "Bookmarks" eyebrow, thirteen two-line tabs each with its tint bar,
 * the active tab lifted 6px onto the page in the page's own paper, the 58px
 * bar with its circular arrows and the page label under the counter, and the
 * ribbon hanging off the top-left of the board. This file's earlier revision
 * predicted exactly this ("that task updates these files, which is expected
 * and is what a baseline is for"); it is six cases rather than three because
 * Task 11 added three more page types in between. The three `/cms` baselines
 * are untouched — that route has its own root layout and never sees the
 * diary's chrome or its stylesheet — and were not regenerated.
 *
 * THE TASK 11 BASELINES (`diary-frames-i-*`, `diary-frames-ii-*`,
 * `diary-about-*`) were captured in the same pinned-container run as the
 * regeneration of the six that already existed, with `e2e/layout.spec.ts`
 * green in that run, and every resulting image was opened and looked at
 * before being committed. The six older files moved because `/p/1` renders
 * every leaf of the book at once: replacing thirty heading-only fallbacks
 * with thirty designed pages changes what is drawn behind the current leaf on
 * every one of these screenshots.
 *
 * THE NOTES BASELINES (Task 10) also forced the six `diary-cover-*`/
 * `diary-contents-*` files to be regenerated in the same run, and that is
 * expected rather than damage: `/p/3` now renders a real designed page where
 * it previously rendered a heading and a meta line, and every leaf of the
 * book is in every screenshot. All twelve files in this directory were
 * captured together, in one `mcr.microsoft.com/playwright:v1.62.1-noble` run,
 * with `e2e/layout.spec.ts` green in the same run (see below) and every
 * resulting image opened and looked at before being committed.
 *
 * THE `mobile` PROJECT NOW PHOTOGRAPHS A DIFFERENT SURFACE, and that is what
 * moved seven of these files in Phase 1 Task 15. Below 860px the diary draws
 * SCREENS.md §1.10's mobile reading mode instead of the book - no design box,
 * no leaves, no scaling - so `diary-cover-mobile`, `diary-contents-mobile`,
 * `diary-notes-mobile`, `diary-frames-i-mobile`, `diary-frames-ii-mobile` and
 * `diary-about-mobile` are now pictures of that surface, and a seventh case
 * joins them: `diary-mobile-drawer`, the bookmark panel, which exists at the
 * `mobile` project alone because it is §1.10's replacement for the book's
 * 158px rail. Those six images were the least useful in this directory - a
 * whole book at roughly a third scale - and are now the only baseline the
 * mobile mode has. `settled` reads WHICH surface it is looking at off the
 * document rather than off the project's viewport; see its own comment.
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
 * chrome outside the box — the bookmark rail and the bottom bar — and, inside
 * the box but drawn over the page, the spine ribbon. That is why Task 12
 * moved every one of them; see above.
 *
 * FONTS: all three Google Fonts the handoff specifies (Caveat, EB Garamond,
 * Courier Prime) are self-hosted via `next/font/local`, at all five faces the
 * design actually uses — Caveat 400, EB Garamond 400 upright AND italic,
 * Courier Prime 400 AND 700. The first two landed with the font-hosting task
 * (docs/adr/0005-font-hosting.md); the other three had been deferred on an
 * LCP measurement and were wired in later
 * (docs/adr/0008-lcp-budget-and-the-framework-floor.md), which is why every
 * baseline in this file has now been regenerated a second time. Until that
 * point these images showed the Courier eyebrows, dates, counters, badge
 * labels and stamps in a generic monospace, and every Garamond italic as a
 * synthesised slant of the upright; they now carry the design's real
 * typography throughout. The three `/cms` baselines are regenerated in the
 * same run for a matched, dated set (that page never uses
 * `@travel-diary/tokens`, so it is unaffected in substance).
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
import { expect, test, type Page } from '@playwright/test'
import { drawsMobileReadingMode } from './support/surface'

// OFF LINUX THIS FILE SKIPS, AND SAYING SO IS THE POINT.
//
// Every baseline here is `-linux.png`, generated in the pinned container for
// the reason given at the top of this file. Playwright names the file it wants
// after the host platform, so a Windows or macOS run asks for `-win32.png` or
// `-darwin.png`, finds nothing, WRITES one, and every run after that compares
// the host against itself and passes. That is not a hypothetical: 31 such
// files were found untracked in this directory, and a full local suite
// reported "394 passed" while these cases compared against baselines the host
// had quietly minted for itself. The committed baselines - the ones CI gates
// on - were never read.
//
// Skipping rather than failing is deliberate. On a Windows host there is no
// correct baseline to compare against, so a failure would be noise a developer
// learns to scroll past, and a pass is a lie. "Not run here, and here is how
// to run it" is the only honest third option. `.gitignore` refuses the
// host-platform files as well, so they cannot come back and be believed.
test.skip(
  process.platform !== 'linux',
  'visual baselines are -linux.png, generated in mcr.microsoft.com/playwright:v1.62.1-noble — run this suite in that container (see the header) rather than on the host',
)

/**
 * Waits for a diary page to be drawn, scaled, fonted and decoded before it is
 * screenshotted.
 *
 * All four waits are needed and none is a timeout. The section itself is
 * server-rendered but `useBookScale` sets the transform on the client, so a
 * snapshot taken before that lands catches an unscaled box. The three
 * self-hosted families use `font-display: swap`, so the first paint can still
 * show a fallback face. And `networkidle` is not enough on a page with
 * photographs: an image can be fetched and still be undecoded when the
 * screenshot is taken, which is a race rather than drift - every image in the
 * document is awaited, not only this leaf's, because a sibling leaf still
 * decoding can repaint mid-capture.
 * @param page - The Playwright page, already navigated.
 * @param selector - The page section to wait for, scoped to its own leaf.
 */
const settled = async (page: Page, selectors: { readonly book: string; readonly mobile: string }): Promise<void> => {
  // WHICH SURFACE THIS DOCUMENT IS is read off the document rather than off
  // the project's viewport, because it is the server that decided it: below
  // 860px `/p/<n>` renders SCREENS.md §1.10's mobile reading mode instead of
  // the book, so there is no design box to wait for and a different marker to
  // wait on. Both are server-rendered, so this count is settled before the
  // first paint and is not a race.
  const designBox = page.locator('[data-design-box]')
  if ((await designBox.count()) > 0) {
    await expect(page.locator(selectors.book)).toBeVisible()
    await expect(designBox).toHaveAttribute('style', /scale\(/)
  } else {
    await expect(page.locator(selectors.mobile)).toBeVisible()
  }

  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(async () => {
    await Promise.all([...document.images].filter((image) => image.src !== '').map((image) => image.decode()))
  })
}

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
  await settled(page, { book: '[data-page="cover"]', mobile: '[data-mobile-page="cover"]' })

  await expect(page).toHaveScreenshot('diary-cover.png', { fullPage: true })
})

test('matches the baseline screenshot of the Contents page', async ({ page }) => {
  await page.goto('/p/2', { waitUntil: 'networkidle' })
  await settled(page, { book: '[data-page="contents"]', mobile: '[data-mobile-page="contents"]' })

  await expect(page).toHaveScreenshot('diary-contents.png', { fullPage: true })
})

test('matches the baseline screenshot of a journey’s Notes page', async ({ page }) => {
  await page.goto('/p/3', { waitUntil: 'networkidle' })
  // Scoped to leaf 2: all ten notes pages are in the document at once (see
  // e2e/notes.spec.ts's header), so an unscoped locator is a strict-mode
  // violation rather than a wait.
  await settled(page, { book: '[data-leaf="2"] [data-page="notes"]', mobile: '[data-mobile-page="notes"]' })

  await expect(page).toHaveScreenshot('diary-notes.png', { fullPage: true })
})

test('matches the baseline screenshot of a journey’s Frames I page', async ({ page }) => {
  await page.goto('/p/4', { waitUntil: 'networkidle' })
  await settled(page, { book: '[data-leaf="3"] [data-page="frames-i"]', mobile: '[data-mobile-page="frames-i"]' })

  await expect(page).toHaveScreenshot('diary-frames-i.png', { fullPage: true })
})

test('matches the baseline screenshot of a journey’s Frames II page', async ({ page }) => {
  await page.goto('/p/5', { waitUntil: 'networkidle' })
  await settled(page, { book: '[data-leaf="4"] [data-page="frames-ii"]', mobile: '[data-mobile-page="frames-ii"]' })

  await expect(page).toHaveScreenshot('diary-frames-ii.png', { fullPage: true })
})

test('matches the baseline screenshot of the About page', async ({ page }) => {
  await page.goto('/p/33', { waitUntil: 'networkidle' })
  await settled(page, { book: '[data-leaf="32"] [data-page="about"]', mobile: '[data-mobile-page="about"]' })

  await expect(page).toHaveScreenshot('diary-about.png', { fullPage: true })
})

test('matches the baseline screenshot of the page-not-found view', async ({ page }) => {
  // A route with no book on it, so `settled` — which waits for the scaled
  // design box — does not apply. What has to be settled here is the type: all
  // three families are used on this view, and a screenshot taken before they
  // load is a screenshot of the fallback stack.
  await page.goto('/p/999', { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)

  await expect(page).toHaveScreenshot('diary-not-found.png', { fullPage: true })
})

test('matches the baseline screenshot of a journey’s full gallery', async ({ page }) => {
  // A route with no book on it, so `settled` - which waits for the scaled
  // design box - does not apply. What has to be settled here is the type and
  // the tiles: the grid loads lazily (SCREENS.md §1.8), so only the images
  // the browser has actually decided to fetch are awaited, and the rest are
  // below the fold and outside the shot.
  await page.goto('/gallery/patagonia', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-tile]').first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(async () => {
    await Promise.all(
      [...document.images].filter((image) => image.complete && image.src !== '').map((image) => image.decode()),
    )
  })

  // Not `fullPage`: sixty-one tiles is several viewports of scroll, and a
  // baseline that tall is a baseline nobody reads a diff of. The viewport is
  // the header, the tracks and the first rows - which is every rule §1.8
  // states.
  await expect(page).toHaveScreenshot('diary-gallery.png')
})

test('matches the baseline screenshot of the lightbox over that gallery', async ({ page }) => {
  await page.goto('/gallery/patagonia', { waitUntil: 'networkidle' })
  await page.locator('[data-tile]').nth(2).click()
  await expect(page.locator('[data-lightbox]')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(async () => {
    const open = document.querySelector('[data-lightbox-image]')
    if (open instanceof HTMLImageElement) await open.decode()
  })

  await expect(page).toHaveScreenshot('diary-lightbox.png')
})

test('matches the baseline screenshot of the bookmark drawer over the mobile reading mode', async ({
  page,
  viewport,
}) => {
  // The one view in this suite that exists at a single project. The drawer is
  // SCREENS.md §1.10's replacement for the book's 158px bookmark rail, so
  // there is no wider-viewport counterpart of it to baseline - and it is the
  // only part of the mobile surface that never appears in the six diary
  // baselines above, since it is drawn only when a reader asks for it.
  test.skip(!drawsMobileReadingMode(viewport), 'the bookmark drawer belongs to the mobile reading mode')

  await page.goto('/p/3', { waitUntil: 'networkidle' })
  await settled(page, { book: '[data-leaf="2"] [data-page="notes"]', mobile: '[data-mobile-page="notes"]' })
  await page.locator('[data-burger]').click()
  await expect(page.locator('[data-drawer]')).toBeVisible()

  await expect(page).toHaveScreenshot('diary-mobile-drawer.png')
})
