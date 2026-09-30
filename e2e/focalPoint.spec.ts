/**
 * focalPoint.spec.ts — Phase 4's second exit criterion, in a browser: a focal
 * point clicked in the editor moves the crop the diary renders.
 *
 * ═══ WHY THIS EXISTS AND WHY NOTHING ELSE DISCHARGES IT ═══
 *
 * The design spec's §4 makes it an exit line, and §5.2 says why: *"If this is
 * not wired through to rendering, the admin control is decorative."* Task 7
 * proved the DATA half — `slotMutations.integration.test.ts` reads the stored
 * pair back through Payload — and several jsdom cases prove each renderer
 * applies the numbers it is handed (`SlotPanel.test.tsx`, `Notes.test.tsx`,
 * `Photograph.test.tsx`). None of them crosses the seam. Between the admin's
 * write and the diary's render sit Postgres, `readBookBundle`, a different
 * component tree and a different route, and a break anywhere along it leaves
 * every one of those cases green.
 *
 * ═══ NEITHER SIDE OF THE COMPARISON IS A LITERAL THIS FILE CHOSE ═══
 *
 * The click's coordinates come from the browser's own bounding box. The admin's
 * value is read back out of `getComputedStyle`, not out of the number that was
 * clicked. The diary's value is read the same way, from a fresh navigation to a
 * public route whose markup a different module built out of the database. The
 * assertion is that the two AGREE.
 *
 * ═══ AND `not.toBe('50% 50%')` IS THE HALF THAT MAKES IT A TEST ═══
 *
 * `pages.slots[].focalX` and `focalY` both default to 50, so a control that
 * wrote nothing at all would leave BOTH surfaces at `50% 50%` and satisfy an
 * agreement assertion perfectly. That is the Phase 3 defect class in this
 * phase's shape (standing orders §12: name the number the defect moves), and it
 * is why the click is at 20%/80% rather than near the middle.
 *
 * THE THIRD READING IS THE ONE THAT PROVES THE WRITE LANDED. The admin's first
 * value is React's optimistic paint — it would be there even if the Server
 * Action never reached Postgres — so the editor is RELOADED and read again
 * before the diary is opened. Three readings: what the author saw, what the
 * admin re-renders from the database, and what the public book draws.
 *
 * ═══ THE FIXTURE IS THIS RUN'S OWN, AND IT IS PUT BACK ═══
 *
 * Standing orders §9: a browser session that can write does not touch rows it
 * did not make. This spec creates a journey, one media row and three pages,
 * clicks inside its own slot, and deletes all of it — a seeded journey would
 * leave the developer's `diary` database cropped differently for every
 * screenshot taken afterwards, which is exactly what §9 was written about. The
 * journey is named per worker, for the reason `e2e/support/adminSession.ts`'s
 * {@link fixtureLabel} gives, so two projects running at once cannot find each
 * other's rows.
 *
 * THE TWO PUBLIC SURFACES ARE BOTH WALKED, because they are two renderers and
 * not one narrowed: `desktop` and `mid` are served the book, and `mobile` is
 * sent to SCREENS.md §1.10's reading mode, where `MobilePage.tsx` draws the
 * hero rather than `Photograph.tsx`. See {@link heroOnTheDiary}.
 *
 * Depends on: @playwright/test, sharp, `pagePath`
 * (@travel-diary/domain/pageAddress), `getPayload` (../apps/web/lib/payload),
 * `readBookBundle` (../apps/web/lib/readBookBundle), `aSignedInSession`,
 * `fixtureLabel`, `removeSignedInFixture`, `SESSION_FIXTURE_DOMAIN`
 * (./support/adminSession).
 */
import { pagePath } from '@travel-diary/domain/pageAddress'
import { expect, test, type Locator, type Page } from '@playwright/test'
import sharp from 'sharp'
import { getPayload } from '../apps/web/lib/payload'
import { readBookBundle } from '../apps/web/lib/readBookBundle'
import { aSignedInSession, fixtureLabel, removeSignedInFixture, SESSION_FIXTURE_DOMAIN } from './support/adminSession'

/** What this file's fixture account is called, per project and worker. */
const label = (testInfo: { readonly project: { readonly name: string }; readonly workerIndex: number }): string =>
  `focalpoint.${fixtureLabel(testInfo)}`

