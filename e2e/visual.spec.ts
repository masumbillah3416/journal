/**
 * visual.spec.ts — visual regression for every page type that exists, at
 * every breakpoint.
 *
 * CLAUDE.md §2 requires a visual-regression suite covering "every page type
 * and every admin screen, at each breakpoint". Both halves are here: all six
 * of the diary's page kinds (SCREENS.md §1.1-§1.6), `/cms` — Payload's own
 * admin, which the bespoke admin replaces — the sign-in family, and
 * SCREENS.md §2's eleven admin screens plus the shell around them. The admin
 * half is introduced by its own banner comment further down, which is where
 * the arguments about it live; `e2e/visualBaselines.test.ts` is what counts
 * the set and fails when a screen is added without one.
 *
 * THE TWO COUNTS ABOVE ARE THE SPECIFICATION'S, NOT THIS FILE'S, and that is
 * the only kind that belongs in a header. "Six" is `SCREENS.md` §1.1-§1.6 and
 * "eleven" is its §2.1-§2.11; `visualBaselines.test.ts` reads those §2.x
 * headings off the document itself, so a twelfth screen fails a case rather
 * than quietly outdating this sentence. What this paragraph no longer carries
 * is a count of what this FILE happens to photograph — every previous revision
 * had one, and each was true for exactly one task.
 *
 * A VIEW THAT IS NOT A PAGE OF THE BOOK: Task 13's page-not-found
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
 * `docs/testing.md`'s Visual regression section for the container invocation
 * and the `npm run test:visual:container` script that runs it - Phase 2 Task
 * 7 wrote both down, because the command needed to satisfy a gate this
 * repository enforces had until then existed only in a git-ignored report.
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
 * TASK 8 ADDS ITS SECOND STATE, `admin-sign-in-code-*.png` - SCREENS.md
 * §3.2's one-time-code step in the same shell. It is the one case in this file
 * that fixes the browser's clock before navigating, because it is the one
 * screen with a live countdown on it; see the case itself for why the fixed
 * instant is in the past.
 *
 * PHASE 2 TASK 7 ADDS THE FIRST ADMIN SCREEN: `admin-sign-in-*.png`, the
 * password step at all three projects. It is one case rather than two even
 * though SCREENS.md §3 has two layouts, because the projects already ARE the
 * two: `desktop` (1440) and `mid` (1000) are above the §3 breakpoint and
 * photograph the cloth panel beside the form, and `mobile` (390) is below it
 * and photographs the narrow masthead above a 470px shell. It does not use
 * `settled()` - there is no scaled design box on this route - and it waits on
 * the pane and `document.fonts.ready` only, since the screen carries no
 * images at all.
 *
 * PHASE 2 TASK 9 ADDS THE LAST FOUR SIGN-IN STATES: `admin-reset-*.png`
 * (SCREENS.md §3.3 pending), `admin-reset-sent-*.png` (§3.3 sent, with the
 * masked address fixed in the query so the image cannot vary with the
 * database), `admin-reset-expired-*.png` (the screen the mailed link lands on,
 * drawn for a token that names nothing) and `admin-signed-in-*.png` (§3.4).
 * Twelve images, three per case, for the same reason the password step's are:
 * the three projects ARE §3's two layouts, `desktop` and `mid` above the
 * breakpoint and `mobile` below it. None of them uses `settled()`.
 *
 * PHASE 4 TASK 4 ADDS THE JOURNEYS SCREEN, in three states:
 * `admin-journeys-*.png` (SCREENS.md §2.2's table inside the Task 3 shell),
 * `admin-journeys-create-*.png` (the create panel, which is a client island and
 * is therefore only on screen once its button has been pressed) and
 * `admin-journeys-rungs-*.png` (below). None of them uses `settled()` — there
 * is no scaled design box on an admin route — and each waits on the screen and
 * `document.fonts.ready`.
 *
 * ═══ WHAT THE THREE PROJECTS ACTUALLY PHOTOGRAPH, WHICH IS TWO SHAPES AND NOT
 *     THREE ═══
 *
 * This paragraph said the three projects were the base table, the full table
 * and one step down from full, with `mid` "exactly at the `dates` rung". That
 * was true of the VIEWPORT queries this screen shipped with for one commit;
 * they are CONTAINER queries now (docs/deviations.md §55), and the number that
 * decides a rung is the table's own width, not the window's. Measured:
 * `desktop` 1440 → about 1142, so all eight columns; `mid` 1000 → about 718,
 * which is 2px UNDER the first rung, so the base four; `mobile` 390 → about
 * 346, the base four again. Two shapes, not three, and nothing in between.
 *
 * SO THE LADDER'S MIDDLE RUNGS HAD NO PICTURE AT ALL — `pages`, `edited` and
 * `media` appeared in no baseline — which is what `admin-journeys-rungs` is
 * for: one case, `desktop` only, that resizes to 1200 wide and photographs the
 * ~902px table where those three rungs are in and `dates` is not. It is the
 * one case here that sets its own viewport, and it says why (review round 1,
 * finding 4).
 *
 * WHAT THESE FOUR DO NOT COVER, and it is written here because a baseline
 * invites the assumption that it does: the geometry `SCREENS.md` states in
 * numbers. At `maxDiffPixelRatio: 0.01` this suite was measured absorbing a
 * 20px displacement of an entire pane (see docs/testing.md's Visual regression
 * section), so §3.4's 62px circle, its 20px square and §3.3's 14px
 * confirmation mark are asserted as numbers in `e2e/reset.spec.ts` instead.
 * These images are what catches the drift those assertions do not name.
 *
 * ═══ THE `destination stream closed early` LINES THIS RUN PRINTS ARE BENIGN
 * ═══
 *
 * A container run logs two to four of these, and they were asserted on by
 * nothing and explained by nothing until Task 10's second fix round went and
 * looked:
 *
 *     [WebServer] ⨯ Error: The destination stream closed early.
 *
 * It is REACT'S OWN, not this application's. `next-server`'s bundled Fizz
 * renderer attaches `destination.on('close', …)` and raises exactly this string
 * when the HTTP response stream closes before the render has finished — a
 * client that went away mid-render.
 *
 * What makes "benign" a measurement rather than a hope: it appears only in the
 * PARALLEL run. The container uses twelve workers with `fullyParallel: true`,
 * where a worker finishing a test tears its context down while a navigation is
 * still streaming; a single-worker local run of the same specs
 * (`npm run test:e2e`, `workers: 1`) logs none at all. Nothing was mis-rendered
 * for a reader who stayed, and no case fails at the same moment.
 *
 * WHAT WOULD MAKE IT A DEFECT, so nobody has to re-derive this: the same line
 * appearing in a serial run, or appearing alongside a failing navigation. Both
 * are visible in the same output this comment is about.
 *
 * Baselines live in `e2e/visual.spec.ts-snapshots/` (one file per test per
 * project, auto-named by Playwright) and are committed — a snapshot with no
 * baseline to compare against protects nothing.
 * Depends on: @playwright/test, the running app from playwright.config.ts's
 * `webServer`, and the seeded diary (`npm run db:seed`).
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { aSignedInSession, fixtureLabel, removeSignedInFixture, SESSION_FIXTURE_DOMAIN } from './support/adminSession'
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

/**
 * Makes sure an account exists before anything in this file is screenshotted.
 *
 * ═══ `/cms` DRAWS A DIFFERENT SCREEN DEPENDING ON WHETHER ONE DOES ═══
 *
 * Payload's own admin shows "create first user" to an EMPTY database and a
 * login form to one with any account in it. The `cms-admin*.png` baselines were
 * taken against an empty one — and this file now creates an account for the
 * signed-in screen's session, in whichever worker gets that test, so `/cms` was
 * screenshotted in whichever state another worker happened to have left.
 *
 * Measured rather than reasoned: at 390x844, `/cms` is 1246px tall with no
 * account and exactly 844 with one; at 1000x800 and 1440x900 it is the viewport
 * height either way, which is why the failure only ever showed at `mobile` and
 * why two of three container runs passed.
 *
 * SO THIS FILE GUARANTEES THE PRECONDITION IT BASELINES rather than inheriting
 * it. An account always exists, `/cms` is always the login screen, and the
 * three `cms-admin*.png` baselines were regenerated in that state. It is also
 * the state that outlasts the fixtures: the moment this diary has its author
 * account, every deployed instance shows the login screen too, so the previous
 * baselines were a picture of a transient condition.
 */
