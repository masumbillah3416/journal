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
 * THE PAGE THE DIARY PUBLISHES AND THE ADDRESS IT WRITES ARE TWO SERIES, NOT
 * ONE TUPLE, and the three bookmark-jump cases below poll them as two through
 * `pollPublishedSeriesAfterContentsClick`. The counter, the label and the
 * rail's active tab are written in one React commit; the address is written by
 * a separate effect in `apps/web/components/book/Book.tsx`, whose header
 * records at length that it can lag a committed turn and that this is a
 * deliberate cost rather than an invariant (ADR 0009). Read as one tuple, the
 * jump case caught the new page at the old address ~2% of runs and called it a
 * third published page — see docs/qa/2026-09-08-flip-address-lag-defect.md.
 *
 * The three are one behaviour each, in order: the pages the diary publishes,
 * the addresses it writes, and — under a deliberately widened lag — the two as
 * they were seen TOGETHER. The third is the one that keeps the other two
 * honest: it is the reproduction of the flake, kept rather than thrown away,
 * and it asserts a sample that cannot exist unless the widening is really in
 * force, so it cannot quietly decay into a duplicate of the first.
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
import { expect, test, type Page } from '@playwright/test'
import { deferAddressWrites, waitForLiveBook, wholeBookPath } from './support/liveBook'
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

/** The three series a bookmark jump to the Contents publishes while it runs. */
interface PublishedSeries {
  /**
   * Every distinct page identity published, in order: the counter, the label
   * under it, and the tab the rail marks, joined. All three are written in ONE
   * React commit, so any reading of them is self-consistent by construction.
   */
  readonly identities: readonly string[]
  /** Every distinct address the book wrote, in order. */
  readonly addresses: readonly string[]
  /**
   * Every distinct `identity @ address` sample, in order — the two series as
   * they were actually observed together, rather than as two independent
   * histories.
   *
   * It is NOT derivable from the two above: deduplicating each series on its
   * own throws away which identity a given address was read beside, which is
   * precisely the fact the lag case needs. It is the only observation that can
   * tell "the deferral was in force" from "the deferral silently did nothing",
   * and without it that case degrades into a copy of its neighbour the day
   * `Book.tsx` stops writing the address through `window.history.replaceState`.
   */
  readonly pairs: readonly string[]
}

/**
 * Clicks the Contents bookmark tab and polls what the diary publishes every
 * 40ms until well past the 970ms turn, as THREE adjacent-deduplicated series.
 *
 * TWO SERIES RATHER THAN ONE TUPLE, and that is the whole point of this
 * helper. The identity is written in one React commit; the address is written
 * by a separate effect in `apps/web/components/book/Book.tsx`, whose header
 * records that it can lag a committed turn and that this is a deliberate cost
 * rather than an invariant (ADR 0009). Folding the address into the identity
 * asserted a coupling the application never promised, and cost ~2% of runs
 * (docs/qa/2026-09-08-flip-address-lag-defect.md). The third series, `pairs`,
 * keeps the two as they were seen together, for the one case that is about
 * their relative timing rather than about either of them.
 *
 * ADJACENT-DEDUPLICATED AND ORDERED, NOT A `Set`. A set discards order, so a
 * book that published the destination, went back to the origin and returned
 * would produce the same set as one that never wavered — and two of the three
 * things the cases below guard are about order.
 *
 * THE 2,000ms WINDOW IS SIZED FROM A MEASUREMENT, not from the 970ms turn.
 * With `deferAddressWrites` at 200ms the identity commits at t≈1,011-1,035ms
 * and the address lands at t≈1,209-1,241ms (three runs, measured 2026-09-13
 * and recorded in docs/qa/2026-09-08-flip-address-lag-defect.md §6). The
 * original 1,400ms window left ~160ms of margin on that last event, which is
 * one long frame away from dropping it — and a case that drops its last
 * sample is the next flake. 2,000ms leaves ~760ms.
 *
 * The click is dispatched from inside the page for the reason this file's
 * header gives: the driver round-trip is time the turn is already spending.
 *
 * @param page - A live book (`waitForLiveBook`) whose rail carries a Contents tab.
 * @returns The identities, the addresses and the pairs, each in order, each
 *   without adjacent repeats. Element `0` of each is what was read before the
 *   click — the page the reader left.
 * @example
 * const published = await pollPublishedSeriesAfterContentsClick(page)
 * expect(published.identities).toEqual([published.identities[0], '02 / 33 | Contents | 1'])
 */
