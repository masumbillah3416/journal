/**
 * signIn.spec.ts — the sign-in screen in a real browser: the prototype's
 * `localStorage` hole proved closed against the DELIVERED page, the two
 * breakpoints SCREENS.md §3 specifies, and the pane's own behaviour.
 *
 * ═══ WHY THE FIRST THREE CASES ARE NOT A GREP ═══
 *
 * `SECURITY.md`'s second prototype hole is that the OTP on/off flag lived in
 * `localStorage['om-diary-otp']`, "where anyone can set it to `0` and skip the
 * second factor entirely", and the required fix is that the code step is
 * decided from `users.otpRequired`, server-side. A grep of the source proves
 * only that nobody TYPED that read - not that nothing the route ships
 * performs one. React, a dependency, a future analytics snippet or a
 * copy-pasted prototype helper could all put it back without touching
 * `PasswordStep.tsx`. So all three cases below run against what the browser
 * actually received:
 *
 *   1. Every `Storage` read is recorded by an init script installed BEFORE
 *      the document exists, and the page is required to make none.
 *   2. The prototype's own key is planted with the OPPOSITE answer in it
 *      before navigation, and the footer line is required not to move. This
 *      is the hole itself, reproduced: against the prototype this case would
 *      read "the code step is switched off".
 *   3. Every script the page fetched is downloaded and searched for the key.
 *      A bundle carrying the string is a read waiting to happen even if it
 *      did not fire on this load.
 *
 * EVERY ONE OF THEM ALSO ASSERTS THE FOOTER LINE EXISTS AND SAYS SOMETHING.
 * "The page read no storage" and "no script names the key" are both trivially
 * true of a page that failed to render, which is this phase's most common
 * defective test shape - an assertion about content with no assertion that
 * content exists.
 *
 * THE SEEDED DATABASE HAS NO ACCOUNT, so the server's answer here is "the
 * code step is on" - `readSignInScreen` fails closed for an empty `users`
 * table and for a `NULL` column alike, and its own integration suite proves
 * all four inputs. What this file adds is that the browser is told that
 * answer and cannot overrule it.
 *
 * Depends on: @playwright/test, the running app from playwright.config.ts's
 * `webServer`, and the seeded diary (`npm run db:seed`) - the cloth panel
 * prints the `book` global's own title and subtitle.
 */
import { expect, test, type Page } from '@playwright/test'

/** The screen's address. Not a choice - see the route's own header. */
const SIGN_IN_PATH = '/admin/sign-in'

/** The key the handoff's prototype kept the OTP flag under. */
const PROTOTYPE_FLAG_KEY = 'om-diary-otp'

/** What the footer line says when the code step runs (SCREENS.md §3.1). */
const CODE_STEP_ON_NOTICE =
  'A one-time code is asked for after your password. Turn it off under Account → Getting in.'

/**
 * Installs a recorder over `Storage.prototype`'s three readers, before any
 * document script can run.
 *
 * `addInitScript` runs in a fresh context on every navigation and before the
 * page's own scripts, which is the only placement that can observe a read
 * made during the initial load - the exact placement `e2e/smoke.spec.ts`
 * attaches its console listeners at, for the same reason.
 *
 * @param page - The page to instrument, before it is navigated.
 */
const recordStorageReads = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const readKeys: string[] = []
    Object.defineProperty(window, '__storageReads', { value: readKeys })

    // Both readers, not just `getItem`: `key(i)` walks the store by index and
    // would let a page find the flag without ever naming it. Each original is
    // captured and called with the caller's own `this`, so `localStorage` and
    // `sessionStorage` both keep working - a recorder that broke storage would
    // change the behaviour it is supposed to observe.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- capturing the prototype method is the point: it is re-invoked below with `.call(this, ...)`, which is the receiver the rule exists to protect.
    const readByKey = Storage.prototype.getItem
    Storage.prototype.getItem = function recordedGetItem(this: Storage, name: string): string | null {
      readKeys.push(`getItem:${name}`)
      return readByKey.call(this, name)
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method -- same reason as above.
    const readByIndex = Storage.prototype.key
    Storage.prototype.key = function recordedKey(this: Storage, index: number): string | null {
      readKeys.push(`key:${String(index)}`)
      return readByIndex.call(this, index)
    }
  })
}

/** Every `Storage` read the page made, as `method:key`. */
const storageReads = (page: Page): Promise<readonly string[]> =>
  page.evaluate(() => (window as unknown as { __storageReads: readonly string[] }).__storageReads)

test('states the code step from the server and reads no browser storage to do it', async ({ page }) => {
  await recordStorageReads(page)

  await page.goto(SIGN_IN_PATH, { waitUntil: 'networkidle' })

  const footer = page.locator('[data-code-step]')
  // The line exists and says the server's answer FIRST: without this, the
  // storage assertion below is true of a page that rendered nothing.
  await expect(footer).toHaveText(CODE_STEP_ON_NOTICE)
  await expect(footer).toHaveAttribute('data-code-step', 'on')

  // Hydration runs after `networkidle`; a read made by a client component on
  // mount lands a beat later than the navigation events (same reasoning as
  // e2e/smoke.spec.ts's own grace period).
  await page.waitForTimeout(500)

  expect(await storageReads(page)).toEqual([])
})

