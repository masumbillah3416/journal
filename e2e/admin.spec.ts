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
 * IT ALSO WALKS THE ONE WIDTH NO PROJECT CONFIGURES. Both admin screens have a
 * middle shape that none of `desktop`, `mid` or `mobile` renders, and the
 * editor's middle rung shipped 16px wrong for a fix round because of it. The
 * `test.describe` block near the end resizes to 1200 rather than adding a fourth
 * project — see its own comment for what that would have cost in baselines, and
 * why a photograph is the wrong instrument for a threshold.
 *
 * SINCE PHASE 4 TASK 5 IT ALSO WALKS THE JOURNEY EDITOR, and the case that
 * matters there is the one no Vitest project can write either: the rail's ↑ is
 * a form, so moving a page is a `POST`, a write to Postgres and a re-render —
 * and the assertion RELOADS THE PAGE before reading the order back, so what it
 * compares came out of the database rather than out of React state. Its
 * fixture is a journey of its own, created and deleted here, because
 * reordering a SEEDED journey's pages would leave the developer's own `diary`
 * database changed for every screenshot taken after it.
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
 * SINCE PHASE 4 TASK 9 IT ALSO WALKS THE GALLERIES SCREEN, and the case that
 * matters there is again one no Vitest project can write: a drag is a browser
 * gesture, a Server Action is dispatched under an opaque action id, and the
 * assertion RELOADS the page before reading the order back — so what it
 * compares came out of Postgres. A second case does the same rearrangement
 * with the keyboard, because a grid that is only draggable is not operable.
 * Both work on a journey of their own, created and deleted here, so that
 * dragging leaves the developer's `diary` database exactly as it was.
 *
 * SINCE PHASE 4 TASK 11 IT ALSO WALKS THE PUBLISH SCREEN, and that block is
 * the one with a hazard the others do not have: publishing cannot be undone.
 * There is no operation that turns a published version back into the draft it
 * came from, so the case works on two journeys of its own AND clears every
 * other tick on the screen before it presses anything — a press with the
 * developer's own pending drafts still ticked would publish them irreversibly.
 * What it measures is the half no Vitest project reaches: the ticked change
 * appears in the book a reader is served, at the address the diary serves it
 * at, and the unticked one does not.
 *
 * Depends on: @playwright/test, sharp (the galleries fixture's real uploads),
 * the running app from playwright.config.ts's `webServer`,
 * `./support/adminSession` (the guard needs a real session — see that file for
 * why a browser cannot sign itself in here),
 * `@travel-diary/domain/admin/navigation`, and `getPayload` for the two
 * fixtures this file has to clean up itself.
 */
import { ADMIN_NAV, activeNavId } from '@travel-diary/domain/admin/navigation'
import { userId } from '@travel-diary/domain/ids'
import { contrastRatio } from '@travel-diary/domain/contrast'
import { pagePath } from '@travel-diary/domain/pageAddress'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { adminScope, type AdminScope } from '../apps/web/lib/admin/adminScope'
import { writeJourneyPlace } from '../apps/web/lib/admin/bookMutations'
import { getPayload } from '../apps/web/lib/payload'
import { publishSelection } from '../apps/web/lib/admin/publishSelection'
import { readEditions } from '../apps/web/lib/admin/readPendingChanges'
import { readBookBundle } from '../apps/web/lib/readBookBundle'
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

/**
 * What the editor case's own journey is called.
 *
 * Its own journey, not a seeded one: the case REORDERS pages, and doing that to
 * seeded data would leave the developer's `diary` database changed for every
 * baseline taken afterwards.
 * @param testInfo - Playwright's own per-test information.
 * @returns The journey's name.
 */
const editorJourneyName = (testInfo: {
  readonly project: { readonly name: string }
  readonly workerIndex: number
}): string => `Editor ${label(testInfo)}`

/**
 * The journey SCREENS.md §2.6's own case makes, and unmakes.
 * @param testInfo - The running test, for the worker's own label.
 * @returns A name no other worker's fixture can collide with.
 */
const bookJourneyName = (testInfo: {
  readonly project: { readonly name: string }
  readonly workerIndex: number
}): string => `Bookmark ${label(testInfo)}`

/**
 * A real {@link AdminScope} for this worker's own fixture account.
 *
 * NOT A HAND-BUILT OBJECT. `writeJourneyPlace` spreads a scope into every call
 * it makes, and the point of borrowing the product's write rather than copying
 * it is that the spec exercises what the screen exercises — including
 * `overrideAccess: false`. The account is the one `beforeEach` already minted a
 * session for, found by the address that helper composes.
 * @param testInfo - The running test.
 * @returns The scope to spread.
 * @throws When the fixture account is not there, which means `beforeEach` did
 *   not run and every other case in this file is about to fail differently.
 */
const fixtureScope = async (testInfo: {
  readonly project: { readonly name: string }
  readonly workerIndex: number
}): Promise<AdminScope> => {
  const payload = await getPayload()
  const found = await payload.find({
    collection: 'users',
    where: { email: { equals: `${label(testInfo)}@${SESSION_FIXTURE_DOMAIN}` } },
    limit: 1,
    depth: 0,
  })
  const account = found.docs[0]
  if (account === undefined) throw new Error('the fixture account this worker signs in as is not there')
  const branded = userId(String(account.id))
  if (!branded.ok) throw new Error(branded.error)
  return adminScope({ user: branded.value })
}

/**
 * A computed `rgb(r, g, b)` as the `#rrggbb` `contrastRatio` takes.
 *
 * `getComputedStyle` answers in `rgb()` however a stylesheet spelled the colour,
 * and `@travel-diary/domain/contrast` is the WCAG arithmetic this repository
 * already uses — so the conversion belongs here rather than a second ratio.
 * @param computed - What the browser answered.
 * @returns The same colour as a hex string.
 * @throws {Error} When the browser answered something this cannot read, which
 *   is a changed engine rather than a failed assertion.
 */
const asHex = (computed: string): string => {
  const channels = /rgba?\((\d+),\s*(\d+),\s*(\d+)/u.exec(computed)
  if (channels === null) throw new Error(`cannot read a colour out of ${computed}`)
  return `#${channels
    .slice(1, 4)
    .map((channel) => Number(channel).toString(16).padStart(2, '0'))
    .join('')}`
}

/** The editor fixture's row ids, filled in by `beforeAll`. */
const editorFixture: { journey: number; pages: number[] } = { journey: 0, pages: [] }

test.beforeAll(async ({}, testInfo) => {
  const payload = await getPayload()
  const name = editorJourneyName(testInfo)
  // A previous crashed run would otherwise collide with the unique `slug`.
  const stale = await payload.find({ collection: 'journeys', where: { name: { like: name } }, pagination: false })
  for (const journey of stale.docs) {
    await payload.delete({ collection: 'pages', where: { journey: { equals: journey.id } } })
  }
  await payload.delete({ collection: 'journeys', where: { name: { like: name } } })

  const journey = await payload.create({
    collection: 'journeys',
    data: {
      name,
      place: 'Norway',
      slug: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
      dates: '2 - 9 May 2026',
      _status: 'published',
    },
  })
  editorFixture.journey = journey.id
  editorFixture.pages = []
  for (const [order, title] of ['Notes', 'Frames I', 'Frames II'].entries()) {
    const created = await payload.create({
      collection: 'pages',
      data: {
        journey: journey.id,
        kind: title === 'Notes' ? 'notes' : 'frames',
        title,
        order,
        layout: title === 'Notes' ? 'text-spread' : 'three-up',
        _status: 'published',
      },
    })
    editorFixture.pages.push(created.id)
  }
})

test.afterAll(async ({}, testInfo) => {
  const payload = await getPayload()
  const editorName = editorJourneyName(testInfo)
  const mine = await payload.find({
    collection: 'journeys',
    where: { name: { like: editorName } },
    pagination: false,
    depth: 0,
  })
  for (const journey of mine.docs) {
    await payload.delete({ collection: 'pages', where: { journey: { equals: journey.id } } })
  }
  await payload.delete({ collection: 'journeys', where: { name: { like: editorName } } })
})

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
  await expect(page.locator('[data-admin-overview]')).toBeVisible()

  await expect(page.locator('a[data-nav-id]')).toHaveCount(ADMIN_NAV.length)
})

test('marks the overview button current on /admin, and only that one', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.locator('[data-admin-overview]')).toBeVisible()

  const current = page.locator('a[aria-current="page"]')
  await expect(current).toHaveCount(1)
  await expect(current).toHaveAttribute('data-nav-id', activeNavId('/admin') ?? '')
})

test('titles the screen with the overview entry’s own label, once', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.locator('[data-admin-overview]')).toBeVisible()

  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toHaveCount(1)
  await expect(heading).toHaveText(ADMIN_NAV.find((entry) => entry.href === '/admin')?.label ?? '')
})

test('prints a real number beside the media button, from the database rather than the markup', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.locator('[data-admin-overview]')).toBeVisible()

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