test.beforeAll(async ({}, testInfo) => {
  await aSignedInSession(`visual.${fixtureLabel(testInfo)}`)
})

/**
 * Every label this file hands `aSignedInSession`, so the cleanup below can
 * remove each account it creates.
 *
 * A LIST RATHER THAN A SWEEPING PREDICATE, for `e2e/a11y.spec.ts`'s reason:
 * `removeSignedInFixture` matches by SUBSTRING, so no pattern means "every
 * `visual*` account of THIS worker" without also meaning "every `visual*`
 * account of every worker" — and that is the sweeping delete
 * `SESSION_FIXTURE_DOMAIN` records a flake for.
 *
 * THIS IS THE OTHER HALF OF `docs/deviations.md` §107. That entry closed
 * `e2e/a11y.spec.ts`'s leak and left this file's open, with three of the four
 * largest offenders in it, because the fix could not be exercised on a Windows
 * host — this suite skips off Linux. It is exercised in the container run that
 * produced the baselines below. A case that mints a label missing from this
 * list leaks its account, which `e2e/ciRegistration.test.ts` checks rather
 * than leaving to a reader.
 */
const VISUAL_FIXTURE_LABELS: readonly string[] = [
  'visual',
  'visualaccount',
  'visualbook',
  'visualcover',
  'visualcreate',
  'visualeditor',
  'visualgalleries',
  'visualjourneys',
  'visualmedia',
  'visualpanel',
  'visualpublish',
  'visualrungs',
  'visualsettings',
  'visualshell',
  'visualtrash',
]

test.afterAll(async ({}, testInfo) => {
  // This project's own accounts, never the whole domain: the three viewports
  // run in parallel and a sweeping delete takes another one's session away
  // mid-run (see `SESSION_FIXTURE_DOMAIN`).
  //
  // ONE ENTRY PER LABEL THIS FILE MINTS, which is what makes the loop a
  // cleanup rather than a gesture: a label missing from the list leaves a real
  // account in the developer's own `diary` database on every run
  // (`docs/deviations.md` §107 measured 33 of them). The registration case in
  // `e2e/ciRegistration.test.ts` is what holds the two together.
  for (const label of VISUAL_FIXTURE_LABELS) {
    await removeSignedInFixture(`${label}.${fixtureLabel(testInfo)}@${SESSION_FIXTURE_DOMAIN}`)
  }
})

/**
 * Waits until the document has stopped growing.
 *
 * ═══ WHY `networkidle` AND A VISIBLE FORM ARE NOT ENOUGH ═══
 *
 * Two of three container runs failed `/cms` at the mobile viewport with
 * `Expected an image 390px by 1251px, received 390px by 844px` — 844 being the
 * viewport height, so the page had not yet grown to its content. Payload's
 * admin is a client application: the form becomes visible before its own
 * layout has finished expanding the document, and `fullPage: true` measures
 * the document.
 *
 * This polls the document's height until two consecutive reads agree, which
 * waits for the thing that actually has to have happened rather than for a
 * proxy (a network idle) or a magic number (a known height, which differs per
 * viewport and would have to be updated with the baseline).
 *
 * @param page - The page to wait on.
 * @returns Once the height has been the same twice in a row.
 */
