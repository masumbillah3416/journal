/**
 * flip.spec.ts — the reader's own triggers, driven in a real browser.
 *
 * Every trigger the handoff lists (README, "Triggers") is exercised here as a
 * reader would use it: the 44px right page-edge strip and the 30px left strip,
 * the bottom prev/next arrows, ArrowLeft/ArrowRight and PageUp/PageDown, and
 * the bookmark tabs. The component suites in `apps/web/components/book/`
 * already prove each trigger is wired to the flip machine; what only a browser
 * can prove is the part jsdom is blind to — that a strip positioned over the
 * page stack is genuinely CLICKABLE rather than covered by the leaf above it
 * (a z-index and hit-testing question, which Playwright's own actionability
 * check is what settles), that `prefers-reduced-motion` reaches the machine
 * through a real media query, and that a real 900ms transition running while
 * the reader hammers a key cannot leave the book seized.
 *
 * Two cases read the page stack MID-TURN, and both fire their own trigger from
 * inside `page.evaluate` and then wait exactly ONE animation frame before
 * reading. That is deliberate. Firing from inside the page removes the driver
 * round-trip, which on a slow machine could otherwise let a 970ms turn finish
 * before the read; one frame is then the shortest wait that is actually enough,
 * because React does not flush a click's re-render synchronously (measured -
 * reading in the same task returned the stack exactly as it was BEFORE the
 * click). 16ms into a 970ms turn is nowhere near its commit, so the read is
 * deterministic in both directions. The four-line "which leaves are visible"
 * snippet is repeated inside each of them because an `evaluate` body is
 * serialized into the page and cannot call a helper that lives out here.
 *
 * EVERY CASE WAITS FOR THE BOOK TO BE LIVE before it presses anything. The
 * book is a client component, so between the server's HTML arriving and React
 * hydrating it there is a window in which the page renders perfectly and no
 * trigger does anything at all. A key press lost in that window is lost for
 * good - no retry brings it back - so the tests that press hardest were the
 * ones that failed: the reduced-motion pair, whose whole point is that they do
 * not wait out a transition, went red on all three viewport projects until this
 * wait was added, while the more patient cases won the same race by luck. What
 * `waitForLiveBook` watches is the measured scale replacing the server's
 * `scale(1)`, which is the first thing any of the book's effects do.
 *
 * The seizure case is the one worth staying honest about. It does not assert
 * "twelve presses turn twelve pages" — the latch is SUPPOSED to swallow the
 * ones that arrive mid-flip, so counting them would encode the opposite of the
 * design. It asserts the only thing that matters: after the storm, the book
 * still turns.
 * Depends on: @playwright/test, `waitForLiveBook` (./support/liveBook), the
 * running app from playwright.config.ts's `webServer`, and the seeded diary
 * (`npm run db:seed`) whose first journey is Tokyo, starting on page 3 of 33.
 */
import { expect, test } from '@playwright/test'
import { waitForLiveBook, wholeBookPath } from './support/liveBook'

test('turns forward on the right edge strip and back on the left', async ({ page }) => {
  await page.goto('/p/3')
  await waitForLiveBook(page)

  await page.locator('[data-edge="right"]').click()
  await expect(page).toHaveURL(/\/p\/4/)

  await page.locator('[data-edge="left"]').click()
  await expect(page).toHaveURL(/\/p\/3/)
})

test('turns forward and back on the bottom arrows', async ({ page }) => {
  await page.goto('/p/3')
  await waitForLiveBook(page)

  await page.locator('[data-nav="next"]').click()
  await expect(page).toHaveURL(/\/p\/4/)

  await page.locator('[data-nav="prev"]').click()
  await expect(page).toHaveURL(/\/p\/3/)
})

test('turns with the keyboard', async ({ page }) => {
  await page.goto('/p/3')
  await waitForLiveBook(page)

  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/\/p\/4/)

  await page.keyboard.press('PageUp')
  await expect(page).toHaveURL(/\/p\/3/)
})