test('draws the journey editor\u2019s three columns for a journey that exists', async ({ page }) => {
  await page.goto(`/admin/journeys/${String(editorFixture.journey)}`)
  await expect(page.locator('[data-journey-editor]')).toBeVisible()

  await expect(page.locator('[data-page-rail]')).toBeVisible()
  await expect(page.locator('[data-layout-picker]')).toBeVisible()
  await expect(page.locator('[data-journey-pool]')).toBeVisible()
  // The rail drew a card per page, which a screen whose queries never reached
  // Postgres could not have done.
  await expect(page.locator('[data-page-id]')).toHaveCount(3)
})

test('moves a page up and keeps it moved after a reload, so the order came from Postgres', async ({ page }) => {
  // THE CASE NO VITEST PROJECT CAN WRITE. Everything between the arrow and the
  // rail \u2014 Next's action id, the guard, Zod over the FormData, the
  // version-safe write and the revalidate \u2014 runs only in a browser against
  // a real server. The RELOAD is what makes the assertion about the database:
  // without it the same markup could have come from the re-render alone.
  const second = editorFixture.pages[1]
  const address = `/admin/journeys/${String(editorFixture.journey)}?page=${String(second ?? 0)}`

  await page.goto(address)
  const before = await page
    .locator('[data-page-id]')
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-page-id')))
  expect(before).toEqual([...before].sort((one, two) => Number(one) - Number(two)))

  await page.locator('[data-page-tools] [data-move="up"]').click()
  await expect(page.locator('[data-page-id]').first()).toHaveAttribute('data-page-id', String(second))

  await page.goto(address)
  const after = await page
    .locator('[data-page-id]')
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-page-id')))
  expect(after).toEqual([before[1], before[0], before[2]])
})

test('writes the layout a glyph was pressed on, and still says so after a reload', async ({ page }) => {
  const first = editorFixture.pages[0]
  const address = `/admin/journeys/${String(editorFixture.journey)}?page=${String(first ?? 0)}`

  await page.goto(address)
  await page.locator('[data-layout="full-bleed"]').click()
  await expect(page.locator('[data-layout="full-bleed"][aria-pressed="true"]')).toHaveCount(1)

  await page.goto(address)
  await expect(page.locator('[data-layout="full-bleed"][aria-pressed="true"]')).toHaveCount(1)
})

/**
 * The viewport at which both admin screens take their MIDDLE shape.
 *
 * ═══ WHY A RESIZE AND NOT A FOURTH PLAYWRIGHT PROJECT ═══
 *
 * Neither the editor's two-column shape nor the journeys table's middle set of
 * columns is drawn at any of the three configured viewports: the editor's
 * container is 1142 at `desktop` (three columns) and 718 at `mid` (one), and the
 * table's is the same pair. `docs/deviations.md` §55 records that gap for the
 * table and the journey editor's sweep records it for the editor — and the
 * middle rung shipped 16px wrong for a whole fix round precisely because no
 * surface renders it.
 *
 * A fourth project at 1200 was the obvious closer and costs more than it looks:
 * `e2e/visual.spec.ts` holds 21 screenshot cases and 59 committed baselines, and
 * a fourth project adds a baseline per case — each needing a container run with
 * the developer's `diary` database locked to it, which Task 4 paid seven
 * baselines to learn. And the thing a baseline would add is the thing this class
 * of defect is known not to show: Task 4 measured that baselines do not catch a
 * threshold moving, and the editor's own sweep found the shape missing entirely
 * while every screenshot of it looked like what it was supposed to be.
 *
 * So the shape is WALKED rather than photographed, with assertions about the
 * tracks themselves, which is stronger than a picture and costs one case.
 */
const MIDDLE_VIEWPORT = { width: 1200, height: 900 }

test.describe('at the width where both admin screens take their middle shape', () => {
  // ONE PROJECT, because each case sets its own viewport: running the identical
  // assertion three times would measure the same thing three times. The skip is
  // inside each case rather than on the block, because a describe-level
  // `test.skip` callback is handed the fixtures and not the test info.
  test('draws the journey editor in two columns, with the pool spanning both', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'each case here fixes its own viewport')
    // At 1200 the editor's container is `1200 − 238 (the rail) − 60 (the content
    // area's padding above 1179) = 902`, which is between the 816 and 1120 rungs
    // — SCREENS.md §2.3's middle shape, `168px | minmax(0,1fr)` with the pool at
    // `1 / -1`. The prototype agrees: its own `clientWidth` is 962, between 860
    // and 1180.
    await page.setViewportSize(MIDDLE_VIEWPORT)
    await page.goto(`/admin/journeys/${String(editorFixture.journey)}`)
    await expect(page.locator('[data-editor-grid]')).toBeVisible()

    const tracks = await page.locator('[data-editor-grid]').evaluate((node) => {
      const style = getComputedStyle(node)
      return { columns: style.gridTemplateColumns.split(' ').length, first: style.gridTemplateColumns.split(' ')[0] }
    })
    expect(tracks.columns).toBe(2)
    expect(tracks.first).toBe('168px')

    // The pool spans both tracks here and takes its own at the widest rung.
    const spans = await page
      .locator('[data-journey-pool]')
      .evaluate((node) => getComputedStyle(node).gridColumnStart + ' / ' + getComputedStyle(node).gridColumnEnd)
    expect(spans).toBe('1 / -1')
  })

  test('drops the journeys table to its middle set of columns', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'each case here fixes its own viewport')
    // The same width for the table next door: at a container of 902 the ladder
    // shows `pages` (720), `edited` (800) and `media` (880) and still hides
    // `dates` (1000). `desktop` shows all four and `mid` shows none of them, so
    // this is the only surface that walks the middle.
    await page.setViewportSize(MIDDLE_VIEWPORT)
    await page.goto('/admin/journeys')
    const row = page.locator('[data-journey-id]').first()
    await expect(row).toBeVisible()

    await expect(row.locator('[data-cell="pages"]')).toBeVisible()
    await expect(row.locator('[data-cell="edited"]')).toBeVisible()
    await expect(row.locator('[data-cell="media"]')).toBeVisible()
    await expect(row.locator('[data-cell="dates"]')).toBeHidden()
  })
})

test('keeps every field of the notes pane inside its card, at every surface', async ({ page }) => {
  // NOTES-001 (`docs/qa/2026-09-19-notes-pane-sweep.md`). At 390px the tally's
  // right-hand column was drawn 196px past the pane's right edge, and the shell
  // clips rather than scrolls — so two of the four cells could not be seen and
  // could not be typed into. §2.3 gives the tally no narrow variant: it is four
  // cells in two columns, and a field an author cannot reach on a phone is a
  // field that does not exist there.
  //
  // THE ASSERTION IS ABOUT REACHABILITY, NOT ABOUT A TRACK SIZING FUNCTION.
  // `minmax(0, 1fr)` is how it is fixed today; "nothing is drawn outside the
  // card" is what has to stay true, and it catches the next element that
  // refuses to shrink as well as this one. The message names the offenders, so
  // a failure says WHICH element rather than only that the number moved.
  const notes = editorFixture.pages[0]
  await page.goto(`/admin/journeys/${String(editorFixture.journey)}?page=${String(notes ?? 0)}`)
  await expect(page.locator('[data-notes-pane]')).toBeVisible()

  const escaped = await page.locator('[data-notes-pane]').evaluate((pane) => {
    const edge = pane.getBoundingClientRect().right
    return {
      overflow: pane.scrollWidth - pane.clientWidth,
      outside: [...pane.querySelectorAll('*')]
        .filter((element) => element.getBoundingClientRect().right > edge + 1)
        .map((element) => `${element.tagName.toLowerCase()} ${element.className}`)
        .slice(0, 6),
    }
  })

  expect(escaped.outside, 'these elements are drawn outside the pane').toEqual([])
  expect(escaped.overflow).toBeLessThanOrEqual(0)
})

test('answers a journey address nobody owns with a not-found page rather than a stack trace', async ({ page }) => {
  const response = await page.goto('/admin/journeys/2000000000')

  expect(response?.status()).toBe(404)
  await expect(page.locator('[data-journey-editor]')).toHaveCount(0)
})

/**
 * The galleries fixture's row ids, filled in by its own `beforeAll`.
 *
 * ITS OWN JOURNEY, NOT A SEEDED ONE. The case below WRITES: it rearranges a
 * gallery and reads the new order back after a reload, which is the only way
 * to prove the write reached Postgres. Dragging a seeded journey's frames
 * would leave the developer's own `diary` database rearranged for every
 * screenshot taken afterwards — which is what the journey editor's page-order
 * case already avoids, and for the same reason.
 */
const galleryFixture: { journey: number; frames: number[] } = { journey: 0, frames: [] }

/**
 * The name this worker's galleries fixture carries.
 * @param testInfo - Playwright's own run info.
 * @returns A name unique to this project and worker.
 */
const galleryJourneyName = (testInfo: {
  readonly project: { readonly name: string }
  readonly workerIndex: number
}): string => `Gallery ${label(testInfo)}`

