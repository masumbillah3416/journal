/**
 * signInJourney.spec.ts — a reader signs in, with the second factor on, by
 * filling in the real forms and pressing the real buttons.
 *
 * ═══ WHY THIS FILE EXISTS, AND WHAT IT WOULD HAVE CAUGHT ═══
 *
 * Phase 2 Task 10 mounted every endpoint on this surface and proved each one
 * with a real `Request`, a real Payload and a mutation apiece. Every one of
 * those requests carried an `Origin` header the test itself set, under a
 * comment calling it "what a browser form would have sent". It was not: the
 * admin then answered `Referrer-Policy: no-referrer`, and per the Fetch
 * standard a form-navigation `POST` under that policy sends `Origin: null` —
 * which the cross-site check refused. **Every form on this surface answered
 * 403 in a real browser**, with 1,283 unit tests, 314 integration tests,
 * twenty-one mutations and a green browser suite all agreeing it worked.
 *
 * So the rule this file exists to keep: **nothing here sets a request header,
 * and nothing here makes a request the reader does not make.** They type, they
 * click, and the browser navigates. If the request shape is wrong, these cases
 * are what says so.
 *
 * ═══ THE ONE THING IT IS HELPED WITH, AND WHY ═══
 *
 * The six digits. The server mails them through `console-mailer`, whose outbox
 * is a variable inside the server process, and the stored `codeHash` is scrypt
 * — so a browser cannot read the code and neither can this file. The helper
 * issues a SECOND challenge for the same browser through this repository's own
 * `otpService` and reads it out of an outbox this process owns, which is
 * precisely what "Send a new code" does. Everything before and after that step
 * is the reader's own.
 *
 * That is a limitation of the phase rather than of this file: until a sending
 * adapter lands, nobody can read a code they did not issue (`docs/runbook.md`).
 *
 * ═══ WHY IT DOES NOT DISTURB ANYTHING ELSE ═══
 *
 * Every account it creates has `otpRequired` at the schema default, `true`, so
 * `readSignInScreen`'s footer line — and every `admin-sign-in-*` visual
 * baseline — says exactly what it says with no account at all. Each case uses
 * an address of its own, because `otpService` caps an account at five
 * challenges an hour and a shared address would run three cases into that cap.
 *
 * It runs at one viewport. The journey is the same at all three, and
 * `SCREENS.md` §3's layout at each is `e2e/visual.spec.ts`'s subject; running
 * it three times would only spend the hourly ceiling three times over.
 *
 * Depends on: @playwright/test, ./support/adminSession.
 */
import { expect, test, type Page } from '@playwright/test'
import { aCodeFor, anAccountWithACodeStep, JOURNEY_FIXTURE_DOMAIN, removeSignedInFixture } from './support/adminSession'

/** Where the reader starts. */
const SIGN_IN_PATH = '/admin/sign-in'

/** Where the second factor is answered. */
const CODE_STEP_PATH = '/admin/sign-in/code'

/** Where a completed sign-in lands. */
const SIGNED_IN_PATH = '/admin/sign-in/done'

/** The cookie the whole surface turns on. */
const SESSION_COOKIE = 'td-session'

/** The viewport this journey runs at, matching the desktop project in playwright.config.ts. */
const DESKTOP_WIDTH = 1440

/** How many cells `SCREENS.md` §3.2 gives the code. */
const CELL_COUNT = 6

/**
 * An address of this file's own, one per case.
 *
 * @param label - What distinguishes this case's account from the others'.
 * @returns The address, and the mask the screens will print for it.
 */
const journeyAccount = (label: string): { readonly email: string; readonly masked: string } => ({
  email: `${label}@${JOURNEY_FIXTURE_DOMAIN}`,
  masked: `${label.slice(0, 2)}•••@${JOURNEY_FIXTURE_DOMAIN}`,
})

/**
 * Fills in `SCREENS.md` §3.1's form and presses its button.
 *
 * A real submit and a real navigation: no `page.request`, no headers, no
 * fabricated request. This is the shape the round-0 suite never made.
 *
 * @param page - The page under test.
 * @param account - The address and password to type.
 * @returns Once the browser has arrived at the code step.
 */
const submitThePasswordForm = async (
  page: Page,
  account: { readonly email: string; readonly password: string },
): Promise<void> => {
  await page.goto(SIGN_IN_PATH)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await Promise.all([page.waitForURL(`**${CODE_STEP_PATH}`), page.getByRole('button', { name: 'Sign in' }).click()])
}

/**
 * Types six digits into `SCREENS.md` §3.2's cells, one per cell.
 *
 * What a reader does. The paste path has its own case in
 * `e2e/codeStep.spec.ts`.
 *
 * @param page - The page under test.
 * @param code - The six digits.
 * @returns Once every cell holds one of them.
 */
const typeTheCode = async (page: Page, code: string): Promise<void> => {
  const cells = page.locator('input[name="code"]')
  for (let index = 0; index < CELL_COUNT; index += 1) {
    await cells.nth(index).fill(code.charAt(index))
  }
}

/**
 * Records every console error, page error and 4xx/5xx response on a page.
 *
 * The 403 the blocker produced was a RESPONSE, not a thrown error and not a
 * console line — a case that only watched the console would have missed it,
 * which is most of why it went unseen.
 *
 * @param page - The page to instrument.
 * @returns The array, which fills as the page runs.
 */
const watchedFailures = (page: Page): string[] => {
  const failures: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text())
  })
  page.on('pageerror', (error) => {
    failures.push(error.message)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`${String(response.status())} ${response.url()}`)
  })
  return failures
}

