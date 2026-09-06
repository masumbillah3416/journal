/**
 * reset.spec.ts — the reset screens and the signed-in state in a real browser:
 * the things about `SCREENS.md` §3.3 and §3.4 that no jsdom test can settle,
 * and the one defect ruling F47 exists to close.
 *
 * ═══ WHY EACH OF THESE IS HERE AND NOT IN A `*.test.tsx` FILE ═══
 *
 * 1. THE LINK IS NOT A 404. For the whole of Tasks 5 to 8 the reset email
 *    carried a working token to an address nothing answered, with every
 *    mechanism behind it green. A component test cannot notice that, because
 *    it renders a component rather than fetching an address. The first two
 *    cases below follow the reader's own path — the "Forgotten" link off the
 *    password screen, and the mailed link's shape — and assert the RESPONSE
 *    STATUS, which is the fact that was wrong.
 *
 * 2. THE GEOMETRY. jsdom performs no layout and loads no stylesheet, so it
 *    cannot say that §3.4's ringed circle is 62px or that §3.3's confirmation
 *    mark is 14px. Both are numbers `SCREENS.md` states outright, and both are
 *    measured here rather than screenshotted: `docs/testing.md`'s Visual
 *    regression section records that a baseline at this threshold absorbs a
 *    20px displacement of an entire pane, so spacing that matters gets a
 *    numeric assertion instead of a picture.
 *
 * 3. WHAT THE DELIVERED PAGE CONTAINS. The expired state is asserted to carry
 *    the token nowhere in its markup, and the sent state is asserted to mask
 *    an address planted in the query by hand. Both are assertions about the
 *    HTML a browser actually received, not about what a component returned.
 *
 * ═══ WHAT THIS FILE DELIBERATELY DOES NOT DO ═══
 *
 * IT DOES NOT REQUEST A RESET. Asking for one needs the endpoint
 * `ResetStep.tsx`'s form posts to, which Task 10 mounts with the rest of the
 * sign-in surface's handlers, and reading the link back needs the mailer's
 * in-process outbox, which a browser cannot see. The journey from a request
 * through the mailed link to a changed password is therefore proved where the
 * outbox is — `apps/web/lib/auth/setNewPassword.integration.test.ts`, against
 * a real Payload and a real Postgres, reading the token out of the message
 * rather than out of the database. Said here rather than left as a gap: what
 * this file covers is the screens and their addresses, not the delivery.
 *
 * Depends on: @playwright/test, the running app from playwright.config.ts's
 * `webServer`, and the seeded diary (`npm run db:seed`) — the shell prints the
 * `book` global's own title.
 */
import { expect, test } from '@playwright/test'

/** The reset request screen's address. */
const RESET_PATH = '/admin/reset'

/** The password screen's address. */
const SIGN_IN_PATH = '/admin/sign-in'

/** The signed-in state's address. */
const SIGNED_IN_PATH = '/admin/sign-in/done'

/**
 * A token of the shape Payload mints, naming no account.
 *
 * Hexadecimal and forty characters, because that is what a real link carries —
 * a token this screen would obviously never honour proves less about the
 * expired state than one it has to look up and refuse.
 */
const UNKNOWN_TOKEN = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'

/** The diameter `SCREENS.md` §3.4 gives the ringed circle, in CSS pixels. */
const SIGNED_IN_MARK_PX = 62

/** The square inside it, from the same sentence. */
const SIGNED_IN_MARK_INNER_PX = 20

/** The rotated mark `SCREENS.md` §3.3 puts in the confirmation block. */
const CONFIRMATION_MARK_PX = 14

test('reaches the reset screen from the password screen’s own "Forgotten" link', async ({ page }) => {
  // The defect ruling F47 closed, approached from the reader's side: the two
  // spellings of this path agreed with each other for four tasks while
  // pointing at nothing.
  await page.goto(SIGN_IN_PATH)

  const forgotten = page.getByRole('link', { name: 'Forgotten' })
  await expect(forgotten).toBeVisible()

  // The RESPONSE is what this case is about, so it is captured rather than
  // inferred from the page settling: a 404 renders a document too, and every
  // assertion below would hold on Next's own not-found page if the status
  // were not read.
  const [served] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === RESET_PATH),
    forgotten.click(),
  ])
  await page.waitForURL(`**${RESET_PATH}`)

  expect(served.status()).toBe(200)
  await expect(page.locator('[data-reset-step]')).toHaveAttribute('data-reset-state', 'pending')
})

test('answers the address the reset email builds, rather than 404ing on it', async ({ page }) => {
  // The mailed link's own shape: `<origin>/admin/reset/<token>`. The token
  // here names nothing, so what must be served is the expired state — a 200
  // with a screen on it, not a 404.
  const response = await page.goto(`${RESET_PATH}/${UNKNOWN_TOKEN}`)

  expect(response?.status()).toBe(200)
  await expect(page.locator('[data-new-password-step]')).toHaveAttribute('data-new-password-view', 'expired')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('That link has expired')
})