const settledPageHeight = async (page: Page): Promise<void> => {
  let previous = -1

  await expect
    .poll(
      async () => {
        const height = await page.evaluate(() => document.documentElement.scrollHeight)
        const unchanged = height === previous
        previous = height
        return unchanged
      },
      { timeout: 10_000, intervals: [100, 100, 100, 200, 200, 400, 400] },
    )
    .toBe(true)
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

  // And the document has to have finished growing, which a visible form does
  // not imply — see `settledPageHeight` for the two-in-three-runs failure that
  // says so.
  await settledPageHeight(page)

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

test('matches the baseline screenshot of the one-time-code screen', async ({ page }) => {
  // The clock is FIXED before navigation, and that is the whole reason this
  // case is stable: SCREENS.md §3.2 puts two live countdowns on this screen -
  // "It expires in {m:ss}" and "Send again in {n}s" - and without a fixed
  // clock the baseline would photograph whichever second the run landed on.
  // A time BEFORE the document was drawn is chosen deliberately: both windows
  // then clamp to their whole length (`secondsRemaining`'s ceiling), so the
  // image always reads "5:00" and "Send again in 30s" rather than a value that
  // depends on how long the page took to load.
  await page.clock.setFixedTime(new Date('2020-01-01T00:00:00Z'))

  await page.goto('/admin/sign-in/code', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-code-cell]')).toHaveCount(6)
  await page.evaluate(() => document.fonts.ready)

  await expect(page).toHaveScreenshot('admin-sign-in-code.png', {
    fullPage: true,
    mask: [page.locator('[data-profile-name]')],
  })
})

test('matches the baseline screenshot of the reset request screen', async ({ page }) => {
  // No `settled()`: there is no scaled design box on any of the admin routes,
  // and no image anywhere on them. What has to be settled is the type - all
  // three families are used here, and a screenshot taken before they load is a
  // screenshot of the fallback stack.
  await page.goto('/admin/reset', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-reset-step]')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  await expect(page).toHaveScreenshot('admin-reset.png', {
    fullPage: true,
    mask: [page.locator('[data-profile-name]')],
  })
})

test('matches the baseline screenshot of the reset screen once the link is sent', async ({ page }) => {
  // The masked address is FIXED in the query rather than produced by a
  // request, so this image does not depend on which fixture the database
  // happens to hold - the same reason the code screen fixes its clock.
  await page.goto(`/admin/reset?sent=${encodeURIComponent('he•••@wanderings.travel')}`, { waitUntil: 'networkidle' })
  await expect(page.locator('[data-reset-sent]')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  await expect(page).toHaveScreenshot('admin-reset-sent.png', {
    fullPage: true,
    mask: [page.locator('[data-profile-name]')],
  })
})

test('matches the baseline screenshot of the screen a spent link lands on', async ({ page }) => {
  // A token that names nothing, so this is deterministic: the expired state is
  // what any run of this suite gets, with no fixture to set up and none to
  // clean away. The form state is not baselined - drawing it needs a live
  // token, which only the integration suite can mint (e2e/reset.spec.ts's
  // header), and its markup is the password step's, already baselined above.
  await page.goto('/admin/reset/deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-new-password-step]')).toHaveAttribute('data-new-password-view', 'expired')
  await page.evaluate(() => document.fonts.ready)

  await expect(page).toHaveScreenshot('admin-reset-expired.png', {
    fullPage: true,
    mask: [page.locator('[data-profile-name]')],
  })
})

test('matches the baseline screenshot of the signed-in screen', async ({ page, context, baseURL }, testInfo) => {
  // The screen is guarded (Phase 2 Task 10). The fixture account is written
  // with `otp_required` left at its default, so the sign-in screen's own footer
  // line — and therefore every `admin-sign-in-*` baseline — is unchanged by it.
  await context.addCookies([
    {
      name: 'td-session',
      value: await aSignedInSession(`visual.${fixtureLabel(testInfo)}`),
      url: `${baseURL ?? ''}/admin`,
    },
  ])
  await page.goto('/admin/sign-in/done', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-signed-in-mark]')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  await expect(page).toHaveScreenshot('admin-signed-in.png', {
    fullPage: true,
    mask: [page.locator('[data-profile-name]')],
  })
})

test('matches the baseline screenshot of the Overview', async ({ page, context, baseURL }, testInfo) => {
  // SCREENS.md §2.1 — the four-card stat grid, the main split, the washi strip
  // and the 78x104px cloth chip, which is the one place on the admin surface
  // where a title's FIT is a picture rather than a number.
  //
  // ITS BASELINE IS OWED, NOT MISSING BY ACCIDENT. Phase 4 Task 12 replaced the
  // holding screen this case used to photograph and DELETED its three
  // `admin-panel-*` images — pictures of markup nothing renders any more. The
  // case is repointed here so the route is ready; the three new images are
  // taken with the seven other admin screens that owe one, in Task 15, under
  // `mcr.microsoft.com/playwright:v1.62.1-noble`. Nothing was generated on the
  // Windows host: a host run asks for `-win32.png`, WRITES one, and every run
  // after that compares the host against itself while the committed files go
  // unread. `docs/deviations.md` §86 records the debt.
  //
  // Guarded, so it needs a session first; the fixture account leaves
  // `otp_required` at its default, so no `admin-sign-in-*` baseline is affected
  // by it.
  await context.addCookies([
    {
      name: 'td-session',
      value: await aSignedInSession(`visualpanel.${fixtureLabel(testInfo)}`),
      url: `${baseURL ?? ''}/admin`,
    },
  ])
  await page.goto('/admin', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-admin-overview]')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  // The rail's address is masked for the reason the ten cases below give: it
  // ends in `fixtureLabel`'s worker index, which Playwright hands out
  // differently from one run to the next. This screen's three images are being
  // taken for the first time here, so they are taken without it.
  await expect(page).toHaveScreenshot('admin-overview.png', {
    fullPage: true,
    mask: [page.locator('[data-profile-name]')],
  })
})