test.describe('the galleries screen (SCREENS.md §2.5)', () => {
  test.beforeAll(async ({}, testInfo) => {
    const payload = await getPayload()
    const name = galleryJourneyName(testInfo)
    const stale = await payload.find({ collection: 'journeys', where: { name: { like: name } }, pagination: false })
    for (const journey of stale.docs) {
      await payload.delete({ collection: 'media', where: { journey: { equals: journey.id } } })
    }
    await payload.delete({ collection: 'journeys', where: { name: { like: name } } })

    const journey = await payload.create({
      collection: 'journeys',
      data: {
        name,
        place: 'Norway',
        slug: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
        dates: '2 - 9 May 2026',
        _status: 'published',
      },
    })
    galleryFixture.journey = journey.id
    galleryFixture.frames = []
    for (const order of [0, 1, 2]) {
      const png = await sharp({
        create: { width: 800, height: 800, channels: 3, background: { r: 20 * order, g: 40, b: 60 } },
      })
        .png()
        .toBuffer()
      const created = await payload.create({
        collection: 'media',
        data: { journey: journey.id, alt: `${name} ${String(order)}`, state: 'ready', order },
        file: {
          data: png,
          mimetype: 'image/png',
          name: `${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${String(order)}.png`,
          size: png.length,
        },
      })
      galleryFixture.frames.push(created.id)
    }
  })

  test.afterAll(async ({}, testInfo) => {
    const payload = await getPayload()
    const name = galleryJourneyName(testInfo)
    const mine = await payload.find({
      collection: 'journeys',
      where: { name: { like: name } },
      pagination: false,
      depth: 0,
    })
    for (const journey of mine.docs) {
      await payload.delete({ collection: 'media', where: { journey: { equals: journey.id } } })
    }
    await payload.delete({ collection: 'journeys', where: { name: { like: name } } })
  })

  test.beforeEach(async () => {
    // EACH CASE HERE REARRANGES, so each one starts from the arrangement the
    // fixture was written in. Without this the second case inherits the first
    // case's move and asks a question about an order nobody set up — which is
    // exactly what it did, once.
    const payload = await getPayload()
    for (const [order, id] of galleryFixture.frames.entries()) {
      await payload.update({ collection: 'media', id, data: { order } })
    }
  })

  test('moves the cover to the frame an author drags to the front, and it is still there after a reload', async ({
    page,
  }) => {
    // THE ONE CASE NO VITEST PROJECT CAN WRITE. A drag is a browser gesture, a
    // Server Action is dispatched under an opaque action id, and the assertion
    // RELOADS THE PAGE before reading the order back — so what it compares came
    // out of Postgres rather than out of React state.
    //
    // IT WAITS FOR THE ACTION'S OWN RESPONSE BEFORE RELOADING, and that is not
    // a flake guard bolted on: the grid moves the tile OPTIMISTICALLY and
    // §2.5 draws no saved state (`docs/deviations.md` §60), so there is nothing
    // on screen that says the write landed. Reloading on the optimistic paint
    // alone raced the `POST` and read the old order back — measured, twice.
    const third = galleryFixture.frames[2]
    const first = galleryFixture.frames[0]
    expect(third, 'the fixture wrote three frames').toBeDefined()

    await page.goto(`/admin/galleries?journey=${String(galleryFixture.journey)}`)
    await expect(page.locator('[data-frame-grid]')).toBeVisible()
    await expect(page.locator('[data-cover-chip]')).toHaveCount(1)
    await expect(
      page.locator(`[data-frame-id="${String(first)}"] [data-cover-chip]`),
      'the gallery starts with its first frame as the cover',
    ).toHaveCount(1)

    const [response] = await Promise.all([
      page.waitForResponse(
        (answer) => answer.request().method() === 'POST' && answer.url().includes('/admin/galleries'),
      ),
      page.dragAndDrop(`[data-frame-cell="${String(third)}"]`, `[data-frame-cell="${String(first)}"]`),
    ])
    expect(response.ok(), 'the arrangement was accepted').toBe(true)
    await expect(page.locator(`[data-frame-id="${String(third)}"] [data-cover-chip]`)).toHaveCount(1)

    await page.reload()

    await expect(
      page.locator(`[data-frame-id="${String(third)}"] [data-cover-chip]`),
      'the chip moved with the frame, and the reload proves the write landed',
    ).toHaveCount(1)
    await expect(page.locator('[data-cover-chip]')).toHaveCount(1)
  })

  test('draws each tile’s grip inside that tile, at every width §2.5 names', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'this case fixes its own viewports')
    // GAL-003 (`docs/qa/2026-09-20-galleries-screen-sweep.md`). §2.5: "Tiles
    // carry an index badge, a three-bar grip top-right". The grip belongs to
    // the tile, and an absolutely positioned child is only where it looks like
    // it is when something above it is positioned.
    //
    // THE ASSERTION IS ABOUT THE BOX, NOT ABOUT A CSS PROPERTY. `position:
    // relative` on the cell is how it is fixed today; "the grip is inside its
    // own tile" is what has to stay true, and it catches the next element that
    // escapes as well as this one.
    for (const width of [1440, 1200, 1000, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/admin/galleries?journey=${String(galleryFixture.journey)}`)
      await expect(page.locator('[data-frame-grid]')).toBeVisible()

      const escaped = await page.evaluate(() =>
        [...document.querySelectorAll('[data-frame-grip]')].flatMap((grip) => {
          const tile = grip.parentElement?.querySelector('button[data-frame-id]')
          if (tile === null || tile === undefined) return ['a grip with no tile beside it']
          const g = grip.getBoundingClientRect()
          const t = tile.getBoundingClientRect()
          const inside =
            g.left >= t.left - 1 && g.right <= t.right + 1 && g.top >= t.top - 1 && g.bottom <= t.bottom + 1
          return inside
            ? []
            : [
                `${tile.getAttribute('data-frame-id') ?? '?'}: grip at ${String(Math.round(g.left))},${String(Math.round(g.top))} tile at ${String(Math.round(t.left))},${String(Math.round(t.top))}`,
              ]
        }),
      )

      expect(escaped, `these grips are drawn outside their tiles at ${String(width)}px`).toEqual([])
    }
  })

  test('takes §2.5’s two column shapes at the widths the shell puts them at', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'this case fixes its own viewports')
    // GAL-004 (`docs/qa/2026-09-20-galleries-screen-sweep.md`). §2.5 gives the
    // panel 286px above 1180 and 258px above 860 — the prototype's own VIEWPORT
    // numbers. A container query measures the content box, so those become 1120
    // and 816 here, converted with the gutter in force where each transitions;
    // `editor.module.css`'s header carries the same arithmetic for §2.3, and
    // EDITOR-003 is what transcribing them straight in cost there.
    //
    // MEASURED IN THE BROWSER, because the conversion is only right if the
    // shape actually appears at the design's own 1440 reference — which is
    // exactly what a stylesheet cannot tell you.
    const panelAt = async (width: number): Promise<string> => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/admin/galleries?journey=${String(galleryFixture.journey)}`)
      await expect(page.locator('[data-frame-grid]')).toBeVisible()
      return page.evaluate(() => {
        const columns = document.querySelector('[data-frame-grid]')?.parentElement?.parentElement
        return columns === null || columns === undefined ? 'none' : getComputedStyle(columns).gridTemplateColumns
      })
    }

    const widest = await panelAt(1440)
    const middle = await panelAt(1200)
    const stacked = await panelAt(700)

    expect({
      widest: widest.split(' ').at(-1),
      middle: middle.split(' ').at(-1),
      stackedTracks: stacked.split(' ').length,
    }).toEqual({ widest: '286px', middle: '258px', stackedTracks: 1 })
  })

  test('lets a keyboard rearrange the gallery two places at a time, which a drag alone would not', async ({ page }) => {
    // A GRID THAT IS ONLY DRAGGABLE IS NOT OPERABLE. The grip is a real button
    // and its arrow keys move the frame one place; this is the case that says
    // so in a browser rather than in jsdom.
    //
    // TWO PRESSES, BACK TO BACK, AND THE FOCUS IS ASSERTED. An earlier version
    // of this case pressed once and its comment said a second press was flaky
    // because React moves the grip's DOM node and the browser loses focus
    // across the move. **That was false, and measured false** — the node moves,
    // the focus stays on the grip, and both writes land (task-9-review.md
    // MEDIUM-4). An understated capability is as wrong as an overstated one, so
    // the case now presses twice and reads the focus back.
    const third = galleryFixture.frames[2]
    const posts: string[] = []
    page.on('response', (answer) => {
      if (answer.request().method() === 'POST' && answer.url().includes('/admin/galleries')) posts.push(answer.url())
    })

    await page.goto(`/admin/galleries?journey=${String(galleryFixture.journey)}`)
    await expect(page.locator('[data-frame-grid]')).toBeVisible()

    await page.locator(`[data-frame-grip="${String(third)}"]`).focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect.poll(() => posts.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2)

    await expect(
      page.locator(`[data-frame-id="${String(third)}"] [data-cover-chip]`),
      'two presses moved it two places, to the front',
    ).toHaveCount(1)
    expect(
      await page.evaluate(
        () => document.activeElement?.getAttribute('data-frame-grip') ?? document.activeElement?.tagName,
      ),
      'the grip keeps focus across both moves',
    ).toBe(String(third))

    await page.reload()

    await expect(
      page.locator(`[data-frame-id="${String(third)}"] [data-cover-chip]`),
      'a keyboard moved the frame to the front, and the reload proves the write landed',
    ).toHaveCount(1)
  })
})