test('draws no form, and prints no token, on a link it has refused', async ({ page }) => {
  await page.goto(`${RESET_PATH}/${UNKNOWN_TOKEN}`)
  await expect(page.locator('[data-new-password-step]')).toBeVisible()

  await expect(page.locator('[data-new-password-step] form')).toHaveCount(0)
  await expect(page.locator('[data-new-password-step] input')).toHaveCount(0)

  // Against the DELIVERED markup, not against a rendered component: a token in
  // a hidden field, a data attribute or a comment would all be here.
  const delivered = await page.locator('[data-new-password-step]').innerHTML()
  expect(delivered).not.toContain(UNKNOWN_TOKEN)
})

test('refuses an address that is not one, and says so where the reader is', async ({ page }) => {
  await page.goto(RESET_PATH)
  await page.locator('input[name="email"]').fill('wanderings')

  await page.getByRole('button', { name: 'Send the link' }).click()

  // Scoped to the pane: Next.js puts its own `role="alert"` route announcer in
  // every document, so an unscoped role query is a strict-mode violation
  // rather than an assertion about this screen.
  await expect(page.locator('[data-reset-step] [role="alert"]')).toHaveText('That does not look like an email address.')
  expect(new URL(page.url()).pathname).toBe(RESET_PATH)
})

test('sets the refused field, its message and its button at the prototype’s own spacing', async ({ page }) => {
  // MEASURED, NOT SCREENSHOTTED. The default state of this screen has no error
  // box in it, so no baseline in `e2e/visual.spec.ts` can see either number -
  // and `docs/testing.md`'s Visual regression section records that this
  // suite's threshold absorbs a 20px displacement of a whole pane anyway.
  //
  // The two numbers are the prototype's own, and they are what separates this
  // pane's arrangement from §3.1's: the password step nests its fields and its
  // error box in a `gap: 15px` column, and the reset pane puts the field, the
  // message and the button in ordinary flow, so the message sits FLUSH under
  // the field it is about and the button 18px under that.
  await page.goto(RESET_PATH)
  await page.locator('input[name="email"]').fill('wanderings')
  await page.getByRole('button', { name: 'Send the link' }).click()
  await expect(page.locator('[data-reset-step] [role="alert"]')).toBeVisible()

  const spacing = await page.evaluate(() => {
    const field = document.querySelector('input[name="email"]')?.getBoundingClientRect()
    const alert = document.querySelector('[data-reset-step] [role="alert"]')?.getBoundingClientRect()
    const button = document.querySelector('[data-reset-step] button[type="submit"]')?.getBoundingClientRect()
    return {
      aboveTheMessage: (alert?.top ?? 0) - (field?.bottom ?? 0),
      aboveTheButton: (button?.top ?? 0) - (alert?.bottom ?? 0),
      measured: field !== undefined && alert !== undefined && button !== undefined,
    }
  })

  expect(spacing.measured).toBe(true)
  expect(spacing.aboveTheMessage).toBeCloseTo(0, 1)
  expect(spacing.aboveTheButton).toBeCloseTo(18, 1)
})

test('draws the confirmation block at the values SCREENS.md §3.3 gives it', async ({ page }) => {
  await page.goto(`${RESET_PATH}?sent=${encodeURIComponent('he•••@wanderings.travel')}`)

  const block = page.locator('[data-reset-sent]')
  // The block exists FIRST: every measurement below is vacuously true of a
  // screen that drew no block at all.
  await expect(block).toBeVisible()
  await expect(page.locator('[data-reset-sent-address]')).toHaveText('he•••@wanderings.travel')

  const drawn = await block.evaluate((element) => {
    // `offsetWidth`, NOT `getBoundingClientRect().width`. The mark is rotated
    // 45deg, and a bounding rect is the axis-aligned envelope of the rotated
    // box - it reads 19.8 for a 14px square, which is trigonometry rather than
    // drift. `offsetWidth` is the layout box, which is what SCREENS.md's
    // number is about. Measured: this case failed at 19.79 before the change.
    const mark = element.firstElementChild
    return {
      background: getComputedStyle(element).backgroundColor,
      markWidth: mark instanceof HTMLElement ? mark.offsetWidth : 0,
      markHeight: mark instanceof HTMLElement ? mark.offsetHeight : 0,
      rotated: mark === null ? '' : getComputedStyle(mark).transform,
    }
  })

  expect(drawn.background).toBe('rgba(47, 107, 104, 0.07)')
  expect(drawn.markWidth).toBe(CONFIRMATION_MARK_PX)
  expect(drawn.markHeight).toBe(CONFIRMATION_MARK_PX)
  // "the 14px ROTATED mark": a square that is not turned is a different mark,
  // and `offsetWidth` alone cannot tell them apart.
  expect(drawn.rotated).not.toBe('none')
})