test('matches the baseline screenshot of the journeys screen', async ({ page, context, baseURL }, testInfo) => {
  // SCREENS.md §2.2 — the column ladder, the status pills and the 44px cover
  // squares, which is the densest piece of the admin surface and the one where
  // a moved breakpoint shows as a picture rather than as a number.
  await context.addCookies([
    {
      name: 'td-session',
      value: await aSignedInSession(`visualjourneys.${fixtureLabel(testInfo)}`),
      url: `${baseURL ?? ''}/admin`,
    },
  ])
  await page.goto('/admin/journeys', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-admin-journeys]')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  await expect(page).toHaveScreenshot('admin-journeys.png', {
    fullPage: true,
    mask: [page.locator('[data-profile-name]')],
  })
})

test('matches the baseline screenshot of the journeys table at its middle rungs', async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  // ONE PROJECT, ONE VIEWPORT OF ITS OWN. The ladder is keyed on the TABLE's
  // width, and the three projects give it about 1142, 718 and 346 — so the
  // `pages`, `edited` and `media` rungs are in none of them. 1200 wide puts the
  // table at about 902: above `media` (880) and below `dates` (1000), which is
  // the three rungs no other baseline shows. Run at `desktop` only because the
  // viewport is set here rather than by the project, so the other two would
  // photograph this same width twice more.
  test.skip(testInfo.project.name !== 'desktop', 'this case sets its own viewport, so one project is enough')

  await context.addCookies([
    {
      name: 'td-session',
      value: await aSignedInSession(`visualrungs.${fixtureLabel(testInfo)}`),
      url: `${baseURL ?? ''}/admin`,
    },
  ])
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/admin/journeys', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-admin-journeys]')).toBeVisible()
  // The rungs themselves, asserted rather than left to the picture: a baseline
  // of the wrong shape is still a baseline.
  await expect(page.locator('[data-journey-id]').first().locator('[data-cell="pages"]')).toBeVisible()
  await expect(page.locator('[data-journey-id]').first().locator('[data-cell="media"]')).toBeVisible()
  await expect(page.locator('[data-journey-id]').first().locator('[data-cell="edited"]')).toBeVisible()
  await expect(page.locator('[data-journey-id]').first().locator('[data-cell="dates"]')).toBeHidden()
  await page.evaluate(() => document.fonts.ready)

  await expect(page).toHaveScreenshot('admin-journeys-rungs.png', {
    fullPage: true,
    mask: [page.locator('[data-profile-name]')],
  })
})

test('matches the baseline screenshot of the journeys create panel', async ({ page, context, baseURL }, testInfo) => {
  // The panel is a client island, so it is only on screen once the button has
  // been pressed — and its terracotta ring, its washi strip and its three
  // fields are exactly the kind of thing a component test cannot see.
  await context.addCookies([
    {
      name: 'td-session',
      value: await aSignedInSession(`visualcreate.${fixtureLabel(testInfo)}`),
      url: `${baseURL ?? ''}/admin`,
    },
  ])
  await page.goto('/admin/journeys', { waitUntil: 'networkidle' })
  await page.locator('[data-create-open]').click()
  await expect(page.locator('[data-create-panel]')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  await expect(page).toHaveScreenshot('admin-journeys-create.png', {
    fullPage: true,
    mask: [page.locator('[data-profile-name]')],
  })
})

test('matches the baseline screenshot of the sign-in screen', async ({ page }) => {
  // No `settled()`: there is no scaled design box on this route, and no image
  // anywhere on the screen. What has to be settled is the type — all three
  // families are used here, and a screenshot taken before they load is a
  // screenshot of the fallback stack.
  await page.goto('/admin/sign-in', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-password-step]')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  await expect(page).toHaveScreenshot('admin-sign-in.png', {
    fullPage: true,
    mask: [page.locator('[data-profile-name]')],
  })
})

// ══ SCREENS.md §2's ELEVEN SCREENS, AND THE SHELL AROUND THEM ══════════════
//
// Phase 4's first exit criterion is "every screen matches SCREENS.md", and
// what makes that checkable rather than asserted is a photograph of each at
// each of `playwright.config.ts`'s three projects.
// `e2e/visualBaselines.test.ts` is what counts them; these are the cases it
// counts.
//
// EVERY ONE OF THEM READS AND NONE OF THEM WRITES. These run against the
// developer's own `diary` database, not `diary_test`, for the reason
// `e2e/support/adminSession.ts` gives — so a case that pressed Publish, sorted
// a gallery or trashed a journey would change what every later run of this
// file photographs. The only rows any of them creates are their own fixture
// accounts, which `VISUAL_FIXTURE_LABELS` deletes.
//
// WHICH MEANS THE SEED IS PART OF THE BASELINE. `npm run db:seed` is the state
// these were taken in, and a screen whose content is a function of the data —
// Publish's waiting list, Trash's rows — photographs what that seed leaves,
// which is an empty one for both. That is stated rather than hidden: a picture
// of an empty state is a real picture of a real state, and it is the state a
// reader reproduces by seeding.