test.describe('the book and cover screens', () => {
  // SCREENS.md §2.6 and §2.7. Everything here writes GLOBALS or `journeys.order`,
  // which are one row each for the whole diary — so every case that writes
  // records what it found and puts it back, in the case itself rather than in an
  // `afterAll` that a failure would skip. Standing orders §9: a sweep once wrote
  // a real value to the developer's own database by pressing an arrow.

  test('draws §2.6’s list with a row per page-group of the book, fixed rows included', async ({ page }) => {
    await page.goto('/admin/book')

    await expect(page.locator('[data-admin-book]')).toBeVisible()
    await expect(page.locator('[data-bookmark-kind="cover"]')).toHaveCount(1)
    await expect(page.locator('[data-bookmark-kind="contents"]')).toHaveCount(1)
    await expect(page.locator('[data-bookmark-kind="about"]')).toHaveCount(1)
    await expect(page.locator('[data-bookmark-kind="journey"]').first()).toBeVisible()
  })

  test('refuses to move Cover, Contents and About, in a real browser and not only in jsdom', async ({ page }) => {
    await page.goto('/admin/book')
    await expect(page.locator('[data-bookmark-order]')).toBeVisible()

    for (const kind of ['cover', 'contents', 'about']) {
      for (const direction of ['up', 'down']) {
        await expect(
          page.locator(`[data-bookmark-kind="${kind}"] [data-bookmark-move="${direction}"]`),
          `${kind}'s ${direction} arrow is fixed`,
        ).toBeDisabled()
      }
    }
  })

  test('moves a journey up and keeps it moved after a reload, so the order came from Postgres', async ({
    page,
  }, testInfo) => {
    // IT WRITES THE DEVELOPER'S OWN DATABASE, so it reads every journey's
    // `order` AND `_status` first and writes them all back at the end.
    const payload = await getPayload()
    const scope = await fixtureScope(testInfo)

    // A JOURNEY CARRYING A PENDING DRAFT, MADE ON PURPOSE. `journeys` is
    // versioned, so a one-line `payload.update({ data: { order } })` merges from
    // the NEWEST VERSION and writes an author's unpublished text into the live
    // row — the Task 4 trap `bookMutations.ts`'s `writeJourneyPlace` exists to
    // avoid, and the one this case's own restore loop sprang on every run while
    // reporting a clean restore (task-10-review.md HIGH-2). The fixture is what
    // makes the restore's self-check able to see it: a diary whose journeys all
    // happen to be published cannot.
    const drafted = await payload.create({
      collection: 'journeys',
      depth: 0,
      data: {
        name: `${bookJourneyName(testInfo)} live`,
        place: 'Nowhere',
        slug: bookJourneyName(testInfo)
          .toLowerCase()
          .replaceAll(/[^a-z0-9]+/gu, '-'),
        dates: '1 - 2 March 2026',
        _status: 'published',
      },
    })
    await payload.update({
      collection: 'journeys',
      depth: 0,
      id: drafted.id,
      draft: true,
      data: { name: `${bookJourneyName(testInfo)} unpublished rewrite`, _status: 'draft' },
    })

    const before = await payload.find({
      collection: 'journeys',
      depth: 0,
      pagination: false,
      limit: 1000,
      sort: 'order',
    })

    // THE ACTION'S OWN RESPONSE IS WAITED FOR, not the re-render. A Server
    // Action is a `POST` to the screen's own address, and reloading before it
    // answers reads the order back BEFORE the write — which is how this case
    // first failed, green product and all.
    const posts: string[] = []
    page.on('response', (answer) => {
      if (answer.request().method() === 'POST' && answer.url().includes('/admin/book')) posts.push(answer.url())
    })

    try {
      await page.goto('/admin/book')
      const rows = page.locator('[data-bookmark-kind="journey"]')
      await expect(rows.first()).toBeVisible()
      // THE NAME, not the row's whole text: the row prints its own "p. {n}",
      // and a journey that moves changes the page it opens at — so comparing
      // the rendered text against itself would fail on a move that worked.
      const names = await page.locator('[data-bookmark-kind="journey"] [data-bookmark-name]').allInnerTexts()
      test.skip(names.length < 2, 'this case needs two journeys in the book')

      await rows.nth(1).locator('[data-bookmark-move="up"]').click()
      await expect.poll(() => posts.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1)
      await page.reload()

      const after = await page.locator('[data-bookmark-kind="journey"] [data-bookmark-name]').allInnerTexts()
      expect(after[0], 'the second journey is now the first, and the reload proves the write landed').toBe(names[1])
    } finally {
      // RESTORED THROUGH THE PRODUCT'S OWN WRITE, not through a bare
      // `payload.update`. `writeJourneyPlace` is exported for exactly this: a
      // second copy of the two-write shape in a spec file is a second place for
      // the trap to be re-made, which is how it got here.
      for (const journey of before.docs) {
        await writeJourneyPlace(payload, scope, journey.id, journey.order ?? null)
      }

      // THE RESTORE IS VERIFIED, NOT ASSUMED, AND ON BOTH COLUMNS. Standing
      // orders §9: the dev database is not a scratchpad, and a restore loop that
      // silently put back nine rows of ten would leave the tenth for somebody to
      // find weeks later. Half this diary's journeys have never been arranged,
      // so their `order` is `null` — the state a write is most likely to fail to
      // reproduce. `_status` is here because checking `order` alone is what let
      // an UNPUBLISHED journey be reported as a clean restore: the column the
      // trap moves is not the column this case is about.
      const put = await payload.find({ collection: 'journeys', depth: 0, pagination: false, sort: 'id' })
      const wanted = new Map(
        before.docs.map((journey) => [journey.id, `${String(journey.order ?? null)}/${String(journey._status)}`]),
      )
      const wrong = put.docs.filter(
        (journey) => `${String(journey.order ?? null)}/${String(journey._status)}` !== wanted.get(journey.id),
      )
      const detail = wrong.map(
        (journey) =>
          `${String(journey.id)}: ${String(journey.order ?? null)}/${String(journey._status)} (wanted ${String(wanted.get(journey.id))})`,
      )

      await payload.delete({ collection: 'journeys', where: { name: { like: bookJourneyName(testInfo) } } })

      expect(detail, 'every journey was put back the way this case found it, order AND status').toEqual([])
    }
  })

  test('follows both sliders with their own readouts, which is §2.6 stated outright', async ({ page }) => {
    // THE ISLAND, IN A REAL ENGINE. jsdom asserts the same property, and jsdom
    // also renders a component the same whether or not Next.js emitted a client
    // entry for it — so this is the case that fails if the directive is dropped
    // and the bundle never reaches the browser. It presses a key rather than
    // dragging, and it SAVES NOTHING.
    await page.goto('/admin/book')
    const slider = page.locator('[data-flip-slider]')
    await expect(slider).toBeVisible()
    const before = await page.locator('[data-flip-readout]').innerText()

    await slider.focus()
    await page.keyboard.press('ArrowRight')

    await expect(page.locator('[data-flip-readout]')).not.toHaveText(before)
    await expect(page.locator('[data-flip-readout]')).toHaveText(/^\d+ ms$/)
  })

  test('takes §2.6’s and §2.7’s column shapes at the widths the shell puts them at', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'this case fixes its own viewports')
    // §2.6 gives `minmax(0,1fr) 340px` above 1180 and §2.7 two equal columns
    // above the same — the prototype's own VIEWPORT numbers. A container query
    // measures the content box, so that becomes 1120 here
    // (`book.module.css`'s header carries the arithmetic, and
    // `galleries.module.css`'s carries what transcribing it straight in cost).
    //
    // MEASURED IN THE BROWSER, because the conversion is only right if the shape
    // actually appears at the design's own 1440 reference.
    const tracksAt = async (path: string, marker: string, width: number): Promise<string> => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(path)
      await expect(page.locator(marker)).toBeVisible()
      return page.evaluate((selector) => {
        const screen = document.querySelector(selector)
        return screen === null ? 'none' : getComputedStyle(screen).gridTemplateColumns
      }, marker)
    }

    const bookWide = await tracksAt('/admin/book', '[data-book-columns]', 1440)
    const bookStacked = await tracksAt('/admin/book', '[data-book-columns]', 700)
    const coverWide = await tracksAt('/admin/cover', '[data-cover-columns]', 1440)
    const coverStacked = await tracksAt('/admin/cover', '[data-cover-columns]', 700)

    expect({
      bookSettingsColumn: bookWide.split(' ').at(-1),
      bookStackedTracks: bookStacked.split(' ').length,
      coverColumns: coverWide.split(' ').length,
      coverEqual: coverWide.split(' ')[0] === coverWide.split(' ')[1],
      coverStackedTracks: coverStacked.split(' ').length,
    }).toEqual({
      bookSettingsColumn: '340px',
      bookStackedTracks: 1,
      coverColumns: 2,
      coverEqual: true,
      coverStackedTracks: 1,
    })
  })

  test('keeps every control of §2.6’s settings card inside the card, at every width', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'this case fixes its own viewports')
    // BOOK-003 (`docs/qa/2026-09-20-book-and-cover-sweep.md`). Chromium gives
    // `input[type=range]` a 2px UA margin on each side, so a track declared
    // `width: 100%` is four pixels wider than the column it sits in — which
    // makes the two sliders the only controls on the card that do not line up
    // with its padding. Nothing scrolls and nothing is clipped, which is why a
    // screenshot threshold would never have found it.
    for (const width of [1440, 900, 412]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/admin/book')
      await expect(page.locator('[data-book-settings]')).toBeVisible()

      const escaped = await page.evaluate(() =>
        [...document.querySelectorAll('[data-book-settings] *')]
          .filter((element) => element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0)
          .map((element) => `${element.tagName}: ${element.textContent.trim().slice(0, 30)}`),
      )

      expect(escaped, `these controls are wider than their column at ${String(width)}px`).toEqual([])
    }
  })

  test('draws §2.7’s preview at its own 172x224 box, and fits the title rather than truncating it', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'this case fixes its own viewport')
    // THE ONE PLACE `SCREENS.md` §1.1's "Title must fit, not truncate" CAN BE
    // MEASURED on this screen. jsdom performs no layout, so nothing there
    // compares a drawn title against the box it sits in.
    //
    // IT COMPARES `scrollWidth` WITH `clientWidth`, NOT THE TWO RECTS, and that
    // is the whole finding. `.previewTitle` carries `max-width: 100%`,
    // `overflow-x: hidden`, `white-space: nowrap` and an ellipsis, so its BORDER
    // BOX is clamped to the preview's 144px content box at any font size
    // whatever — the rect comparison this case first made was true by
    // construction and stayed green with the size hard-coded to 90px, where the
    // title is ellipsised and `scrollWidth` is 362 (task-10-review.md HIGH-1).
    // The ellipsis is precisely the mechanism that hides a truncation from a
    // rect, and `scrollWidth > clientWidth` is what it cannot hide.
    //
    // THE TITLE IS TYPED, NOT SAVED. The preview is live, so a long title can be
    // measured without writing the developer's own `book` global — and a title
    // long enough to need shrinking is the only input that distinguishes a
    // fitter from a constant. 25 characters, comfortably inside the 32 the
    // clamp's floor can still hold (`coverTitle.test.ts` pins that boundary).
    const A_LONG_TITLE = 'Every Doorway I Have Pho'

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/admin/cover')
    const preview = page.locator('[data-cover-preview]')
    await expect(preview).toBeVisible()
    await page.locator('[data-cover-field="title"]').fill(A_LONG_TITLE)
    await expect(page.locator('[data-preview-title]')).toHaveText(A_LONG_TITLE)

    const box = await preview.boundingBox()
    const title = await page.locator('[data-preview-title]').evaluate((element) => ({
      scroll: element.scrollWidth,
      client: element.clientWidth,
      size: getComputedStyle(element).fontSize,
    }))

    expect({
      width: Math.round(box?.width ?? 0),
      height: Math.round(box?.height ?? 0),
      truncated: title.scroll > title.client,
      sized: title.size !== '',
    }).toEqual({ width: 172, height: 224, truncated: false, sized: true })
  })

  test('changes the cover cloth and the diary’s own cover follows, which is what this screen is for', async ({
    page,
  }) => {
    // THE BRIEF'S OWN CASE, at `/p/1` rather than `/p/0`: `addressedPageIndex`
    // refuses `0` outright (`/p/<n>` is 1-based, and a leading zero would be a
    // second address for the same page), so `/p/0` is a 404 and the assertion
    // would have been made against a not-found page.
    //
    // IT WRITES THE DEVELOPER'S OWN GLOBAL, so it puts the cloth back.
    const payload = await getPayload()
    const before = await payload.findGlobal({ slug: 'book', depth: 0, select: { coverCloth: true } })
    const wanted = before.coverCloth === '#7a3b32' ? '#3d4257' : '#7a3b32'

    const posts: string[] = []
    page.on('response', (answer) => {
      if (answer.request().method() === 'POST' && answer.url().includes('/admin/cover')) posts.push(answer.url())
    })

    // READ OFF `--cover-cloth`, WHICH IS THE VALUE THE GRADIENT IS BUILT FROM,
    // rather than off the computed `background-image`. Two reasons, and the
    // second was measured: the custom property is the thing this screen writes,
    // so comparing it says WHICH cloth arrived rather than only that something
    // moved; and `/p/<n>` is served by TWO surfaces — below 860px the
    // middleware rewrites it to the mobile reading mode, which draws its own
    // cover from the same property on a different element. A case written
    // against `[data-page="cover"]` fell back to `document.body` there and
    // compared "none" with "none" (BOOK-002).
    const clothDrawn = async (): Promise<string> =>
      page.evaluate(() => {
        const cover = document.querySelector('[style*="--cover-cloth"]')
        return cover === null
          ? 'no cover on this surface'
          : getComputedStyle(cover).getPropertyValue('--cover-cloth').trim()
      })

    try {
      await page.goto('/p/1')
      const wasDrawn = await clothDrawn()

      await page.goto('/admin/cover')
      await expect(page.locator('[data-cover-preview]')).toBeVisible()
      await page.locator(`[data-cover-cloth="${wanted}"]`).click()
      await expect(page.locator(`[data-cover-cloth="${wanted}"]`)).toHaveAttribute('aria-pressed', 'true')
      await page.locator('[data-save-cover]').click()
      // THE ACTION'S OWN RESPONSE, for the reason the bookmark case gives: the
      // island's pressed state changes the instant the swatch is clicked, so
      // asserting THAT and navigating would read the diary before the write.
      await expect.poll(() => posts.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1)

      await page.goto('/p/1')

      expect(
        { before: wasDrawn, after: await clothDrawn() },
        'the cover the reader sees is painted in the cloth the admin saved, on whichever surface serves it',
      ).toEqual({ before: before.coverCloth, after: wanted })
    } finally {
      await payload.updateGlobal({ slug: 'book', data: { coverCloth: before.coverCloth ?? '#2f4a47' } })
    }
  })
})

