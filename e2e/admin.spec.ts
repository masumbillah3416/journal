/**
 * admin.spec.ts — the admin shell in a real browser: the rail SCREENS.md §2
 * puts beside every screen, drawn by a real Next.js render behind the guard.
 *
 * ═══ WHAT THIS ADDS THAT THE jsdom CASES CANNOT ═══
 *
 * `NavRail.test.tsx` renders the component; this renders the ROUTE. Between
 * the two sit the things jsdom has no opinion about and that have broken this
 * surface before: the CSS Module actually resolving to class names, the guard
 * admitting the request, and `readNavCounts` reaching Postgres.
 *
 * WHAT IT DOES NOT ADD, because this header claimed it did and a review
 * measured otherwise: it does NOT catch a `'use client'` added under the
 * shell. All five cases below pass with `NavRail.tsx` carrying the directive —
 * the route renders identically, and the 320KB gate has 189KB of headroom to
 * absorb the cost. That property is
 * `apps/web/lib/admin/shellShipsNoClientJs.test.ts`'s, which reads the
 * directive off disk and fails on the commit that adds it.
 *
 * THE COUNT COMES FROM THE DOMAIN, THE DOM FROM CHROMIUM. `ADMIN_NAV.length`
 * is imported rather than written as a number: a case asserting "nine" would
 * have to be edited by every screen task that adds an entry, and an assertion
 * a task has to edit is one it can edit to match what it broke.
 *
 * SINCE PHASE 4 TASK 4 IT ALSO WALKS THE JOURNEYS SCREEN, which is the first
 * admin screen with data in it. The create case is the one that cannot be
 * written anywhere else: a Server Action is dispatched by Next.js under an
 * opaque action id, so no Vitest project can call one, and the browser is the
 * only place the whole chain — the form, the action id, the guard, Zod, the
 * write and the revalidate that puts the new row on screen — runs end to end.
 * It writes to the developer's own `diary` database, like every other case
 * here, and deletes what it wrote in `afterAll`.
 *
 * Depends on: @playwright/test, the running app from playwright.config.ts's
 * `webServer`, `./support/adminSession` (the guard needs a real session —
 * see that file for why a browser cannot sign itself in here),
 * `@travel-diary/domain/admin/navigation`, and `getPayload` for the one
 * fixture this file has to clean up itself.
 */
import { ADMIN_NAV, activeNavId } from '@travel-diary/domain/admin/navigation'
import { expect, test } from '@playwright/test'
import { getPayload } from '../apps/web/lib/payload'
import { aSignedInSession, fixtureLabel, removeSignedInFixture, SESSION_FIXTURE_DOMAIN } from './support/adminSession'

/** What this file's fixture account is called, per project, so runs cannot collide. */
const label = (testInfo: { readonly project: { readonly name: string }; readonly workerIndex: number }): string =>
  `adminshell.${fixtureLabel(testInfo)}`

/**
 * What the created journey is called, per project and worker.
 *
 * The name carries the label so two viewport projects running at once cannot
 * find each other's row — and so the cleanup below deletes this run's journey
 * and no seeded one.
 * @param testInfo - Playwright's own per-test information.
 * @returns The journey's name.
 */
const journeyName = (testInfo: { readonly project: { readonly name: string }; readonly workerIndex: number }): string =>
  `Kyoto ${label(testInfo)}`

test.afterAll(async ({}, testInfo) => {
  await removeSignedInFixture(`${label(testInfo)}@${SESSION_FIXTURE_DOMAIN}`)

  // The journey the create case made, and the three pages `createJourney`
  // makes with it. Deleted by `where` rather than by id for the reason
  // `removeSignedInFixture` gives: a predicate that now matches nothing is not
  // an error, and a find-then-delete-by-id is not atomic.
  const payload = await getPayload()
  const made = await payload.find({
    collection: 'journeys',
    where: { name: { like: journeyName(testInfo) } },
    pagination: false,
    depth: 0,
  })
  for (const journey of made.docs) {
    await payload.delete({ collection: 'pages', where: { journey: { equals: journey.id } } })
  }
  await payload.delete({ collection: 'journeys', where: { name: { like: journeyName(testInfo) } } })
})

test.beforeEach(async ({ context, baseURL }, testInfo) => {
  await context.addCookies([
    { name: 'td-session', value: await aSignedInSession(label(testInfo)), url: `${baseURL ?? ''}/admin` },
  ])
})