/**
 * Carries a minted session into the browser, which is what every guarded
 * screen needs before it draws anything.
 *
 * IT TAKES THE SESSION, NOT THE LABEL, AND THAT IS NOT A STYLE CHOICE. A
 * helper that minted the session itself would be the WRAPPER
 * `e2e/ciRegistration.test.ts`'s leak check cannot attribute a label to
 * (`docs/deviations.md` §108): that guard reads a literal off every
 * `aSignedInSession` call site, and since Phase 4 Task 15e a call site it
 * cannot read is REFUSED rather than skipped — so a helper that minted would
 * turn this file red instead of leaking an account silently. Minting at the
 * call site keeps every label readable.
 * @param context - The case's browser context.
 * @param baseURL - Playwright's own, for the cookie's URL.
 * @param session - What `aSignedInSession` returned at the call site.
 * @example
 * await signedInAs(context, baseURL, await aSignedInSession(`visualmedia.${fixtureLabel(testInfo)}`))
 */
const signedInAs = async (context: BrowserContext, baseURL: string | undefined, session: string): Promise<void> => {
  await context.addCookies([{ name: 'td-session', value: session, url: `${baseURL ?? ''}/admin` }])
}

/**
 * Waits for an admin screen to be typed and decoded before it is photographed.
 *
 * NOT `settled`, WHICH IS THE DIARY'S. There is no scaled design box on this
 * surface and nothing measures a viewport, so the two things that can still be
 * mid-flight when `networkidle` fires are the self-hosted faces
 * (`font-display: swap` paints a fallback first) and any photograph that has
 * been fetched and not yet decoded — a repaint during the capture, which reads
 * as a flaky case rather than as drift.
 *
 * ═══ IT WAITS ON `currentSrc`, NOT ON `src`, AND THAT IS THE WHOLE FIX ═══
 *
 * `settled`'s spelling — decode every image whose `src` is non-empty — HUNG
 * this surface, measured rather than reasoned: four cases timed out at thirty
 * seconds inside `image.decode()`, the Media library at all three projects and
 * the journey editor at `mid`. Both screens draw lazily-loaded tiles, and a
 * lazy image the viewport has not reached has an `src` attribute and has never
 * been fetched: `decode()` on it neither resolves nor rejects, so awaiting it
 * is awaiting the scroll position. `currentSrc` is empty until the browser has
 * actually SELECTED a source, which is the moment a load begins — so it is the
 * difference between "this element names a picture" and "this element is
 * fetching one", and only the second can be waited for.
 *
 * An image that is mid-flight is waited out through its own `load`; one that
 * fails is waited out through its `error` and left to draw its alt text, which
 * is a real state of the screen and not something this helper should hide.
 * @param page - The page, already navigated and asserted on.
 * @example
 * await adminSettled(page)
 */
const adminSettled = async (page: Page): Promise<void> => {
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(async () => {
    const started = [...document.images].filter((image) => image.currentSrc !== '')
    await Promise.all(
      started.map(async (image) => {
        if (!image.complete) {
          await new Promise((settle) => {
            image.addEventListener('load', settle, { once: true })
            image.addEventListener('error', settle, { once: true })
          })
        }
        await image.decode().catch(() => undefined)
      }),
    )
  })
}

test('matches the baseline screenshot of the shell itself, with the screen masked out', async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  // ═══ THE ONE SUBJECT IN THIS SET THAT IS NOT A ROUTE ═══
  //
  // SCREENS.md §2's preamble specifies the shell before §2.1 begins — the
  // 238px rail with its masthead, nine buttons and footer, and the 96px header
  // over the content — and the phase's exit line counts it ("eleven screens
  // plus the shell"). It has no address of its own, so it is photographed on
  // `/admin` with `[data-admin-content]` MASKED: the frame at full fidelity,
  // the Overview's own content painted flat.
  //
  // WHY THE MASK IS THE POINT AND NOT A CONVENIENCE. The eleven screen
  // baselines each contain this frame already, so an unmasked shot here would
  // be a second copy of `admin-overview` and would guard nothing new. What
  // none of the eleven gives is a baseline that NO SCREEN'S CONTENT CAN MOVE:
  // each of them is regenerated whenever its own screen changes, and a frame
  // change riding along inside that regeneration is invisible. That is not
  // hypothetical — `docs/deviations.md` §110 is an instance of it.
  //
  // ═══ SO THE FRAME'S OWN DATA IS MASKED TOO, AND THE REST IS NAMED ═══
  //
  // MASKING THE SCREEN IS NOT ENOUGH ON ITS OWN, because the FRAME prints data
  // too: the rail's nine counts, the header's crumb and the "Last published"
  // stamp are all functions of the diary, and all three move when a journey is
  // added or Publish is pressed once. Unmasked they make this picture
  // content-driven in the same way as the eleven, which is the whole thing it
  // exists not to be. So they are masked, and what this picture SAYS is then
  // `ADMIN_NAV`'s own labels, the stylesheet and the boxes.
  //
  // WHAT A MASK CANNOT REACH IS EXISTENCE, which is why the claim is bounded
  // rather than absolute. A mask paints an element that is there; it cannot
  // hold a place for one that is not. THREE lines in this frame are rendered
  // conditionally, and each of them arriving or leaving moves this baseline
  // for a reason no frame change caused:
  //
  //   - the rail's site-name eyebrow, `NavRail.tsx`, drawn only when Settings
  //     holds a name;
  //   - `ScreenHeader`'s "n unpublished" chip, drawn only above zero;
  //   - the rail's "Last published" line, `NavRail.tsx`, drawn only when
  //     `lastPublished !== null` — which on `/admin` is `view.book.publishedAt`,
  //     `editions[0]?.at ?? null`, so a diary with nothing published draws no
  //     line, the footer shrinks and "Sign out" moves up.
  //
  // THE THIRD IS THE ONE THIS CASE MASKS, and it is on the list anyway: a mask
  // makes its CONTENT stop mattering and does nothing about whether the
  // element is drawn at all. An earlier count of two here looked straight at
  // that mask and still missed the conditional eleven lines above it.
  //
  // THE AVATAR'S LETTER IS NOT MASKED AND DOES NOT NEED TO BE. It is
  // `accountName.slice(0, 1)`, and this case's account is always
  // `visualshell.…`, so the glyph is fixed by the case rather than by the
  // diary — unlike the address beneath it, which carries the worker index.
  //
  // AND THE VIEWPORT, NOT `fullPage`. A full-page shot's HEIGHT is the
  // screen's, not the shell's, so the one baseline meant to be independent of
  // the content would be sized by it.
  //
  // THE THREE PROJECTS ARE THE THREE WIDTH MODES `adminWidthMode` names —
  // 1440 wide, 1000 mid, 390 narrow — so this one case photographs all three
  // forms SCREENS.md §2 gives the frame: the rail as a 238px column beside the
  // header at wide and at mid, with §2's tightened padding below 1180, and at
  // 390 the band above it, which is the one width where the rail stops being a
  // column at all.
  await signedInAs(context, baseURL, await aSignedInSession(`visualshell.${fixtureLabel(testInfo)}`))
  await page.goto('/admin', { waitUntil: 'networkidle' })
  // The frame's own parts, asserted rather than left to the picture: a masked
  // shot of a screen that failed to draw its rail is still a picture.
  await expect(page.locator('[data-admin-content]')).toBeVisible()
  await expect(page.locator('[data-profile]')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Overview')
  await adminSettled(page)

  await expect(page).toHaveScreenshot('admin-shell.png', {
    mask: [
      page.locator('[data-admin-content]'),
      page.locator('[data-profile-name]'),
      page.locator('[data-nav-count]'),
      page.locator('[data-crumb]'),
      page.locator('[data-last-published]'),
    ],
  })
})