/**
 * What this run's journey is called.
 *
 * The label is in the name so the cleanup deletes this worker's journey and no
 * seeded one, and so the diary assertion can find its own page among every
 * other journey's in the book.
 * @param testInfo - Playwright's own per-test information.
 * @returns A name no other worker's fixture can collide with.
 */
const journeyName = (testInfo: { readonly project: { readonly name: string }; readonly workerIndex: number }): string =>
  `Focal ${label(testInfo)}`

/**
 * Where in the slot the click lands, as fractions of its own measured box.
 *
 * Far from the centre in both axes, because the default is the centre: a click
 * at 50%/50% would store exactly what a control that stored nothing leaves
 * behind, and the assertion that catches that defect would have nothing to say.
 */
const CLICK_AT = { across: 0.2, down: 0.8 } as const

/** What both surfaces read when nothing has been stored. */
const THE_DEFAULT_CROP = '50% 50%'

/**
 * The handle `SCREENS.md` §1.10's reading mode puts on its root element, and
 * the book never does.
 *
 * `MobilePage.tsx` writes `data-mobile-page={page.kind}` on the `<section>` it
 * renders; `apps/web/app/(diary)/p/[n]/page.tsx`'s book has no such attribute
 * anywhere. Which of the two answered is therefore readable off the document
 * itself, without asking anything about the elements under assertion.
 */
const READING_MODE_ROOT = '[data-mobile-page]'

/**
 * The photograph the diary draws for this journey's hero, whichever of the two
 * public surfaces this project's browser was served.
 *
 * `SCREENS.md` §1.10's mobile reading mode is a different renderer, not a
 * narrower one: the middleware sends a 390px browser to `/m/<n>`, where
 * `MobilePage.tsx` draws one page per address and its hero carries
 * `data-photo="hero"`. Both handles are the product's own — `Photograph.tsx` and
 * `MobilePage.tsx` each publish theirs for exactly this kind of assertion.
 *
 * ═══ WHICH SURFACE IS READ OFF THE RENDERER'S OWN MARKER, NOT OFF A COUNT ═══
 *
 * This chose between the two by asking whether the book's selector matched
 * exactly one element, which is a diagnosis defect:
 * any regression in `[data-page="notes"]`, in `[data-hero]` or in the name
 * filter makes the book branch count zero, and the reading-mode branch would
 * then be silently substituted rather than the case failing where the defect
 * is. It now keys on {@link READING_MODE_ROOT}, which no assertion below reads,
 * so a broken hero handle fails inside its own branch.
 *
 * NOT ON THE ADDRESS, and that was measured rather than assumed: the first fix
 * for this finding branched on `page.url()` starting `/m/`, and it sent the
 * `mobile` project down the BOOK branch every time. `apps/web/middleware.ts`
 * REWRITES rather than redirects — its header says `/m/<n>` "IS NOT AN ADDRESS,
 * and this file is what keeps it from becoming one" — so the browser's address
 * stays `/p/<n>` while the reading mode answers it.
 *
 * BOTH BRANCHES ARE SCOPED TO THIS JOURNEY'S PAGE. The reading-mode branch was
 * not, which made the two readings unequal in a way the case did not say: it
 * would have found a hero on whatever page `/m/<n>` served. `MobilePage.tsx`
 * publishes `data-mobile-page={page.kind}` around the same `<h1>{page.name}</h1>`
 * the book prints, so the same `hasText` filter scopes both.
 * @param page - A page already navigated to the journey's address.
 * @param name - The journey's name, which both surfaces print on the page.
 * @returns The one element whose `object-position` is the crop.
 */
const heroOnTheDiary = async (page: Page, name: string): Promise<Locator> => {
  // ATTACHED, NOT VISIBLE. The book stacks every leaf of the served window on
  // top of one another, so all but the open one are hidden — and the reading
  // mode's single page is the other shape entirely. What is being waited for is
  // that this document has drawn its photographs at all.
  await page.waitForSelector('[data-hero], [data-photo="hero"]', { state: 'attached' })

  const servedReadingMode = (await page.locator(READING_MODE_ROOT).count()) > 0
  return servedReadingMode
    ? page.locator('[data-mobile-page="notes"]', { hasText: name }).locator('[data-photo="hero"]')
    : page.locator('[data-page="notes"]', { hasText: name }).locator('[data-hero]')
}

