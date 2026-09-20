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
 * Depends on: @playwright/test, sharp (the galleries fixture's real uploads),
 * the running app from playwright.config.ts's `webServer`,
 * `./support/adminSession` (the guard needs a real session — see that file for
 * why a browser cannot sign itself in here),
 * `@travel-diary/domain/admin/navigation`, and `getPayload` for the two
 * fixtures this file has to clean up itself.
 */
import { ADMIN_NAV, activeNavId } from '@travel-diary/domain/admin/navigation'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
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