/** The Publish fixture's two journeys, per project and worker, filled in by the case. */
const publishFixture: { first: number; second: number } = { first: 0, second: 0 }

/**
 * What this file's Publish fixtures are called, per project and worker.
 * @param testInfo - Playwright's own per-test information.
 * @returns The name stem both journeys carry.
 */
const publishJourneyName = (testInfo: {
  readonly project: { readonly name: string }
  readonly workerIndex: number
}): string => `Publish ${label(testInfo)}`

test.describe('the publish screen (SCREENS.md §2.8)', () => {
  // IT PUBLISHES, WHICH IS THE ONE WRITE NOTHING CAN PUT BACK. Publishing a
  // draft makes it the live row, and there is no operation that un-publishes a
  // version into the draft it came from — so this block works on two journeys
  // of its own and, before it presses anything, CLEARS EVERY OTHER TICK on the
  // screen. Standing orders §9: the dev database is not a scratchpad, and a
  // press that published the developer's own pending drafts would be
  // irreversible rather than merely untidy.

  test('publishes the ticked change and leaves the unticked one, measured in the book a reader gets', async ({
    page,
  }, testInfo) => {
    // THE CASE NO VITEST PROJECT CAN WRITE. A Server Action is dispatched under
    // an opaque action id, so the whole chain — the ticks, the form body, the
    // action id, the guard, the read of what is waiting, the version write, the
    // revalidate and the diary's own render — runs end to end only here.
    const payload = await getPayload()
    const stem = publishJourneyName(testInfo)
    const slug = stem.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-')

    try {
      for (const [key, suffix] of [
        ['first', 'one'],
        ['second', 'two'],
      ] as const) {
        const created = await payload.create({
          collection: 'journeys',
          depth: 0,
          data: {
            name: `${stem} ${suffix}`,
            place: 'Nowhere',
            slug: `${slug}-${suffix}`,
            dates: '1 - 2 March 2026',
            note: `${suffix} as published`,
            _status: 'published',
          },
        })
        publishFixture[key] = created.id
        await payload.update({
          collection: 'journeys',
          id: created.id,
          depth: 0,
          draft: true,
          data: { note: `${suffix} edited and not yet published` },
        })
      }

      const ticked = `[data-change-row="journey:${String(publishFixture.first)}"] input[type="checkbox"]`
      const untouched = `[data-change-row="journey:${String(publishFixture.second)}"] input[type="checkbox"]`

      const posts: string[] = []
      page.on('response', (answer) => {
        if (answer.request().method() === 'POST' && answer.url().includes('/admin/publish')) posts.push(answer.url())
      })

      await page.goto('/admin/publish')
      await expect(page.locator('[data-admin-publish]')).toBeVisible()
      await expect(page.locator(ticked)).toBeChecked()
      await expect(page.locator(untouched)).toBeChecked()

      // EVERY OTHER ROW IS CLEARED FIRST, including the second fixture. What is
      // left ticked is exactly one change, which is also what makes the label
      // assertion below a fixed string on a screen whose row count this case
      // does not control.
      const boxes = page.locator('[data-change-row] input[type="checkbox"]')
      for (let index = 0; index < (await boxes.count()); index += 1) {
        const box = boxes.nth(index)
        if ((await box.getAttribute('value')) !== `journey:${String(publishFixture.first)}`) await box.uncheck()
      }

      await expect(page.locator('[data-publish-now]')).toHaveText(/^Publish 1 of \d+$/u)
      await expect(
        page.locator(`[data-change-row="journey:${String(publishFixture.second)}"] [data-change-text]`),
      ).toHaveCSS('text-decoration-line', 'line-through')

      await page.locator('[data-publish-now]').click()
      // THE ACTION'S OWN RESPONSE IS WAITED FOR, not the re-render: reloading
      // before it answers reads the book back BEFORE the write.
      await expect.poll(() => posts.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(1)

      await page.reload()
      await expect(page.locator(`[data-change-row="journey:${String(publishFixture.first)}"]`)).toHaveCount(0)
      await expect(page.locator(`[data-change-row="journey:${String(publishFixture.second)}"]`)).toHaveCount(1)

      // AND NOW THE READER'S OWN BOOK, through the addresses the diary serves.
      // The page numbers are read off `readBookBundle` — the diary's own mapper
      // — rather than counted here, because the fixtures move every page after
      // them and a hard-coded `/p/<n>` would be a different page each run.
      const bundle = await readBookBundle()
      const pageOf = (journey: number): string => {
        const index = bundle.pages.findIndex(
          (leaf) => 'journeyId' in leaf && leaf.journeyId === String(journey) && leaf.kind === 'notes',
        )
        if (index < 0) throw new Error(`the book holds no notes page for journey ${String(journey)}`)
        return pagePath(index)
      }

      await page.goto(pageOf(publishFixture.first))
      await expect(page.getByText('one edited and not yet published')).toBeVisible()

      await page.goto(pageOf(publishFixture.second))
      await expect(page.getByText('two as published')).toBeVisible()
      await expect(page.getByText('two edited and not yet published')).toHaveCount(0)
    } finally {
      // THE FIXTURES ARE THE ONLY ROWS THIS CASE TOUCHED, because every other
      // tick was cleared before the publish. They are deleted rather than
      // restored: a published version cannot be turned back into a draft.
      await payload.delete({ collection: 'journeys', where: { name: { like: stem } } })
    }
  })

  test('discards a change with Revert, and leaves the live row where readers already saw it', async ({
    page,
  }, testInfo) => {
    // THE CASE THAT FOUND A DEFECT NO jsdom RENDER CAN. Revert is a
    // `<button formAction>` inside the publish form, because a form inside a
    // form is invalid HTML — and React REPLACES that button's `name` with its
    // own `$ACTION_ID_…` when the `formAction` is a Server Action. A row id
    // carried in `name`/`value` therefore never reaches the server: it is a
    // hydration mismatch in the browser and an empty field on the wire, and
    // every jsdom case still passes because jsdom renders the component rather
    // than the action. The id is a BOUND argument now, and this is what fails
    // when it stops being one.
    const payload = await getPayload()
    const stem = `${publishJourneyName(testInfo)} revert`
    const slug = stem.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-')

    try {
      const created = await payload.create({
        collection: 'journeys',
        depth: 0,
        data: {
          name: stem,
          place: 'Nowhere',
          slug,
          dates: '1 - 2 March 2026',
          note: 'the note a reader can see',
          _status: 'published',
        },
      })
      await payload.update({
        collection: 'journeys',
        id: created.id,
        depth: 0,
        draft: true,
        data: { note: 'a draft nobody is going to keep' },
      })

      const posts: string[] = []
      page.on('response', (answer) => {
        if (answer.request().method() === 'POST' && answer.url().includes('/admin/publish')) posts.push(answer.url())
      })

      await page.goto('/admin/publish')
      const row = page.locator(`[data-change-row="journey:${String(created.id)}"]`)
      await expect(row).toHaveCount(1)

      await row.getByRole('button', { name: 'Revert' }).click()
      await expect.poll(() => posts.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(1)
      await page.reload()

      await expect(row, 'the change is no longer waiting').toHaveCount(0)

      // AND THE LIVE ROW DID NOT MOVE. A revert that published the draft on its
      // way to discarding it would satisfy the assertion above on its own.
      const live = await payload.findByID({ collection: 'journeys', id: created.id, depth: 0 })
      expect(live.note, 'the published note is the one a reader already had').toBe('the note a reader can see')
      expect(live._status).toBe('published')
    } finally {
      await payload.delete({ collection: 'journeys', where: { name: { like: stem } } })
    }
  })

  test('does not offer a Revert on a row that has nothing to go back to', async ({ page }, testInfo) => {
    // PUB-002, from `docs/qa/2026-09-26-publish-sweep.md`. A journey that has
    // never been published has no earlier version, so `revertChange` refuses it
    // and the control is `disabled` — and §2.8 draws no error surface
    // (`docs/deviations.md` §60), so the refusal has to be visible BEFORE the
    // press rather than arriving as an unhandled Server Action error.
    //
    // WHAT IS ASSERTED IS THE BEHAVIOUR, NOT THE DECLARATION: the spent control
    // does not invite a press, and it reads as weaker than a live one. Both
    // sides are on screen at once, so neither can pass by being measured alone
    // — and `toHaveCSS('color', …)` would have been an assertion about the fix.
    const payload = await getPayload()
    const stem = `${publishJourneyName(testInfo)} spent`

    try {
      for (const [suffix, status] of [
        ['fresh', 'draft'],
        ['edited', 'published'],
      ] as const) {
        const created = await payload.create({
          collection: 'journeys',
          depth: 0,
          data: {
            name: `${stem} ${suffix}`,
            place: 'Nowhere',
            slug: `${stem} ${suffix}`.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-'),
            dates: '1 - 2 March 2026',
            note: 'the published note',
            _status: status,
          },
        })
        if (status === 'published') {
          await payload.update({
            collection: 'journeys',
            id: created.id,
            depth: 0,
            draft: true,
            data: { note: 'an edit nobody has published' },
          })
        }
      }

      await page.goto('/admin/publish')
      const spent = page.locator('[data-change-tone="added"]').first().getByRole('button', { name: 'Revert' })
      const live = page.locator('[data-change-tone="edited"]').first().getByRole('button', { name: 'Revert' })
      await expect(spent).toBeVisible()
      await expect(live).toBeVisible()

      const paint = async (control: typeof spent): Promise<{ cursor: string; ink: string }> =>
        control.evaluate((node) => {
          const style = getComputedStyle(node)
          return { cursor: style.cursor, ink: style.color }
        })
      const card = await page
        .locator('[data-publish-changes]')
        .evaluate((node) => getComputedStyle(node).backgroundColor)

      const spentPaint = await paint(spent)
      const livePaint = await paint(live)

      expect(spentPaint.cursor, 'a control that does nothing does not invite a press').not.toBe('pointer')
      expect(
        contrastRatio(asHex(spentPaint.ink), asHex(card)),
        'the spent control reads as weaker than the live one beside it',
      ).toBeLessThan(contrastRatio(asHex(livePaint.ink), asHex(card)))
    } finally {
      await payload.delete({ collection: 'journeys', where: { name: { like: stem } } })
    }
  })

  test('puts an older edition back on the page a reader is looking at', async ({ page }, testInfo) => {
    // THE OTHER CARD'S CONTROL, in the browser. Restore is a real `<form>` with
    // a hidden field — the Editions card sits OUTSIDE the publish form, so it
    // can have one — which is the second shape Next.js documents for passing an
    // argument. This is what says the shape works rather than that the docs say
    // it does, after the submitter's `name` turned out not to.
    const payload = await getPayload()
    const scope = await fixtureScope(testInfo)
    const stem = `${publishJourneyName(testInfo)} edition`
    const slug = stem.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-')

    try {
      const created = await payload.create({
        collection: 'journeys',
        depth: 0,
        data: {
          name: stem,
          place: 'Nowhere',
          slug,
          dates: '1 - 2 March 2026',
          note: 'the first edition',
          _status: 'published',
        },
      })
      await payload.update({
        collection: 'journeys',
        id: created.id,
        depth: 0,
        draft: true,
        data: { note: 'the second edition' },
      })
      await publishSelection(payload, scope, [`journey:${String(created.id)}`])

      const older = (await readEditions(payload, scope)).find((edition) => edition.what.includes(stem) && !edition.live)
      if (older === undefined) throw new Error('the fixture published twice and produced one edition')

      const posts: string[] = []
      page.on('response', (answer) => {
        if (answer.request().method() === 'POST' && answer.url().includes('/admin/publish')) posts.push(answer.url())
      })

      await page.goto('/admin/publish')
      const row = page.locator(`[data-edition-row="${older.id}"]`)
      await expect(row).toHaveCount(1)
      await row.getByRole('button', { name: 'Restore' }).click()
      await expect.poll(() => posts.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(1)

      // THE LIVE ROW, not the version table: a restore that wrote a version
      // nothing reads would pass any assertion about versions.
      const live = await payload.findByID({ collection: 'journeys', id: created.id, depth: 0 })
      expect(live.note, 'the first edition is back on the page a reader is served').toBe('the first edition')
    } finally {
      await payload.delete({ collection: 'journeys', where: { name: { like: stem } } })
    }
  })
})

test.describe('the Overview, SCREENS.md §2.1', () => {
  test('fits the book title inside the 78px cloth chip, measured by the number a wrong fit moves', async ({ page }) => {
    // `scrollWidth <= clientWidth`, NOT a bounding rect. `.chipTitle` carries
    // `nowrap`, `overflow: hidden` and an ellipsis, so its rect is clamped to
    // the chip at ANY font size — a rect assertion here cannot fail, which is
    // exactly how Task 10's cover preview passed at rect 144 while
    // `scrollWidth` was 817. `scrollWidth` is the number a wrong fitter moves.
    await page.goto('/admin')
    const title = page.locator('[data-book-chip-title]')
    await expect(title).toHaveCount(1)
    await page.evaluate(() => document.fonts.ready)

    const box = await title.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      text: element.textContent,
    }))

    expect(box.text.length, 'an empty chip title cannot overflow, so this case would prove nothing').toBeGreaterThan(0)
    expect(box.clientWidth, 'the chip drew no box at all, so nothing was measured').toBeGreaterThan(0)
    expect(
      box.scrollWidth,
      `"${box.text}" overflows the chip: ${String(box.scrollWidth)} into ${String(box.clientWidth)}`,
    ).toBeLessThanOrEqual(box.clientWidth)
  })

  test('lists the same waiting rows the Publish screen lists, on both screens', async ({ page }) => {
    // The two screens read ONE module (`readPendingChanges`), and the
    // integration suite asserts that. This is the browser's half: what is drawn.
    await page.goto('/admin')
    const onOverview = await page
      .locator('[data-waiting-row]')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-waiting-row') ?? ''))

    await page.goto('/admin/publish')
    const onPublish = await page
      .locator('[data-change-row]')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-change-row') ?? ''))

    expect(onOverview).toEqual(onPublish)
  })

  test('prints a crumb counting what is waiting, and no chip while every journey is published', async ({ page }) => {
    // PUB-001 (`docs/deviations.md` §91): the chip counted journeys that have
    // never been published while the crumb counted every waiting row, and both
    // wore the word "unpublished". BOTH SIDES OF THE CHIP ARE STATED HERE
    // rather than one guarded by an `if`: the seeded diary publishes all ten
    // journeys, so the chip is WITHHELD — which is a definite claim about this
    // data, not a conditional that passes either way. What the chip SAYS when
    // it is drawn is `ScreenHeader.test.tsx`'s, against its own text.
    await page.goto('/admin')
    await expect(page.locator('[data-admin-overview]')).toBeVisible()

    await expect(page.locator('[data-crumb]')).toHaveText(/^\d+ changes? waiting$/u)
    await expect(page.locator('[data-control="unpublished"]')).toHaveCount(0)
  })

  test('draws every card §2.1 specifies, so none of them can be quietly missing', async ({ page }) => {
    await page.goto('/admin')

    // FOUR STAT CARDS AND FOUR SECTIONS, counted rather than sampled.
    await expect(page.locator('[data-stat-id]')).toHaveCount(4)
    await expect(page.locator('[data-stat-tick]')).toHaveCount(4)
    for (const card of ['waiting', 'book', 'prompts', 'lately']) {
      await expect(page.locator(`[data-overview-${card}]`)).toHaveCount(1)
    }
  })

  test('puts the stat grid on four columns above its rung and two below it', async ({ page }) => {
    // §2.1: `repeat(4, minmax(0,1fr))` above 820px in the prototype's units,
    // `repeat(2, …)` below. The rung this stylesheet declares is 776, which is
    // the container conversion `overview.module.css` carries in full — a raw
    // 820 is GAL-004's shape, where a transcribed number made a rung
    // unreachable at every viewport this project tests.
    await page.goto('/admin')
    const columnsAt = async (): Promise<number> =>
      await page
        .locator('[data-overview-stats]')
        .evaluate((element) => window.getComputedStyle(element).gridTemplateColumns.split(' ').length)

    await page.setViewportSize({ width: 1440, height: 900 })
    await expect.poll(columnsAt).toBe(4)

    await page.setViewportSize({ width: 900, height: 900 })
    await expect.poll(columnsAt).toBe(2)
  })
})