test('masks an address planted in the query rather than printing it', async ({ page }) => {
  // Nothing this repository writes produces such a URL — the endpoint
  // redirects with `maskEmail`'s own output — and a hand-typed one must still
  // not put a whole address on the screen (CLAUDE.md §7).
  await page.goto(`${RESET_PATH}?sent=${encodeURIComponent('hello@wanderings.travel')}`)

  await expect(page.locator('[data-reset-sent-address]')).toHaveText('he•••@wanderings.travel')

  // SCOPED TO THE PANE, and the scope is a finding rather than a convenience.
  // Next.js echoes the request's own query string into the document's flight
  // payload (`"q":"?sent=hello%40wanderings.travel"`), so a whole-document
  // search fails here on the URL rather than on anything this screen rendered
  // - and that URL is already in the reader's address bar and in every log the
  // request touched. Which is precisely why nothing this repository writes
  // ever puts an unmasked address in that parameter: the masking asserted here
  // stops the SCREEN adding a disclosure, and cannot undo one the address has
  // already made.
  expect(await page.locator('[data-reset-step]').innerHTML()).not.toContain('hello@wanderings.travel')
})

test('draws SCREENS.md §3.4’s ringed circle at 62px, holding a 20px square', async ({ page }) => {
  await page.goto(SIGNED_IN_PATH)

  const mark = page.locator('[data-signed-in-mark]')
  await expect(mark).toBeVisible()

  // `element` is annotated so `offsetWidth` resolves: a Locator's element type
  // is `HTMLElement | SVGElement`, and an SVG element has no layout box.
  const drawn = await mark.evaluate((element: HTMLElement) => {
    // `offsetWidth` throughout, for the reason the confirmation block's case
    // gives: the square inside is rotated 45deg, and its bounding rect is the
    // axis-aligned envelope - 28.28 for a 20px square. Measured: this case
    // failed at exactly that before the change.
    const inner = element.firstElementChild
    return {
      width: element.offsetWidth,
      height: element.offsetHeight,
      radius: getComputedStyle(element).borderRadius,
      innerWidth: inner instanceof HTMLElement ? inner.offsetWidth : 0,
      innerHeight: inner instanceof HTMLElement ? inner.offsetHeight : 0,
      rotated: inner === null ? '' : getComputedStyle(inner).transform,
    }
  })

  expect(drawn.width).toBe(SIGNED_IN_MARK_PX)
  expect(drawn.height).toBe(SIGNED_IN_MARK_PX)
  expect(drawn.radius).toBe('50%')
  expect(drawn.innerWidth).toBe(SIGNED_IN_MARK_INNER_PX)
  expect(drawn.innerHeight).toBe(SIGNED_IN_MARK_INNER_PX)
  expect(drawn.rotated).not.toBe('none')
})

test('offers §3.4’s three ways on, with sign-out as a POST rather than a link', async ({ page }) => {
  await page.goto(SIGNED_IN_PATH)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The back room is open')

  await expect(page.getByRole('link', { name: 'Open the admin panel' })).toHaveAttribute('href', '/admin')
  await expect(page.getByRole('link', { name: 'View the diary instead' })).toHaveAttribute('href', '/p/1')

  // A link would sign a reader out on any prefetch or crawl of this page.
  const signOut = page.getByRole('button', { name: 'Sign out and start again' })
  await expect(signOut).toBeVisible()
  expect(await signOut.evaluate((button) => button.closest('form')?.method)).toBe('post')
})

test('draws the primary action full width and the secondary under it', async ({ page }) => {
  // The prototype's `btn(...)` is `display: block; width: 100%` for both, and
  // the ghost sits 10px below the primary. Measured rather than screenshotted,
  // for the reason this file's header gives.
  await page.goto(SIGNED_IN_PATH)

  const measured = await page.evaluate(() => {
    const [primary, secondary] = [...document.querySelectorAll('[data-signed-in-step] a')]
    const first = primary?.getBoundingClientRect()
    const second = secondary?.getBoundingClientRect()
    return {
      sameWidth: Math.abs((first?.width ?? 0) - (second?.width ?? 1)) < 0.5,
      gap: (second?.top ?? 0) - (first?.bottom ?? 0),
      width: first?.width ?? 0,
    }
  })

  expect(measured.width).toBeGreaterThan(0)
  expect(measured.sameWidth).toBe(true)
  expect(measured.gap).toBeCloseTo(10, 1)
})

test('loads every new screen without console errors or page errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })

  for (const path of [
    RESET_PATH,
    `${RESET_PATH}?sent=%E2%80%A2%E2%80%A2%E2%80%A2`,
    `${RESET_PATH}/${UNKNOWN_TOKEN}`,
    SIGNED_IN_PATH,
  ]) {
    const response = await page.goto(path, { waitUntil: 'networkidle' })
    expect(response?.ok(), `expected ${path} to respond 2xx, got ${String(response?.status())}`).toBe(true)
    // Hydration lands a beat after `networkidle`, and a mismatch on a screen
    // whose state is decided on the server is exactly what would show here.
    await page.waitForTimeout(500)
  }

  expect(errors).toEqual([])
})