test('matches the baseline screenshot of the journey editor', async ({ page, context, baseURL }, testInfo) => {
  // SCREENS.md §2.3, the largest screen in the handoff, reached the way an
  // author reaches it: through the Edit link on a journeys row, which is also
  // what proves that link resolves to a route rather than to Next's own
  // not-found page (`e2e/a11y.spec.ts` walks it the same way).
  //
  // ITS THREE COLUMNS ARE THE PICTURE. §2.3 gives it `184 | 1fr | 250` above
  // 1180, `168 | 1fr` with the pool spanning both above 860, and a single
  // column below — so this is the one screen in the set where the three
  // projects photograph three different column counts rather than three widths
  // of one.
  await signedInAs(context, baseURL, await aSignedInSession(`visualeditor.${fixtureLabel(testInfo)}`))
  await page.goto('/admin/journeys', { waitUntil: 'networkidle' })
  await page.locator('[data-journey-id]').first().locator('[data-cell="actions"] a').first().click()
  await expect(page.locator('[data-journey-editor]')).toBeVisible()
  // All three columns, and the tool row only a selected card reveals: a
  // baseline of two of the three is still a baseline.
  await expect(page.locator('[data-page-tools]')).toBeVisible()
  await expect(page.locator('[data-layout-picker]')).toBeVisible()
  await expect(page.locator('[data-journey-pool]')).toBeVisible()
  await adminSettled(page)

  await expect(page).toHaveScreenshot('admin-journey-editor.png', {
    fullPage: true,
    mask: [page.locator('[data-profile-name]')],
  })
})

test('matches the baseline screenshot of the Media library', async ({ page, context, baseURL }, testInfo) => {
  // SCREENS.md §2.4 — the tile grid, its chips and its dropzone.
  //
  // THE VIEWPORT, NOT `fullPage`, AND THAT IS THE GRID'S DOING. `MediaGrid` is
  // virtualized (`readMediaScreen.ts`'s header says why the read is not
  // paginated and what bounds the DOM instead), so the tiles that exist are
  // the tiles in view. A full-page shot asks for a document taller than the
  // window the virtualizer is filling, and what it photographed would be a
  // function of how far ahead that window had run — a race, not a screen.
  //
  // WHICH IS WHY THE GRID IS SCROLLED TO AND `toBeInViewport` IS ASSERTED. A
  // viewport shot only contains its subject if the subject is in the viewport,
  // and `toBeVisible` does not say that: it is satisfied by an element below
  // the fold. The first `admin-media-mobile-linux.png` passed that assertion
  // and held the rail band, the header and the dropzone — and not one tile, no
  // chip row and no search field, on a case whose stated subject is the grid.
  // At 390px the band alone takes most of the viewport. So the grid is brought
  // into frame and the assertion is the one that would have caught it.
  await signedInAs(context, baseURL, await aSignedInSession(`visualmedia.${fixtureLabel(testInfo)}`))
  await page.goto('/admin/media', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-admin-media]')).toBeVisible()
  await expect(page.locator('[data-media-tile]').first()).toBeVisible()
  await page.locator('[data-media-tile]').first().scrollIntoViewIfNeeded()
  await expect(page.locator('[data-media-tile]').first()).toBeInViewport()
  await adminSettled(page)

  await expect(page).toHaveScreenshot('admin-media.png', { mask: [page.locator('[data-profile-name]')] })
})