/**
 * What the two prompt fixtures below carry in their filenames, so cleanup can
 * find them however the run ended.
 */
const PROMPT_MARKER = 'e2e-overview-prompt'

/**
 * Which journey the prompt fixtures are added to.
 *
 * The FIRST journey the Galleries screen offers, so the destination's own
 * fallback — "an address naming no journey shows the first" — cannot make the
 * walk pass for a link that carried no journey at all. Resolved from the
 * database rather than written as an id: `diary_test` and the developer's
 * `diary` mint different ones.
 * @returns The journey's row id.
 */
const aJourneyToPromptAbout = async (): Promise<number> => {
  const payload = await getPayload()
  const found = await payload.find({
    collection: 'journeys',
    depth: 0,
    limit: 1,
    sort: 'name',
    select: {},
    where: { deletedAt: { exists: false } },
  })
  const journey = found.docs[0]
  if (journey === undefined) throw new Error('the seeded diary has no journey to hang a prompt fixture on')
  return journey.id
}

/**
 * A media row this file owns, with a real derivative behind it.
 *
 * ═══ WHY THE FIXTURE EXISTS AT ALL ═══
 *
 * **The seeded diary has nothing outstanding.** Measured rather than assumed:
 * every gallery frame carries a caption and alt text, every journey is
 * published, and `select count(*) from media where kind = 'clip'` is **0**. The
 * ten rows with an empty caption are all ephemera — decorative scraps
 * `galleryFrameWhere` excludes for every reader — so "Needs a look" draws its
 * empty line and there is no prompt to walk. A case that skipped on that is a
 * case that proves nothing, and one that asserted the empty line would be
 * asserting the absence of the behaviour §2.1 puts in bold.
 *
 * @param label - What distinguishes this row; it becomes part of the filename.
 * @param fields - The columns the prompt under test turns on.
 * @returns The media row's id, as the address spells it.
 */