/** This run's row ids, filled in by `beforeAll`. */
const fixture: { journey: number; notes: number; media: number } = { journey: 0, notes: 0, media: 0 }

/**
 * Deletes every row this spec's name owns, in the order the relationships
 * allow.
 *
 * Deleted by `where` rather than by id, for the reason `removeSignedInFixture`
 * gives: a predicate that now matches nothing is not an error, so this is safe
 * to run before a run as well as after one — which is what stops a crashed
 * previous run colliding with the unique `slug`.
 *
 * ═══ `equals`, NOT `like`, AND THAT IS NOT TIDINESS ═══
 *
 * Payload's `like` is a SUBSTRING match, and {@link fixtureLabel} ends the name
 * with `w<workerIndex>` with nothing after it — so `Focal focalpoint.desktop.w1`
 * is a substring of `Focal focalpoint.desktop.w10`. At eleven or more workers,
 * one worker's `beforeAll` would delete another worker's LIVE fixture mid-run:
 * the exact shared-fixture race `e2e/support/adminSession.ts`'s header was
 * written about, and it does not announce itself — the other worker's page
 * simply stops having a journey on it. `workers` is 1 locally
 * (`playwright.config.ts`) and Playwright's default in CI, which is a function
 * of the runner's core count and is not something this file should be betting
 * on.
 * @param name - The journey name this run owns.
 */
const removeFixtureRows = async (name: string): Promise<void> => {
  const payload = await getPayload()
  const mine = await payload.find({
    collection: 'journeys',
    where: { name: { equals: name } },
    pagination: false,
    depth: 0,
  })
  for (const journey of mine.docs) {
    await payload.delete({ collection: 'pages', where: { journey: { equals: journey.id } } })
    await payload.delete({ collection: 'media', where: { journey: { equals: journey.id } } })
  }
  await payload.delete({ collection: 'journeys', where: { name: { equals: name } } })
}

test.beforeAll(async ({}, testInfo) => {
  const name = journeyName(testInfo)
  await removeFixtureRows(name)

  const payload = await getPayload()
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
  fixture.journey = journey.id

  // A REAL ROW WITH REAL DERIVATIVES, not a stub: the editor's slot draws a
  // preview from `sizes` and is DISABLED without one, and the book's hero picks
  // a derivative tier by role. A hand-written row with no file would make the
  // control unclickable and the assertion below unreachable.
  const png = await sharp({ create: { width: 800, height: 800, channels: 3, background: { r: 30, g: 70, b: 90 } } })
    .png()
    .toBuffer()
  const media = await payload.create({
    collection: 'media',
    data: { journey: journey.id, alt: `${name} hero`, state: 'ready', order: 0 },
    file: {
      data: png,
      mimetype: 'image/png',
      name: `${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}.png`,
      size: png.length,
    },
  })
  fixture.media = media.id

  // THREE PAGES, because a journey is three pages of the book — `deriveBookmarks`
  // gives a journey's tab `span: 3`, and a one-page journey would be a shape
  // this book does not have. The hero the assertion follows is on the notes
  // page, which is the one with a `[data-hero]` handle in the diary.
  for (const [order, page] of [
    { kind: 'notes' as const, title: 'Notes', layout: 'text-spread' as const },
    { kind: 'frames' as const, title: 'Frames I', layout: 'three-up' as const },
    { kind: 'frames' as const, title: 'Frames II', layout: 'three-up' as const },
  ].entries()) {
    const created = await payload.create({
      collection: 'pages',
      data: {
        journey: journey.id,
        kind: page.kind,
        title: page.title,
        order,
        layout: page.layout,
        _status: 'published',
        // CENTRED ON PURPOSE. The fixture starts at the value a control that
        // saves nothing would leave, so the assertion that the crop MOVED is
        // asking about this run's click and not about how the row was seeded.
        slots:
          page.kind === 'notes'
            ? [
                { role: 'hero', media: media.id, focalX: 50, focalY: 50 },
                { role: 'ephemera', focalX: 50, focalY: 50 },
              ]
            : [],
      },
    })
    if (page.kind === 'notes') fixture.notes = created.id
  }
})