test('draws one rail button per entry the domain declares', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.locator('[data-admin-panel]')).toBeVisible()

  await expect(page.locator('a[data-nav-id]')).toHaveCount(ADMIN_NAV.length)
})

test('marks the overview button current on /admin, and only that one', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.locator('[data-admin-panel]')).toBeVisible()

  const current = page.locator('a[aria-current="page"]')
  await expect(current).toHaveCount(1)
  await expect(current).toHaveAttribute('data-nav-id', activeNavId('/admin') ?? '')
})

test('titles the screen with the overview entry’s own label, once', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.locator('[data-admin-panel]')).toBeVisible()

  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toHaveCount(1)
  await expect(heading).toHaveText(ADMIN_NAV.find((entry) => entry.href === '/admin')?.label ?? '')
})

test('prints a real number beside the media button, from the database rather than the markup', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.locator('[data-admin-panel]')).toBeVisible()

  // The seeded diary has media rows and journeys; what matters here is that
  // the rail printed digits at all, which a count that failed to reach
  // Postgres could not do — the screen would have thrown before drawing.
  await expect(page.locator('a[data-nav-id="media"] [data-nav-count]')).toHaveText(/^\d+$/)
  await expect(page.locator('a[data-nav-id="journeys"] [data-nav-count]')).toHaveText(/^\d+$/)
})

test('sends an anonymous browser to the sign-in screen rather than drawing the rail', async ({ browser, baseURL }) => {
  // A context of its own: the one `beforeEach` prepares carries the session
  // cookie, and `browser.newContext()` inherits nothing from the config - so
  // the address is given to it explicitly.
  const anonymous = await browser.newContext({ baseURL: baseURL ?? '' })
  const page = await anonymous.newPage()

  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/sign-in$/)
  await expect(page.locator('a[data-nav-id]')).toHaveCount(0)

  await anonymous.close()
})

test('lists the journeys the diary holds, inside the shell and under the Journeys button', async ({ page }) => {
  await page.goto('/admin/journeys')
  await expect(page.locator('[data-admin-journeys]')).toBeVisible()

  // The seeded diary has journeys; what matters here is that the screen drew
  // rows AT ALL, which a screen whose queries never reached Postgres could not.
  await expect(page.locator('[data-journey-id]').first()).toBeVisible()
  const current = page.locator('a[aria-current="page"][data-nav-id]')
  await expect(current).toHaveCount(1)
  await expect(current).toHaveAttribute('data-nav-id', activeNavId('/admin/journeys') ?? '')
})

test('filters by a status chip through the address, with no JavaScript in the loop', async ({ page }) => {
  await page.goto('/admin/journeys')
  await page.locator('[data-chip="published"]').click()

  // The CHIP IS A LINK, so the browser navigated: the address says what is
  // selected, and a reload would say the same. A `useState` version would
  // leave the URL where it was.
  await expect(page).toHaveURL(/\/admin\/journeys\?filter=published$/)
  await expect(page.locator('[data-chip="published"][aria-current="page"]')).toHaveCount(1)
})

test('creates a journey through the panel and shows it as a Draft', async ({ page }, testInfo) => {
  // THE CASE NO VITEST PROJECT CAN WRITE. Everything between the button and
  // the row — Next's action id, the guard, Zod over the FormData, the write,
  // the three pages and the revalidate — runs only in a browser against a real
  // server.
  const name = journeyName(testInfo)
  await page.goto('/admin/journeys')
  await page.locator('[data-create-open]').click()

  await page.locator('[data-create-panel] input[name="name"]').fill(name)
  await page.locator('[data-create-panel] input[name="place"]').fill('Japan')
  await page.locator('[data-create-panel] input[name="dates"]').fill('28 Oct – 6 Nov 2026')
  await page.locator('[data-create-panel] button[type="submit"]').click()

  const row = page.locator('[data-journey-id]').filter({ hasText: name })
  await expect(row).toHaveCount(1)
  // The panel's own line promises this: "Starts as a draft — no bookmark until
  // you publish." A create that published would show "Published" here.
  await expect(row.locator('[data-cell="status"]')).toHaveText('Draft')
})

test('opens one row’s action strip behind its ⋯, and closes it again', async ({ page }) => {
  await page.goto('/admin/journeys')
  const row = page.locator('[data-journey-id]').first()

  await expect(row.locator('[data-journey-strip]')).toHaveCount(0)
  await row.locator('[data-row-more]').click()
  await expect(row.locator('[data-journey-strip]')).toBeVisible()
  await expect(row.locator('[data-journey-strip]')).toContainText('Move to trash')

  await row.locator('[data-row-more]').click()
  await expect(row.locator('[data-journey-strip]')).toHaveCount(0)
})