test('keeps the server’s answer when the prototype’s own flag is planted in localStorage', async ({ page }) => {
  // The hole itself. Against the handoff's prototype this plants "off" and
  // the footer obeys it; against this implementation nothing changes.
  await page.addInitScript((key: string) => {
    window.localStorage.setItem(key, '0')
  }, PROTOTYPE_FLAG_KEY)

  await page.goto(SIGN_IN_PATH, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)

  const footer = page.locator('[data-code-step]')
  await expect(footer).toHaveAttribute('data-code-step', 'on')
  await expect(footer).toHaveText(CODE_STEP_ON_NOTICE)
  // The planted value is still there - so the case really did plant it, and
  // the page really did ignore it rather than the setup having silently
  // failed.
  expect(await page.evaluate((key: string) => window.localStorage.getItem(key), PROTOTYPE_FLAG_KEY)).toBe('0')
})

test('ships no script that names the prototype’s flag', async ({ page }) => {
  const scriptUrls = new Set<string>()
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') scriptUrls.add(response.url())
  })

  await page.goto(SIGN_IN_PATH, { waitUntil: 'networkidle' })
  await expect(page.locator('[data-code-step]')).toHaveText(CODE_STEP_ON_NOTICE)

  // A route that shipped no script at all would pass the search below without
  // proving anything; this screen has a client component on it, so it ships
  // several.
  expect(scriptUrls.size).toBeGreaterThan(0)

  const naming: string[] = []
  for (const url of scriptUrls) {
    const body = await (await page.request.get(url)).text()
    if (body.includes(PROTOTYPE_FLAG_KEY)) naming.push(url)
  }

  expect(naming).toEqual([])
})

test('draws the cloth panel beside the form above the breakpoint', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 820, 'the cloth panel is SCREENS.md §3’s wide layout')

  await page.goto(SIGN_IN_PATH)

  await expect(page.locator('[data-sign-in-cloth]')).toBeVisible()
  await expect(page.locator('[data-sign-in-masthead]')).toBeHidden()
  await expect(page.locator('[data-sign-in-cloth-title]')).toHaveText('Wanderings')

  // Two columns, not one: the shell's own grid is what puts the cloth beside
  // the form rather than above it, and a collapsed grid still renders both
  // panels.
  const columns = await page
    .locator('[data-sign-in-shell]')
    .evaluate((shell) => getComputedStyle(shell).gridTemplateColumns.split(' ').length)
  expect(columns).toBe(2)
})

test('replaces the cloth panel with the masthead below the breakpoint', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) >= 820, 'the masthead is SCREENS.md §3’s narrow layout')

  await page.goto(SIGN_IN_PATH)

  await expect(page.locator('[data-sign-in-masthead]')).toBeVisible()
  await expect(page.locator('[data-sign-in-cloth]')).toBeHidden()
  await expect(page.locator('[data-sign-in-masthead-title]')).toHaveText('Wanderings')

  const columns = await page
    .locator('[data-sign-in-shell]')
    .evaluate((shell) => getComputedStyle(shell).gridTemplateColumns.split(' ').length)
  expect(columns).toBe(1)
})

test('hides the password until the reader asks for it, then shows it', async ({ page }) => {
  await page.goto(SIGN_IN_PATH)
  const password = page.locator('input[name="password"]')
  await password.fill('the password')

  await expect(password).toHaveAttribute('type', 'password')

  await page.getByRole('button', { name: 'Show the password' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  // The value survives the swap - a toggle that re-created the input would
  // clear what the reader had typed.
  await expect(password).toHaveValue('the password')

  await page.getByRole('button', { name: 'Hide the password' }).click()
  await expect(password).toHaveAttribute('type', 'password')
})

test('refuses to send an address that is not one, and says so where the reader is', async ({ page }) => {
  await page.goto(SIGN_IN_PATH)
  await page.locator('input[name="email"]').fill('wanderings')
  await page.locator('input[name="password"]').fill('the password')

  await page.getByRole('button', { name: 'Sign in' }).click()

  // Scoped to the pane: Next.js puts its own `role="alert"` route announcer
  // in every document, so an unscoped role query is a strict-mode violation
  // rather than an assertion about this screen.
  await expect(page.locator('[data-password-step] [role="alert"]')).toHaveText(
    'That does not look like an email address.',
  )
  // Still on the screen: the submission was stopped, not sent and answered.
  expect(new URL(page.url()).pathname).toBe(SIGN_IN_PATH)
  await expect(page.locator('input[name="email"]')).toHaveAttribute('aria-invalid', 'true')
})