test('matches the baseline screenshot of the Galleries screen', async ({ page, context, baseURL }, testInfo) => {
  // SCREENS.md §2.5 — the frame grid with its grips on the left and the
  // selected frame's caption panel beside it.
  //
  // IT READS AND DOES NOT WRITE. Every control that rearranges a gallery — the
  // grips' arrow keys, "Sort by date", a drag — persists to the developer's own
  // `diary` database, so this case presses none of them, and the panel it
  // photographs is the one the screen selects for itself.
  await signedInAs(context, baseURL, await aSignedInSession(`visualgalleries.${fixtureLabel(testInfo)}`))
  await page.goto('/admin/galleries', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-admin-galleries]')).toBeVisible()
  await expect(page.locator('[data-frame-grid]')).toBeVisible()
  await expect(page.locator('[data-frame-id]').first()).toBeVisible()
  await expect(page.locator('[data-selected-frame]')).toBeVisible()
  await adminSettled(page)

  await expect(page).toHaveScreenshot('admin-galleries.png', {
    fullPage: true,
    mask: [page.locator('[data-profile-name]')],
  })
})

test('matches the baseline screenshot of the Book screen', async ({ page, context, baseURL }, testInfo) => {
  // SCREENS.md §2.6 — the bookmark order on the left and the book's own
  // settings beside it: four cloth swatches, two range inputs and three
  // checkboxes, which are shapes no number in a component test can say look
  // right.
  //
  // IT READS AND DOES NOT WRITE: every arrow on this screen reorders the live
  // book, so none is pressed.
  await signedInAs(context, baseURL, await aSignedInSession(`visualbook.${fixtureLabel(testInfo)}`))
  await page.goto('/admin/book', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-admin-book]')).toBeVisible()
  await expect(page.locator('[data-bookmark-order]')).toBeVisible()
  await expect(page.locator('[data-bookmark-kind="journey"]').first()).toBeVisible()
  await expect(page.locator('[data-book-settings]')).toBeVisible()
  await expect(page.locator('[data-flip-slider]')).toBeVisible()
  await adminSettled(page)

  await expect(page).toHaveScreenshot('admin-book.png', {
    fullPage: true,
    mask: [page.locator('[data-profile-name]')],
  })
})

test('matches the baseline screenshot of the Cover screen', async ({ page, context, baseURL }, testInfo) => {
  // SCREENS.md §2.7 — the live cover preview over its cloth gradient, and the
  // About form beside it. The preview is the one place on this surface where a
  // title's FIT is a picture rather than a number, and its five lines are the
  // ones `docs/deviations.md` §12 records a contrast failure on.
  //
  // IT READS AND DOES NOT WRITE: neither save button is pressed and the
  // portrait select is left at its "keep the current portrait" default.
  await signedInAs(context, baseURL, await aSignedInSession(`visualcover.${fixtureLabel(testInfo)}`))
  await page.goto('/admin/cover', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-admin-cover]')).toBeVisible()
  await expect(page.locator('[data-cover-preview]')).toBeVisible()
  await expect(page.locator('[data-about-card]')).toBeVisible()
  await expect(page.locator('[data-portrait-choices]')).toBeVisible()
  await adminSettled(page)

  await expect(page).toHaveScreenshot('admin-cover.png', {
    fullPage: true,
    mask: [page.locator('[data-profile-name]')],
  })
})

test('matches the baseline screenshot of the Publish screen', async ({ page, context, baseURL }, testInfo) => {
  // SCREENS.md §2.8 — the headline, the changes card and the editions list.
  //
  // WHAT IT PHOTOGRAPHS IS WHAT THE SEED LEAVES, WHICH IS NOTHING WAITING, and
  // that is a decision rather than an omission. `e2e/a11y.spec.ts`'s case
  // creates a journey, edits it and deletes it again to put a row in front of
  // axe; a baseline taken that way would carry a fixture's name and its dates
  // into a committed image and would move the day that fixture's shape
  // changed. The empty state is a real state of a real screen — it is what an
  // author sees the moment after publishing — and it is the one a reader
  // reproduces with `npm run db:seed`.
  //
  // IT PRESSES NOTHING. A publish cannot be undone.
  await signedInAs(context, baseURL, await aSignedInSession(`visualpublish.${fixtureLabel(testInfo)}`))
  await page.goto('/admin/publish', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-admin-publish]')).toBeVisible()
  await expect(page.locator('[data-publish-headline]')).toBeVisible()
  await expect(page.locator('[data-publish-editions]')).toBeVisible()
  await adminSettled(page)

  await expect(page).toHaveScreenshot('admin-publish.png', {
    fullPage: true,
    mask: [page.locator('[data-profile-name]')],
  })
})

test('matches the baseline screenshot of the Settings screen', async ({ page, context, baseURL }, testInfo) => {
  // SCREENS.md §2.9 — all three cards, and the five switches inside them,
  // which are 34x19px tracks with a 14px knob at one of two offsets: a
  // difference of fourteen pixels a component test can only assert as a class
  // name.
  //
  // IT READS AND DOES NOT WRITE. Every toggle here writes a site-wide setting
  // and two of them change what the public diary serves, so none is pressed.
  await signedInAs(context, baseURL, await aSignedInSession(`visualsettings.${fixtureLabel(testInfo)}`))
  await page.goto('/admin/settings', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-admin-settings]')).toBeVisible()
  await expect(page.locator('[data-settings-site]')).toBeVisible()
  await expect(page.locator('[data-settings-material]')).toBeVisible()
  await expect(page.locator('[data-settings-readers]')).toBeVisible()
  await adminSettled(page)

  await expect(page).toHaveScreenshot('admin-settings.png', {
    fullPage: true,
    mask: [page.locator('[data-profile-name]')],
  })
})