const pollPublishedSeriesAfterContentsClick = async (page: Page): Promise<PublishedSeries> =>
  page.evaluate(async (): Promise<PublishedSeries> => {
    // THE PUBLISHED PAGE, which is what PH1-001 was about: the counter, the
    // label under it, and the tab the rail marks.
    const identity = (): string =>
      [
        document.querySelector('[data-counter]')?.textContent ?? 'no counter',
        document.querySelector('[data-page-label]')?.textContent ?? 'no label',
        document.querySelector('[data-bookmark][aria-current="page"]')?.getAttribute('data-bookmark') ?? 'no tab',
      ].join(' | ')

    // THE ADDRESS, as its own series, for the reason in this helper's TSDoc.
    const address = (): string => location.pathname

    const identities: string[] = []
    const addresses: string[] = []
    const pairs: string[] = []

    // ONE READ OF EACH PER SAMPLE, FED TO ALL THREE SERIES. Reading the DOM a
    // second time to build the pair would let it describe a moment neither of
    // the other two series saw — which is the very confusion between an
    // identity and the address beside it that this helper exists to end.
    const record = (): void => {
      const nextIdentity = identity()
      const nextAddress = address()
      const nextPair = `${nextIdentity} @ ${nextAddress}`
      if (nextIdentity !== identities[identities.length - 1]) identities.push(nextIdentity)
      if (nextAddress !== addresses[addresses.length - 1]) addresses.push(nextAddress)
      if (nextPair !== pairs[pairs.length - 1]) pairs.push(nextPair)
    }

    // The reader's page before the click, so every series starts where they were.
    record()

    const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-bookmark]')]
    const contents = tabs.find((tab) => tab.textContent.includes('Contents'))
    if (contents === undefined)
      return { identities: ['no Contents bookmark tab in the rail'], addresses: [], pairs: [] }

    contents.click()
    for (let waited = 0; waited < 2_000; waited += 40) {
      await new Promise((resolve) => setTimeout(resolve, 40))
      record()
    }
    return { identities, addresses, pairs }
  })

test('publishes no page but the one it left and the one it was asked for, for the whole of a bookmark jump', async ({
  page,
}) => {
  // PH1-001 (docs/qa/2026-09-03-phase-1-closing-sweep.md, S2): poll the places
  // the diary names the reader's own page — the counter, the page label under
  // it, the tab the rail marks `aria-current`, and the address — every 40ms
  // from the click until well past the 970ms turn. A jump is anchored one leaf
  // from its target so the animation plays as a single turn, and that anchor
  // used to be committed as the reader's index: clicking Contents from `/p/29`
  // read `03 / 33 · Tokyo — Notes` at `/p/3`, with Tokyo's tab lit, for 981ms.
  //
  // The sweep read those four as one tuple, and this case did too until the
  // address turned out to be a SEPARATE series that settles on its own
  // schedule — see this file's header. They are polled together and asserted
  // apart: the address has the case below to itself.
  //
  // Polled rather than read once mid-flight, because the defect is a WINDOW
  // and a single sample could fall either side of it. The origin is read out
  // of the page rather than written down here, so the case cannot drift from
  // the seed; what it asserts is that everything published between the two
  // ends is nothing at all.
  await page.goto(wholeBookPath(30))
  await waitForLiveBook(page)

  const published = await pollPublishedSeriesAfterContentsClick(page)

  // What PH1-001 is actually about: between the two ends, no third page is
  // ever published. The Contents is page 2 of the book, and tab 1 of the rail
  // spans it. The origin is read out of the page rather than written down, so
  // the case cannot drift from the seed.
  expect(published.identities).toEqual([published.identities[0], '02 / 33 | Contents | 1'])
})

test('writes the address of the page it was asked for and of no other, during a bookmark jump', async ({ page }) => {
  // THE ADDRESS AS ITS OWN SUBJECT, in its own case, because it is its own
  // series: it starts where the reader was and ends where they went, and never
  // visits a third place. WHEN it moves relative to the published page is not
  // asserted, here or anywhere, because `Book.tsx` deliberately does not
  // promise that (its header, and ADR 0009).
  //
  // Split out of the case above rather than left beside it: that case is named
  // for the pages the diary PUBLISHES, and an address failure reported under
  // that name sends whoever triages it to the wrong half of the book. Both
  // read the same helper, so the two cannot drift apart.
  await page.goto(wholeBookPath(30))
  await waitForLiveBook(page)

  const published = await pollPublishedSeriesAfterContentsClick(page)

  expect(published.addresses).toEqual(['/p/30', '/p/2'])
})

test('publishes no third page even when the address write is delayed well past a poll', async ({ page }) => {
  // THE REGRESSION GUARD FOR THE FIX IN
  // docs/qa/2026-09-08-flip-address-lag-defect.md, and it asserts the PAIRS
  // rather than either series on its own, because its subject is the one thing
  // only the pairs can show: that the diary published the destination while
  // the address still named the origin, and still published nothing else.
  // Against the case as it stood - one tuple with the address folded into it -
  // this delay failed it 10 of 10: that assertion could not tell "a third page
  // was published" from "the address had not caught up yet".
  //
  // ASSERTING THE PAIRS IS WHAT PINS THE INSTRUMENT, and that is not a detail.
  // `deferAddressWrites` patches `window.history.replaceState`; ADR 0009
  // records the address hold as held open pending a measurement nobody has
  // taken, so how `Book.tsx` writes the address is a thing this repository
  // expects to revisit. The day it writes it through anything else, the
  // deferral silently becomes zero - and a case that only asserted the
  // identities would keep passing, as a verbatim duplicate of the first case
  // above, guarding nothing. The middle pair below cannot be produced without
  // the deferral actually biting, so that day this case goes red instead.
  await deferAddressWrites(page, { delayMs: 200 })
  await page.goto(wholeBookPath(30))
  await waitForLiveBook(page)

  const published = await pollPublishedSeriesAfterContentsClick(page)

  expect(published.pairs).toEqual([
    published.pairs[0],
    '02 / 33 | Contents | 1 @ /p/30',
    '02 / 33 | Contents | 1 @ /p/2',
  ])
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