test.skip(
  ({ viewport }) => (viewport?.width ?? 0) !== DESKTOP_WIDTH,
  'the journey is the same at every viewport, and each run spends the account’s hourly code ceiling',
)

test.afterAll(async () => {
  // This file's own domain, never the whole fixture domain: `reset.spec.ts`,
  // `a11y.spec.ts` and `visual.spec.ts` hold sessions under
  // `SESSION_FIXTURE_DOMAIN` at the same time, and CI runs them all in one
  // invocation.
  await removeSignedInFixture(JOURNEY_FIXTURE_DOMAIN)
})

test('signs a reader in through the second factor, by filling in the real forms', async ({ page, context }) => {
  const failures = watchedFailures(page)
  const { email, masked } = journeyAccount('journey')
  const account = await anAccountWithACodeStep(email)

  // 1 · The password step. A wrong `Referrer-Policy` makes this a 403, which
  //     the response watcher records and the navigation never happens.
  await submitThePasswordForm(page, account)
  expect(page.url()).toContain(CODE_STEP_PATH)

  // 2 · The code screen is drawn against the challenge that submission caused,
  //     not against a placeholder: the masked address is this account's own and
  //     the counter is the server's.
  const carried = (await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE)
  expect(carried, 'the sign-in screen minted no session identifier').toBeDefined()
  await expect(page.locator('[data-code-step-address]')).toHaveText(masked)
  await expect(page.locator('[data-code-attempts]')).toHaveText('0 of 3 tried')

  // 3 · The code. The one step this file is helped with — see the header.
  const { code, maskedTo } = await aCodeFor(email, carried?.value ?? '')
  expect(maskedTo).toBe(masked)

  // 4 · The code step, submitted as a form. The second `POST` the blocker made
  //     impossible.
  const before = carried?.value ?? ''
  await typeTheCode(page, code)
  await Promise.all([
    page.waitForURL(`**${SIGNED_IN_PATH}`),
    page.getByRole('button', { name: 'Verify and sign in' }).click(),
  ])

  // 5 · The guarded screen draws, which means the cookie was set AND the guard
  //     read a live row from it.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The back room is open')

  // 6 · The identifier rotated, and is scoped where `SECURITY.md` puts it.
  const after = (await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE)
  expect(after?.value).not.toBe(before)
  expect(after?.path).toBe('/admin')

  expect(failures, 'the journey produced console errors, page errors or 4xx/5xx responses').toEqual([])
})

test('signs the reader out again, and the guarded screen refuses them afterwards', async ({ page, context }) => {
  const { email, masked } = journeyAccount('goodbye')
  const account = await anAccountWithACodeStep(email)
  await submitThePasswordForm(page, account)
  const carried = (await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE)
  const { code, maskedTo } = await aCodeFor(email, carried?.value ?? '')
  expect(maskedTo).toBe(masked)
  await typeTheCode(page, code)
  await Promise.all([
    page.waitForURL(`**${SIGNED_IN_PATH}`),
    page.getByRole('button', { name: 'Verify and sign in' }).click(),
  ])

  await Promise.all([
    page.waitForURL(`**${SIGN_IN_PATH}`),
    page.getByRole('button', { name: 'Sign out and start again' }).click(),
  ])

  // The ROW was revoked, not just the cookie cleared: asking for the guarded
  // screen again lands back on the sign-in step.
  await page.goto(SIGNED_IN_PATH)
  expect(page.url()).toContain(SIGN_IN_PATH)
  expect(page.url()).not.toContain(SIGNED_IN_PATH)
})

test('asks for a new code from the screen itself, without naming an account', async ({ page }) => {
  // The resend was the last unmounted form on this surface. It posts a body
  // with nothing in it — the account is resolved from the challenge bound to
  // the browser's own identifier — so a 403 or a 404 here is what this is for.
  const failures = watchedFailures(page)
  const { email, masked } = journeyAccount('resender')
  const account = await anAccountWithACodeStep(email)
  await submitThePasswordForm(page, account)

  // SUBMITTED, NOT CLICKED, and only because the button is inside its own
  // thirty-second cooldown at this instant (`SCREENS.md` §3.2 makes it inert
  // until then, and `e2e/codeStep.spec.ts` covers that). `form.submit()` is
  // still a real form navigation carrying the same `Origin` a click would —
  // what this file refuses to do is fabricate a REQUEST, and this fabricates
  // none.
  await Promise.all([
    page.waitForURL(`**${CODE_STEP_PATH}`),
    page.locator('form[action$="/resend"]').evaluate((form: HTMLFormElement) => {
      form.submit()
    }),
  ])

  await expect(page.locator('[data-code-step-address]')).toHaveText(masked)
  expect(failures).toEqual([])
})

test('refuses a wrong code and shows the server’s own count of what is left', async ({ page }) => {
  // The attempts counter was a hard-coded zero for three tasks. It is the
  // server's now, which is what makes it true rather than decorative.
  const { email } = journeyAccount('mistyper')
  const account = await anAccountWithACodeStep(email)
  await submitThePasswordForm(page, account)

  await typeTheCode(page, '000000')
  await page.getByRole('button', { name: 'Verify and sign in' }).click()

  await expect(page.locator('[data-code-attempts]')).toHaveText('1 of 3 tried')
  expect(page.url()).toContain(CODE_STEP_PATH)
  expect(page.url()).not.toContain(SIGNED_IN_PATH)
})