const aPromptFixture = async (
  journey: number,
  label: string,
  fields: { readonly kind: 'still' | 'clip'; readonly caption: string; readonly posterAt: number | null },
): Promise<string> => {
  const payload = await getPayload()
  const png = await sharp({ create: { width: 800, height: 800, channels: 3, background: { r: 9, g: 9, b: 9 } } })
    .png()
    .toBuffer()
  const created = await payload.create({
    collection: 'media',
    data: {
      journey,
      alt: `${PROMPT_MARKER} ${label}`,
      state: 'ready',
      // LAST IN THE GALLERY, so the fixture cannot become the cover of a
      // seeded journey while it is there — `coverFrame` is the first frame.
      order: 9_000,
      hidden: false,
      inBook: false,
      kind: fields.kind,
      caption: fields.caption,
      ...(fields.posterAt === null ? {} : { posterAt: fields.posterAt }),
    },
    file: { data: png, mimetype: 'image/png', name: `${PROMPT_MARKER}-${label}.png`, size: png.length },
  })
  return String(created.id)
}

test.describe('the Overview’s prompts, walked into the screen they name', () => {
  let journey = 0
  let posterless = ''
  let uncaptioned = ''
  let mediaBefore = 0
  let journeysBefore = 0

  test.beforeAll(async () => {
    const payload = await getPayload()
    journeysBefore = (await payload.count({ collection: 'journeys' })).totalDocs
    // THE DEV DATABASE IS NOT A SCRATCHPAD (standing order 9). The count is
    // taken before anything is written and compared after everything is
    // removed, so a fixture that failed to clean up fails the suite rather
    // than quietly staying in the developer's diary.
    mediaBefore = (await payload.count({ collection: 'media' })).totalDocs
    journey = await aJourneyToPromptAbout()
    // A CLIP WITH NO POSTER, captioned and described, so it can only produce
    // the "Pick posters" prompt.
    posterless = await aPromptFixture(journey, 'clip', { kind: 'clip', caption: 'a clip', posterAt: null })
    // A STILL WITH NO CAPTION, described, so it can only produce "Caption them".
    uncaptioned = await aPromptFixture(journey, 'still', { kind: 'still', caption: '', posterAt: null })

    // SOMETHING WAITING TO GO OUT, so the "Waiting to go out" card has rows.
    // The seeded diary has none — measured: every live journey's latest version
    // is published, and the 42 draft version rows are orphans with a null
    // parent (`docs/qa/2026-09-26-overview-sweep.md`). Without this the card
    // draws its empty line and every case about a row is vacuous.
    const waiting = await payload.create({
      collection: 'journeys',
      data: {
        name: `${PROMPT_MARKER} Waiting`,
        place: 'Nowhere',
        slug: `${PROMPT_MARKER}-waiting`,
        dates: 'one day',
        _status: 'published',
      },
    })
    await payload.update({
      collection: 'journeys',
      id: waiting.id,
      draft: true,
      data: { note: 'an edit nobody has published' },
    })
  })

  test.afterAll(async () => {
    const payload = await getPayload()
    await payload.delete({ collection: 'media', where: { filename: { like: PROMPT_MARKER } } })
    await payload.delete({ collection: 'journeys', where: { slug: { like: PROMPT_MARKER } } })
    expect(
      [
        (await payload.count({ collection: 'media' })).totalDocs,
        (await payload.count({ collection: 'journeys' })).totalDocs,
      ],
      'the fixtures were not cleaned out of the developer’s diary',
    ).toEqual([mediaBefore, journeysBefore])
  })

  test('the overview’s "Pick posters" prompt opens the gallery with that frame already selected', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.locator('[data-admin-overview]')).toBeVisible()

    const prompt = page.getByRole('link', { name: 'Pick posters' })
    await expect(prompt).toHaveCount(1)

    // THE ID IS NEVER TYPED HERE, AND IT IS READ BEFORE THE CLICK. Reading
    // `page.url()` afterwards compares the destination against its OWN address,
    // which agrees with itself however wrong it is; reading the prompt's own
    // `href` first is what makes this a statement about the two screens
    // agreeing rather than about one screen agreeing with itself.
    const href = await prompt.getAttribute('href')
    const expected = new URL(href ?? '', 'https://example.test').searchParams.get('frame')
    expect(expected, 'the prompt carried no frame, so there is nothing for the gallery to select').toBe(posterless)

    await prompt.click()
    await page.waitForURL('**/admin/galleries?**')

    await expect(page.locator('[data-selected-frame]')).toHaveAttribute('data-frame-id', expected ?? '')
    // AND THE TILE, not only the panel: a panel drawn over a grid highlighting
    // another frame is the desync §2.5 states its id rule to prevent.
    await expect(page.locator(`[data-frame-id="${expected ?? ''}"][data-highlighted="true"]`)).toHaveCount(1)
  })

  test('the "Caption them" prompt opens the bulk panel already expanded, over its own frame', async ({ page }) => {
    await page.goto('/admin')
    const prompt = page.getByRole('link', { name: 'Caption them' })
    await expect(prompt).toHaveCount(1)

    const href = await prompt.getAttribute('href')
    const asked = new URL(href ?? '', 'https://example.test').searchParams
    expect(asked.get('frame')).toBe(uncaptioned)

    await prompt.click()
    await page.waitForURL('**/admin/galleries?**')

    await expect(page.locator('[data-caption-all]')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('[data-selected-frame]')).toHaveAttribute('data-frame-id', uncaptioned)
  })

  test('names the gallery as well as the frame, so the destination draws the right journey', async ({ page }) => {
    // Without the journey, §2.5's own fallback — "an address naming no journey
    // shows the first" — decides which gallery opens, and the frame the prompt
    // named is not in it.
    await page.goto('/admin')
    const href = await page.getByRole('link', { name: 'Pick posters' }).getAttribute('href')

    expect(new URL(href ?? '', 'https://example.test').searchParams.get('journey')).toBe(String(journey))
  })

  test('stacks each prompt’s action under its sentence, rather than running on from it', async ({ page }) => {
    // OVR-001 (`docs/qa/2026-09-26-overview-sweep.md`). The action is an
    // inline-block whose `margin-top` does nothing while the sentence beside it
    // is an inline `<span>`, so the screen read "…has no alt text.ADD ALT TEXT"
    // with no space at all. `publish.module.css`'s `.what` carries the note
    // this stylesheet needed: "an inline element takes no top margin and the
    // two would share a line."
    //
    // ═══ WHY THE ASSERTION IS THE LEFT EDGE AND NOT THE TOP ═══
    //
    // An inline sentence runs on ONLY WHEN THE ACTION FITS on its last line, so
    // "the action begins below the text" is true by accident for any prompt
    // whose last line is nearly full — measured: of three prompts on one
    // render, two looked stacked and one ran on at x=1061 against a body edge
    // of x=974. A case reading the first prompt's top would pass or fail with
    // the length of a journey's name.
    //
    // Every action starting at the BODY'S OWN LEFT EDGE is the statement that
    // holds for every content and breaks for exactly this defect, so it is
    // asserted over ALL the prompts rather than one.
    await page.goto('/admin')
    const rows = await page.locator('[data-prompt]').evaluateAll((prompts) =>
      prompts.map((row) => {
        const action = row.querySelector('[data-prompt-action]')?.getBoundingClientRect().left
        const body = row.querySelector('[data-prompt-text]')?.parentElement?.getBoundingClientRect().left
        return action === undefined || body === undefined ? null : Math.round(action) - Math.round(body)
      }),
    )

    expect(rows.length, 'the diary offered no prompt, so there is no action to place').toBeGreaterThan(0)
    expect(rows, 'a prompt’s action does not start at its own left edge, so it ran on from the sentence').toEqual(
      rows.map(() => 0),
    )
  })

  test('gives a waiting row’s change text more room than the fixed chip beside it, at every width', async ({
    page,
  }) => {
    // OVR-002 (`docs/qa/2026-09-26-overview-sweep.md`). §2.1's row is a 64px
    // fixed chip, the change text, a timestamp and Revert. All three of the
    // others are `flex: none`, so at a 302px card the text got **63px** and
    // wrapped to one word per line — a 238px-tall row against the 128px the
    // §2.8 row manages at the same width, because §2.8 puts its timestamp on
    // the second line instead of in a column.
    //
    // THE THRESHOLD IS THE DESIGN'S OWN 64px, not a number invented here: the
    // row's one flexible column must not end up narrower than its one fixed
    // one. Both widths are read in the same pass, so the comparison moves with
    // the layout rather than against a literal.
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/admin')
      await expect(page.locator('[data-waiting-row]').first()).toBeVisible()

      const measured = await page
        .locator('[data-waiting-row]')
        .first()
        .evaluate((row) => {
          const text = row.querySelector('[data-waiting-text]')?.getBoundingClientRect().width
          const chip = row.querySelector('[data-waiting-chip]')?.getBoundingClientRect().width
          return text === undefined || chip === undefined ? null : { text: Math.round(text), chip: Math.round(chip) }
        })

      expect(measured, `no waiting row was drawn at ${String(width)}`).not.toBeNull()
      expect(
        measured?.text ?? 0,
        `at ${String(width)} the change text got ${String(measured?.text)}px against a ${String(measured?.chip)}px chip`,
      ).toBeGreaterThan(measured?.chip ?? 0)
    }
  })

  test('prints no number on this screen that disagrees with how many changes are waiting', async ({ page }) => {
    // OVR-003 (`docs/qa/2026-09-26-overview-sweep.md`). The rail printed **1**
    // beside "Publish · WHAT GOES OUT" — `readNavCounts.unpublished`, journeys
    // that have never been published — while the crumb, the Waiting card and
    // /admin/publish all counted **2**. It is PUB-001 in its third instance,
    // and a bare digit has no label to relabel.
    //
    // THE PROPERTY, NOT THE FIX: a Publish count is allowed, as long as it is
    // the number the rest of the screen agrees on. A case asserting "the rail
    // draws no count" would fail the day the chrome can afford the real one.
    await page.goto('/admin')
    await expect(page.locator('[data-admin-overview]')).toBeVisible()

    const crumb = (await page.locator('[data-crumb]').textContent()) ?? ''
    const waiting = Number(crumb.split(' ')[0])
    expect(Number.isFinite(waiting), `the crumb did not lead with a number: "${crumb}"`).toBe(true)
    // The fixture puts two changes in front of this, so the case cannot be
    // satisfied by a diary where every number happens to be zero.
    expect(waiting, 'nothing was waiting, so no two numbers could disagree').toBeGreaterThan(0)

    const railCounts = await page
      .locator('a[data-nav-id="publish"] [data-nav-count]')
      .evaluateAll((nodes) => nodes.map((node) => Number(node.textContent)))

    expect(railCounts, `the rail says ${JSON.stringify(railCounts)} beside Publish while ${crumb}`).toEqual(
      railCounts.map(() => waiting),
    )
  })
})