test('matches the baseline screenshot of the Trash screen', async ({ page, context, baseURL }, testInfo) => {
  // SCREENS.md §2.10, EMPTY, AND THE REASON IS THE THREE PROJECTS RATHER THAN
  // THE CLOCK. An earlier version of this comment said empty was the only
  // state that could be baselined, on the ground that a row's line is a
  // function of the current time. That is only half true and the half it
  // states is not the blocker: `goesForGoodLine` prints
  // `goes for good in {n} days` inside the window, which does move daily, but
  // `still here until you delete it` once the thirty days are past — and
  // `readTrashScreen` filters on `deletedAt: { exists: true }` and on nothing
  // else, so a row backdated past the window lists and prints a fixed line.
  //
  // WHAT ACTUALLY RULES IT OUT is that this file's three projects run in
  // PARALLEL and each worker mints its own fixtures. A trash fixture per
  // worker means the list holds one, two or three rows depending on which
  // workers are mid-run when the shot is taken, which is a racy picture rather
  // than a screen — the same shape `SESSION_FIXTURE_DOMAIN`'s header records a
  // flake for. `e2e/a11y.spec.ts` can create a row because axe does not count
  // them; a baseline does.
  //
  // WHAT THAT COSTS IS STATED RATHER THAN HIDDEN: the row's 46px image, its
  // two ringed buttons and its line are NOT in this baseline. They are covered
  // by `e2e/a11y.spec.ts`'s trash case, which does create a row, and by the
  // screen's own component tests.
  //
  // ═══ AND THAT SPEC IS WHY THE EMPTY STATE IS ASSERTED, NOT ASSUMED ═══
  //
  // The argument above is about THIS file's fixtures; it does not stop at
  // them. `.github/workflows/ci.yml`'s `browser` job runs `e2e/a11y.spec.ts`
  // and this file in ONE `npx playwright test` invocation, that spec's trash
  // case holds a live trashed row across a page load and a full axe run, and
  // both share the one `diary` database. So in CI a row can exist while this
  // shot is taken, and this baseline is the empty state.
  //
  // NOTHING HERE CAN PREVENT THAT — a mask cannot hold the place of a row that
  // is not there, and waiting for an empty list only narrows the window it
  // then photographs. What this assertion buys is a failure that NAMES the
  // cause: without it the collision arrives as an unexplained pixel diff on a
  // screenshot, which is the shape a reader blames on the baseline. With it
  // the run says the trash was not empty. `docs/deviations.md` §111 records
  // the coupling, and records that CI's `retries: 1` must not be read as the
  // fix: a retry would hide this permanently rather than close it.
  await signedInAs(context, baseURL, await aSignedInSession(`visualtrash.${fixtureLabel(testInfo)}`))
  await page.goto('/admin/trash', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-admin-trash]')).toBeVisible()
  await expect(
    page.locator('[data-trash-row]'),
    'a trashed row exists while the empty-state baseline is being taken — see this case’s comment and docs/deviations.md §111',
  ).toHaveCount(0)
  await adminSettled(page)

  await expect(page).toHaveScreenshot('admin-trash.png', {
    fullPage: true,
    mask: [page.locator('[data-profile-name]')],
  })
})

test('matches the baseline screenshot of the Account screen', async ({ page, context, baseURL }, testInfo) => {
  // SCREENS.md §2.11 — all four cards: who you are, tell me when, the password
  // form and the session list.
  //
  // TWO THINGS ARE MASKED, AND BOTH WERE FOUND BY LOOKING AT THE PICTURE
  // RATHER THAN BY READING THE SCREEN. A session row ends in the date it was
  // last seen, and `authenticate` stamps that on the very request that draws
  // this screen — so it is always TODAY, and a baseline carrying it would be
  // red tomorrow morning for no reason anybody changed. `data-session-where`
  // exists so the mask can be that line rather than the row: masking the row
  // would take §2.11's mark, its device line and its Revoke out of the picture
  // with it, which is most of what the row is.
  //
  // And "Sign-in email" prints the fixture account's own address, which ends in
  // `fixtureLabel`'s worker index — the same string the rail's masked line
  // carries, arriving a second time through a card that spells it in full
  // rather than truncating it. The mask is `[data-account-email]`, the address
  // alone, and NOT `[data-account-field="email"]`, which is the whole field:
  // masking the field took §2.11's "Sign-in email" eyebrow with it and left
  // the only labelled field in the picture with no label. Same rule as
  // `data-session-where` above — mask the line, never the thing around it.
  //
  // The one thing on this screen that IS a clock,
  // the time-zone option's example date, is not masked and does not need to
  // be: `TIME_ZONE_SAMPLE` is a fixed `Date.UTC(2026, 8, 28, 22, 5)`.
  //
  // IT READS AND DOES NOT WRITE. Every control here writes the account's own
  // row, and a wrong current password spends one of five login attempts before
  // the fixture locks for fifteen minutes.
  await signedInAs(context, baseURL, await aSignedInSession(`visualaccount.${fixtureLabel(testInfo)}`))
  await page.goto('/admin/account', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-admin-account]')).toBeVisible()
  await expect(page.locator('[data-account-field="timeZone"] select')).toBeVisible()
  await expect(page.locator('[data-account-field="current"] input')).toBeVisible()
  await expect(page.locator('[data-session-row]').first()).toBeVisible()
  await adminSettled(page)

  await expect(page).toHaveScreenshot('admin-account.png', {
    fullPage: true,
    mask: [
      page.locator('[data-session-where]'),
      page.locator('[data-profile-name]'),
      page.locator('[data-account-email]'),
    ],
  })
})
