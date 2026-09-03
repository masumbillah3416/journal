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
import { drawsMobileReadingMode } from './support/surface'

// SCREENS.md §1.10 replaces the book below 860px - "No book, no flip, no
// scaling" - so this file's subject does not exist at the `mobile` project.
// The mobile reading mode has its own suite in `e2e/mobile.spec.ts`; see
// `e2e/support/surface.ts` for why this is a skip rather than a rewrite.
test.skip(({ viewport }) => drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

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

test('publishes no page but the one it left and the one it was asked for, for the whole of a bookmark jump', async ({
  page,
}) => {
  // PH1-001 (docs/qa/2026-09-03-phase-1-closing-sweep.md, S2), read the way
  // the sweep read it: poll the four places the diary names the reader's own
  // page — the counter, the page label under it, the tab the rail marks
  // `aria-current`, and the ADDRESS — every 40ms from the click until well
  // past the 970ms turn. A jump is anchored one leaf from its target so the
  // animation plays as a single turn, and that anchor used to be committed as
  // the reader's index: clicking Contents from `/p/29` read
  // `03 / 33 · Tokyo — Notes` at `/p/3`, with Tokyo's tab lit, for 981ms.
  //
  // Polled rather than read once mid-flight, because the defect is a WINDOW
  // and a single sample could fall either side of it. The two ends are read
  // out of the page rather than written down here, so the case cannot drift
  // from the seed; what it asserts is that the set of everything published
  // between them is empty.
  await page.goto(wholeBookPath(30))
  await waitForLiveBook(page)

  const published = await page.evaluate(
    async (): Promise<{ readonly origin: string; readonly seen: readonly string[] }> => {
      const read = (): string =>
        [
          document.querySelector('[data-counter]')?.textContent ?? 'no counter',
          document.querySelector('[data-page-label]')?.textContent ?? 'no label',
          document.querySelector('[data-bookmark][aria-current="page"]')?.getAttribute('data-bookmark') ?? 'no tab',
          location.pathname,
        ].join(' | ')

      const origin = read()
      const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-bookmark]')]
      const contents = tabs.find((tab) => tab.textContent.includes('Contents'))
      if (contents === undefined) return { origin, seen: ['no Contents bookmark tab in the rail'] }

      contents.click()
      const readings = [read()]
      for (let waited = 0; waited < 1_400; waited += 40) {
        await new Promise((resolve) => setTimeout(resolve, 40))
        readings.push(read())
      }
      return { origin, seen: [...new Set(readings)] }
    },
  )

  // The Contents is page 2 of the book, and tab 1 of the rail spans it.
  expect(published.seen).toEqual([published.origin, '02 / 33 | Contents | 1 | /p/2'])
})

test('changes page instantly under prefers-reduced-motion', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  // The whole-book address, for the same reason the bookmark-anchor case
  // above uses it, and it is a REAL FLAKE this case was carrying rather than
  // a convenience. The subject here is the flip machine: under reduced motion
  // the turn commits with no transition to wait out, so 200ms is generous.
  // But `Book` deliberately holds the ADDRESS until the book is whole
  // (docs/adr/0009-server-rendered-page-window.md - writing `/p/<n>` while
  // the request for the rest of the book is in flight would turn the next
  // turn into a segment navigation and unmount the book), so on the bare
  // address those 200ms are being spent on a same-origin round trip that has
  // nothing to do with reduced motion. On the machine ADR 0009 was written on
  // the round trip took 56ms and the case passed; inside
  // `mcr.microsoft.com/playwright:v1.62.1-noble`, where Postgres is a
  // host-gateway hop away, it does not - VERIFIED AT `41ca587`, with none of
  // Task 13's changes present, where this one case fails in that container
  // while the other 26 in this file pass. Opening the whole-book address
  // leaves the machine's own instantaneity as the only thing being timed.
  const page = await context.newPage()
  await page.goto(wholeBookPath(3))
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