test.afterAll(async ({}, testInfo) => {
  await removeSignedInFixture(`${label(testInfo)}@${SESSION_FIXTURE_DOMAIN}`)
  await removeFixtureRows(journeyName(testInfo))

  // THE CLEANUP CHECKS ITS OWN WORK (standing orders §13): a `delete` that
  // resolved is not evidence that anything went, and a fixture journey left in
  // the developer's `diary` is a journey in the book every screenshot taken
  // afterwards photographs.
  const payload = await getPayload()
  const left = await payload.count({ collection: 'journeys', where: { name: { equals: journeyName(testInfo) } } })
  expect(left.totalDocs, 'this run left its fixture journey in the developer’s database').toBe(0)
})

test.beforeEach(async ({ context, baseURL }, testInfo) => {
  await context.addCookies([
    { name: 'td-session', value: await aSignedInSession(label(testInfo)), url: `${baseURL ?? ''}/admin` },
  ])
})

test('a focal point clicked in the editor moves the crop the diary renders', async ({ page }, testInfo) => {
  await page.goto(`/admin/journeys/${String(fixture.journey)}?page=${String(fixture.notes)}`)

  // 1 · Click a measured point inside the slot. The coordinates come from the
  //     browser's own bounding box, not from this file.
  const slot = page.locator(`[data-focal-target="${String(fixture.notes)}:0"]`)
  await expect(slot).toBeEnabled()
  // MEASURED WHERE IT CAN BE CLICKED. `boundingBox` answers in the viewport's
  // own coordinates, and at `mid` and `mobile` the pane this slot sits in
  // starts below the fold — so without this the mouse pressed whatever was at
  // those coordinates and the crop never moved. It is the same element and the
  // same measurement; scrolling is what makes the two agree.
  await slot.scrollIntoViewIfNeeded()
  const box = await slot.boundingBox()
  if (box === null) throw new Error('the slot has no box, so nothing below measures anything')

  // THE WRITE IS WAITED FOR, NOT SLEPT PAST (standing orders §15). The slot's
  // controls have no Save: the click dispatches a Server Action inside a
  // `startTransition`, so the reload below can outrun the POST — and it did,
  // once, on the first run of this case: the reload re-rendered the row's
  // stored 50%/50% while the diary, read a moment later, had the 20%/80% the
  // write eventually landed. Both readings were honest and the case was wrong.
  // The response to the action's own POST is the event that cannot arrive
  // early, and it is subscribed to BEFORE the click so it cannot be missed.
  const wrote = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes(`/admin/journeys/${String(fixture.journey)}`),
  )
  await page.mouse.click(box.x + box.width * CLICK_AT.across, box.y + box.height * CLICK_AT.down)

  // 2 · What the author now sees. React's own optimistic paint, produced by the
  //     focal-point module — true whether or not the write ever landed.
  await expect(slot).not.toHaveCSS('background-position', THE_DEFAULT_CROP)
  const asPainted = await slot.evaluate((node) => getComputedStyle(node).backgroundPosition)

  // 3 · What the admin re-renders FROM POSTGRES. A reload throws the optimistic
  //     value away; this reading is a Server Component's, out of the database.
  await wrote
  await page.reload()
  await expect(slot).toBeEnabled()
  const asStored = await slot.evaluate((node) => getComputedStyle(node).backgroundPosition)

  // 4 · What the DIARY renders, in a fresh navigation to a public route, from a
  //     bundle a different module built out of the same rows.
  //
  //     THE ADDRESS COMES FROM THE PRODUCTION READER, not from a number this
  //     file chose: the book holds every published journey, so which `/p/<n>`
  //     this journey's notes page occupies depends on what else is in the
  //     database when the case runs.
  const bundle = await readBookBundle()
  const index = bundle.pages.findIndex((leaf) => leaf.kind === 'notes' && leaf.name === journeyName(testInfo))
  expect(index, 'this run’s journey is not in the book at all, so nothing below reads its crop').toBeGreaterThan(-1)

  await page.goto(pagePath(index))
  const inDiary = await (
    await heroOnTheDiary(page, journeyName(testInfo))
  ).evaluate((node) => getComputedStyle(node).objectPosition)

  // Both are the browser's computed values for the same stored pair, read off
  // two different elements that two different modules rendered.
  expect(inDiary).toBe(asStored)
  expect(asStored).toBe(asPainted)
  expect(inDiary).not.toBe(THE_DEFAULT_CROP)
})