test('keeps each row’s controls inside their own column, at every width', async ({ page }) => {
  // FOUND IN A BASELINE, NOT REASONED ABOUT. The first `admin-journeys-*.png`
  // generated in the pinned container showed "14 Sept 2026EDIT GALLERY ⋯" —
  // the Edited cell's date and the row's controls printed on top of each
  // other. Measured in a real browser: the three controls are 119.4px wide at
  // the type SCREENS.md §2.2 gives them, the actions track was capped at the
  // 104px the same section gives it, and `justify-content: flex-end` sends the
  // overflow LEFT, over whichever cell is beside it. A picture of overlapping
  // text is still a picture, and `maxDiffPixelRatio` would have ratified it
  // for the life of the screen.
  await page.goto('/admin/journeys')
  const row = page.locator('[data-journey-id]').first()
  const cell = await row.locator('[data-cell="actions"]').boundingBox()
  const firstControl = await row.locator('[data-cell="actions"] a').first().boundingBox()

  expect(cell, 'the row drew no actions cell').not.toBeNull()
  expect(firstControl, 'the actions cell drew no controls').not.toBeNull()
  // The controls start at or after their own column does. A cell whose content
  // begins before its own box is content printed over its neighbour.
  expect(firstControl?.x ?? 0).toBeGreaterThanOrEqual(cell?.x ?? 0)
})

test('leaves the journey’s name a column it can be read in, at every width', async ({ page }) => {
  // The other half of the same measurement, and the one the `mobile` project is
  // for: at 390px the base ladder's fixed tracks and the controls together
  // exceeded the row, and the name column was crushed to a few pixels — every
  // journey rendered as "S.", "B.", "P.". The card scrolls instead.
  await page.goto('/admin/journeys')
  const name = await page.locator('[data-journey-id]').first().locator('[data-cell="name"]').boundingBox()

  expect(name, 'the row drew no name cell').not.toBeNull()
  // The floor `journeys.module.css` states and derives; a name cell under it is
  // the crushed state, whatever the viewport.
  expect(name?.width ?? 0).toBeGreaterThanOrEqual(120)
})

test('lines each heading up with the column beneath it, at every width', async ({ page }) => {
  // THE DEFECT THE FIRST FIX INTRODUCED, and the reason this case exists rather
  // than a second look at a screenshot. Sizing the actions track to
  // `max-content` stopped the controls overflowing — and silently broke the
  // alignment, because the header row and the body rows are two grids: the
  // header's actions cell is empty, so its `max-content` is zero, so every
  // heading after it sat over the wrong column. The track is a fixed width
  // again for exactly this reason (docs/deviations.md §55).
  await page.goto('/admin/journeys')
  const row = page.locator('[data-journey-id]').first()

  let measured = 0
  for (const column of ['status', 'edited']) {
    const heading = await page.locator(`[data-heading="${column}"]`).boundingBox()
    const cell = await row.locator(`[data-cell="${column}"]`).boundingBox()
    // `edited` is `display: none` below its rung, so at `mobile` only `status`
    // is measurable — which is correct, and is also how this case could come to
    // measure NOTHING if a later change hid or renamed both. The counter below
    // is what stops that being a silent pass (review round 1, finding 7).
    if (heading === null || cell === null) continue
    measured += 1
    // One pixel of slack for sub-pixel track rounding, and no more: a heading
    // over the wrong column is out by tens.
    expect(Math.abs(heading.x - cell.x), `the ${column} heading is not over its own cells`).toBeLessThanOrEqual(1)
  }

  expect(measured, 'this case compared no heading against any cell').toBeGreaterThan(0)
})

test('keeps every status chip reachable, at every width', async ({ page, viewport }) => {
  // The `mobile` baseline showed the fifth chip cut off at the right edge, and
  // the shell's content area is `overflow-x: hidden` — so "Archived" was not
  // merely off-screen, it was unreachable. A chip row that does not wrap is a
  // filter nobody on a phone can select.
  await page.goto('/admin/journeys')
  const chip = await page.locator('[data-chip="archived"]').boundingBox()

  expect(chip, 'the screen drew no Archived chip').not.toBeNull()
  expect((chip?.x ?? 0) + (chip?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0)
})