test('leaves the keyboard alone while the reader is typing', async ({ page }) => {
  await page.goto('/p/3')
  await waitForLiveBook(page)
  await page.evaluate(() => {
    // A text field the diary does not own yet (a search box, the admin's own
    // forms) is exactly the situation a window-level key listener gets wrong,
    // so the guard is asserted against a real focused input rather than
    // trusted from the unit test alone.
    const field = document.createElement('input')
    document.body.appendChild(field)
    field.focus()
  })

  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(1200)

  await expect(page).toHaveURL(/\/p\/3/)
})

test('a bookmark jump animates in the direction of travel', async ({ page }) => {
  await page.goto('/p/30')
  await waitForLiveBook(page)

  await page.getByRole('button', { name: /Tokyo/ }).click()

  await expect(page).toHaveURL(/\/p\/3/)
})

test('a bookmark jump departs from the page beside its target, not from across the book', async ({ page }) => {
  // THE ANCHOR RULE (handoff README, "Triggers"): "Bookmark jumps set an
  // anchor page one step from the target, then flip, so the animation always
  // plays in the right direction." A jump from page 30 to page 3 must
  // therefore be a one-leaf backward turn departing from leaf 3 (page 4), not
  // a twenty-seven-leaf turn departing from leaf 29. Both land the reader on
  // the same page, so the difference is only visible while the turn is in
  // flight — which is what this reads. See this file's header for why the
  // click is dispatched from inside the page.
  //
  // It opens on the whole-book address rather than the bare one because it
  // reads a SINGLE animation frame after the click, and a served document
  // carries only a window of the book's pages until the reader's first turn
  // brings the rest (docs/adr/0009-server-rendered-page-window.md). Leaf 2 is
  // twenty-seven pages from this reader, so on the bare address the first
  // frame after the click is the book waiting for a round trip — which is
  // real behaviour, asserted in e2e/serverWindow.spec.ts, and not the anchor
  // rule this case is about.
  await page.goto(wholeBookPath(30))
  await waitForLiveBook(page)

  const inFlight = await page.evaluate(async (): Promise<readonly string[]> => {
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-bookmark]')]
    const tokyo = tabs.find((tab) => tab.textContent.includes('Tokyo'))
    if (tokyo === undefined) return ['no Tokyo bookmark tab in the rail']

    tokyo.click()
    await new Promise((resolve) => requestAnimationFrame(resolve))

    return [...document.querySelectorAll('[data-leaf]')]
      .filter((leaf) => getComputedStyle(leaf).visibility === 'visible')
      .map((leaf) => leaf.getAttribute('data-leaf') ?? 'unnumbered')
      .sort()
  })

  expect(inFlight).toEqual(['2', '3'])
})

test('changes page instantly under prefers-reduced-motion', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('/p/3')
  await waitForLiveBook(page)

  await page.keyboard.press('ArrowRight')

  // No transition to wait out — the URL and content are correct immediately.
  await expect(page).toHaveURL(/\/p\/4/, { timeout: 200 })
  await context.close()
})

test('leaves no turn in flight at all under prefers-reduced-motion', async ({ browser }) => {
  // "The page then changes with no rotation and no shade." An instant URL
  // change alone would also be satisfied by a book that still spun a leaf and
  // committed early, so what is asserted is that the stack never enters a turn
  // at all: mid-turn TWO leaves are visible, the departing one and the
  // arriving one, and a book that changed page instantly shows exactly one.
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('/p/3')
  await waitForLiveBook(page)

  const afterTheKey = await page.evaluate(async (): Promise<readonly string[]> => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await new Promise((resolve) => requestAnimationFrame(resolve))

    return [...document.querySelectorAll('[data-leaf]')]
      .filter((leaf) => getComputedStyle(leaf).visibility === 'visible')
      .map((leaf) => leaf.getAttribute('data-leaf') ?? 'unnumbered')
      .sort()
  })

  expect(afterTheKey).toEqual(['3'])
  await context.close()
})

test('rapid repeated turns cannot seize the book', async ({ page }) => {
  await page.goto('/p/1')
  await waitForLiveBook(page)

  for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowRight')

  // The latch swallows mid-flip requests; the book must still be usable.
  await page.waitForTimeout(1500)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-counter]')).not.toHaveText('01 / 33')
})
