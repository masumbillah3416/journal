/**
 * codeStep.spec.ts — the one-time-code screen in a real browser: the three
 * things about `SCREENS.md` §3.2 that no jsdom test can settle.
 *
 * ═══ WHY EACH OF THESE IS HERE AND NOT IN `CodeStep.test.tsx` ═══
 *
 * 1. THE CELL WIDTHS. jsdom performs no layout and loads no stylesheet, so it
 *    cannot say how wide a cell is. `SCREENS.md` §3 records the exact failure
 *    this guards — "at `40px 42px` in a 342px shell the OTP cells collapse to
 *    7px" — and the fix is the narrow pane padding, `26px 20px 24px`. The case
 *    below pins a LITERAL minimum rather than anything derived from the
 *    stylesheet: a floor compared against the value it is meant to hold still
 *    moves with it and can never fail. Measured, the correct padding gives
 *    each cell about 42.8px at 390px and the rejected `40px 42px` gives about
 *    35.5px, so the 40px floor separates them — and it was watched to fail
 *    with the wide padding restored (Task 8 report).
 *
 * 2. THE PASTE. Each cell is `maxLength="1"` and the browser truncates a
 *    pasted string to one character BEFORE `change` fires, which is the whole
 *    reason `onPaste` exists. jsdom performs no default paste at all, so a
 *    jsdom case proves the handler spreads the digits and NOT that a reader
 *    pasting a code gets six of them. This one puts the code on the real
 *    clipboard and presses Ctrl+V: with the handler removed it lands one
 *    digit, which is the defect itself.
 *
 * 3. THE SHAKE UNDER `prefers-reduced-motion`. A media query is a property of
 *    the stylesheet. A test asserting that the pane raised its flag says
 *    nothing about whether anything moves, so both cases below read
 *    `animation-name` off the SHELL's computed style, under each setting.
 *
 * Each shake case clicks and reads in ONE `page.evaluate`, on purpose: the
 * flag is cleared 420ms later, and a click followed by a separate round trip
 * is a race that fails under load rather than under a defect. React flushes a
 * click's state update in a MICROTASK rather than synchronously (measured -
 * the style read immediately after `click()` returns still shows the previous
 * render), so each case yields the microtask queue once and then reads. That
 * is not a wait dressed up as one: the 420ms timer that clears the flag is a
 * macrotask scheduled during that same flush, so it cannot possibly have run
 * before the read.
 *
 * Depends on: @playwright/test, the running app from playwright.config.ts's
 * `webServer`, and the seeded diary (`npm run db:seed`) — the shell prints the
 * `book` global's own title.
 */
import { expect, test } from '@playwright/test'

/** The screen's address. */
const CODE_STEP_PATH = '/admin/sign-in/code'

/**
 * The narrowest a code cell may be at 390px, in CSS pixels.
 *
 * A literal, deliberately, and not `(paneWidth - gaps) / 6` or anything else
 * read back off the layout under test — a floor derived from the thing it
 * guards moves with it and can never fail. 40px sits between the two layouts
 * this is about: the required narrow padding measures about 42.8px per cell,
 * and `SCREENS.md` §3's rejected `40px 42px` measures about 35.5px.
 */
const MINIMUM_CELL_WIDTH_PX = 40

/** The code a reader would have copied out of their email. */
const PASTED_CODE = '123456'

test('gives every code cell a usable width in the narrow shell', async ({ page, viewport }) => {
  test.skip(viewport?.width !== 390, 'SCREENS.md §3 records the collapse in the narrow shell')

  await page.goto(CODE_STEP_PATH, { waitUntil: 'networkidle' })

  const cells = page.locator('[data-code-cell]')
  // The row exists FIRST: "every cell is wider than 40px" is trivially true of
  // a page that rendered no cells.
  await expect(cells).toHaveCount(6)

  const widths = await cells.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width))

  expect(widths).toHaveLength(6)
  for (const width of widths) expect(width).toBeGreaterThan(MINIMUM_CELL_WIDTH_PX)
})

test('keeps every code cell inside the pane rather than overflowing it', async ({ page, viewport }) => {
  test.skip(viewport?.width !== 390, 'SCREENS.md §3 records the collapse in the narrow shell')

  await page.goto(CODE_STEP_PATH, { waitUntil: 'networkidle' })
  await expect(page.locator('[data-code-cell]')).toHaveCount(6)

  // The other half of the same defect: cells that refuse to shrink do not
  // collapse, they overflow, and the width case above would pass on a row
  // running out of the pane.
  //
  // THE CELLS ARE MEASURED, NOT THE ROW. An earlier version of this case
  // measured the flex CONTAINER against the form panel, which cannot fail:
  // a block-level container is sized by its parent whatever its children do,
  // so under `.cell { flex: none }` the row still reported itself inside the
  // panel while its own cells stood 1,721px past the pane's edge. What has to
  // be inside the pane is each CELL, and the box it has to be inside is the
  // pane's CONTENT box - the padding SCREENS.md §3 calls required is exactly
  // what that padding is.
  const measured = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('[data-code-cell]')]
    const pane = document.querySelector('[data-sign-in-pane]')
    const first = cells.at(0)
    const last = cells.at(-1)
    if (pane === null || first === undefined || last === undefined) return null

    const paneBox = pane.getBoundingClientRect()
    const padding = getComputedStyle(pane)
    return {
      cellCount: cells.length,
      // Positive means the cell stands outside the pane's content box on that
      // side; zero or negative means it fits.
      pastTheLeftEdge: paneBox.left + Number.parseFloat(padding.paddingLeft) - first.getBoundingClientRect().left,
      pastTheRightEdge: last.getBoundingClientRect().right - (paneBox.right - Number.parseFloat(padding.paddingRight)),
    }
  })

  // Six cells were actually measured, so the two assertions below are about a
  // row that exists.
  expect(measured?.cellCount).toBe(6)
  // Half a pixel of tolerance for sub-pixel layout, and no more.
  expect(measured?.pastTheLeftEdge).toBeLessThanOrEqual(0.5)
  expect(measured?.pastTheRightEdge).toBeLessThanOrEqual(0.5)
})

test('spreads a pasted six-digit code across all six cells, past maxLength', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(CODE_STEP_PATH, { waitUntil: 'networkidle' })
  await expect(page.locator('[data-code-cell]')).toHaveCount(6)

  await page.evaluate(async (code: string) => {
    await navigator.clipboard.writeText(code)
  }, PASTED_CODE)

  await page.locator('[data-code-cell="0"]').focus()
  await page.keyboard.press('ControlOrMeta+V')

  // Without the `onPaste` handler this reads ['1','','','','',''] — the
  // browser's own paste, truncated by maxLength="1".
  await expect
    .poll(async () =>
      page.locator('[data-code-cell]').evaluateAll((nodes) =>
        nodes.map((node) => (node instanceof HTMLInputElement ? node.value : '')),
      ),
    )
    .toEqual(['1', '2', '3', '4', '5', '6'])

  // And the reader is left at the end of the code, not where they pasted.
  await expect(page.locator('[data-code-cell="5"]')).toBeFocused()
})

test('shakes the shell when it refuses a code, with the handoff’s own animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(CODE_STEP_PATH, { waitUntil: 'networkidle' })
  await expect(page.locator('[data-code-cell]')).toHaveCount(6)

  const observed = await page.evaluate(async () => {
    document.querySelector<HTMLButtonElement>('[data-code-verify]')?.click()
    await Promise.resolve()
    const shell = document.querySelector('[data-sign-in-shell]')
    const style = shell === null ? null : getComputedStyle(shell)
    return {
      said: document.querySelector('[data-code-step-pane] [role="alert"]')?.textContent ?? null,
      shaking: document.querySelector('[data-code-step-pane]')?.getAttribute('data-code-step-shaking') ?? null,
      name: style?.animationName ?? null,
      duration: style?.animationDuration ?? null,
      timing: style?.animationTimingFunction ?? null,
    }
  })

  // The refusal really happened - without this, an assertion about the
  // animation is being made over a page that did nothing at all.
  expect(observed.said).toBe('All six digits, then we can look.')
  expect(observed.shaking).toBe('true')
  // CSS Modules scope the keyframes name, so the computed value carries a hash
  // around it rather than being it.
  expect(observed.name).toContain('omShake')
  expect(observed.duration).toBe('0.42s')
  expect(observed.timing).toBe('ease')
})

test('does not shake at all for a reader who has asked for less motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(CODE_STEP_PATH, { waitUntil: 'networkidle' })
  await expect(page.locator('[data-code-cell]')).toHaveCount(6)

  const observed = await page.evaluate(async () => {
    document.querySelector<HTMLButtonElement>('[data-code-verify]')?.click()
    await Promise.resolve()
    const shell = document.querySelector('[data-sign-in-shell]')
    return {
      said: document.querySelector('[data-code-step-pane] [role="alert"]')?.textContent ?? null,
      shaking: document.querySelector('[data-code-step-pane]')?.getAttribute('data-code-step-shaking') ?? null,
      name: shell === null ? null : getComputedStyle(shell).animationName,
    }
  })

  // The SAME refusal, with the SAME flag raised: the reader still gets told
  // what is wrong, and only the movement is gone. Without both of these the
  // "no animation" assertion would also pass on a screen that never refused.
  expect(observed.said).toBe('All six digits, then we can look.')
  expect(observed.shaking).toBe('true')
  expect(observed.name).toBe('none')
})

test('spreads a whole code written into the first cell, as an OTP autofill does', async ({ page }) => {
  await page.goto(CODE_STEP_PATH, { waitUntil: 'networkidle' })
  await expect(page.locator('[data-code-cell]')).toHaveCount(6)

  // WHAT THIS DOES AND DOES NOT PROVE, because the difference matters. No
  // browser automation API can trigger a real one-time-code suggestion - the
  // browser decides to offer it, from a message this test cannot send. What
  // IS driven here is the pair an autofill produces once the reader accepts
  // it: the value written straight onto the input, and an `input` event. That
  // reaches `onChange` and never raises `paste`, so it is the one door the
  // paste handler does not cover; with `takeDigit`'s multi-digit branch
  // removed it lands one digit and drops five. What is not proven is the
  // browser's own decision to offer the code at all.
  await page.evaluate((code: string) => {
    const cell = document.querySelector('[data-code-cell="0"]')
    // eslint-disable-next-line @typescript-eslint/unbound-method -- capturing the prototype's setter is the point: it is re-invoked below with `.call(cell, ...)`, which is the receiver the rule exists to protect. Writing through it rather than through `cell.value` is what a browser's own autofill does, and what React's value tracker has to see to fire `onChange`.
    const write = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (!(cell instanceof HTMLInputElement) || write === undefined) throw new Error('no first cell')
    cell.focus()
    write.call(cell, code)
    cell.dispatchEvent(new Event('input', { bubbles: true }))
  }, PASTED_CODE)

  await expect
    .poll(async () =>
      page.locator('[data-code-cell]').evaluateAll((nodes) =>
        nodes.map((node) => (node instanceof HTMLInputElement ? node.value : '')),
      ),
    )
    .toEqual(['1', '2', '3', '4', '5', '6'])
})

test('advances through the cells as the reader types the code', async ({ page }) => {
  await page.goto(CODE_STEP_PATH, { waitUntil: 'networkidle' })
  await expect(page.locator('[data-code-cell="0"]')).toBeFocused()

  await page.keyboard.type(PASTED_CODE)

  const typed = await page
    .locator('[data-code-cell]')
    .evaluateAll((nodes) => nodes.map((node) => (node instanceof HTMLInputElement ? node.value : '')))
  expect(typed).toEqual(['1', '2', '3', '4', '5', '6'])
  await expect(page.locator('[data-code-cell="5"]')).toBeFocused()
})

test('draws SCREENS.md §3.2’s own measurements, and rings a filled cell differently', async ({ page }) => {
  await page.goto(CODE_STEP_PATH, { waitUntil: 'networkidle' })
  await expect(page.locator('[data-code-cell]')).toHaveCount(6)

  // Typed into the SECOND cell, so the comparison below is between two cells
  // in the same row at the same moment rather than between two page loads.
  await page.locator('[data-code-cell="1"]').fill('7')

  const measured = await page.evaluate(() => {
    const title = document.querySelector('[data-code-step-pane] h1')
    const row = document.querySelector('[data-code-cell="0"]')?.parentElement
    const empty = document.querySelector('[data-code-cell="0"]')
    const filled = document.querySelector('[data-code-cell="1"]')
    if (title === null || row === null || row === undefined || empty === null || filled === null) return null
    const cell = getComputedStyle(empty)
    const label = [...document.querySelectorAll('[data-code-step-pane] p')].find(
      (paragraph) => paragraph.textContent === 'The code',
    )
    const rule = document.querySelector('[data-code-step-pane] hr')
    if (label === undefined || rule === null) return null
    return {
      titleSize: getComputedStyle(title).fontSize,
      // The gap between the rule and the label it introduces, and the
      // label's own two margins.
      //
      // WHAT THE MARGINS ARE DOING HERE, because it is not what it looks
      // like. The label is a `<p>`, so a paragraph's default `1em 0` puts
      // 9.5px on top of it unless `.labelAboveCells` sets the whole `margin`.
      // MEASURED, that 9.5px currently moves NOTHING: it collapses through
      // the zero-height top edge of the `<form>` the label opens and then
      // with the rule's own 20px `margin-bottom`, so the rendered gap is 20px
      // either way and every box below sits at the same y to the pixel. So
      // `labelMarginTop` is a declaration assertion, not a rendered one, and
      // it is kept for one honest reason: the collapse is doing the work, and
      // the collapse is broken by any of a border on the form, a padding on
      // it, the wrapper going away, or the rule's margin dropping below
      // 9.5px - after which the drift becomes real AND is small enough for a
      // baseline to miss. `ruleToLabelGap` beside it is the rendered
      // assertion, and it is the one that would catch that day.
      ruleToLabelGap: Math.round(label.getBoundingClientRect().top - rule.getBoundingClientRect().bottom),
      labelMarginTop: getComputedStyle(label).marginTop,
      labelMarginBottom: getComputedStyle(label).marginBottom,
      gap: getComputedStyle(row).columnGap,
      cellSize: cell.fontSize,
      cellPadding: `${cell.paddingTop} ${cell.paddingRight} ${cell.paddingBottom} ${cell.paddingLeft}`,
      cellAlign: cell.textAlign,
      emptyRing: cell.boxShadow,
      filledRing: getComputedStyle(filled).boxShadow,
    }
  })

  // Read back off the rendered page rather than off the stylesheet, so a rule
  // that is present but overridden fails here.
  expect(measured).toEqual({
    titleSize: '50px',
    ruleToLabelGap: 20,
    labelMarginTop: '0px',
    labelMarginBottom: '8px',
    gap: '9px',
    cellSize: '25px',
    cellPadding: '13px 0px 13px 0px',
    cellAlign: 'center',
    // "a 1.5px terracotta ring when filled else 1px muted" - `--td-accent` is
    // `#a34434` and `--td-hairline-border-max` is `rgba(120,98,60,.34)`.
    emptyRing: 'rgba(120, 98, 60, 0.34) 0px 0px 0px 1px inset',
    filledRing: 'rgb(163, 68, 52) 0px 0px 0px 1.5px inset',
  })
})

test('names the masked address and the resend’s cooldown, and holds the resend inert', async ({ page }) => {
  await page.goto(CODE_STEP_PATH, { waitUntil: 'networkidle' })

  await expect(page.locator('[data-code-step-address]')).toHaveText('•••')
  await expect(page.locator('[data-code-attempts]')).toHaveText('0 of 3 tried')
  const resend = page.locator('[data-code-resend]')
  await expect(resend).toBeDisabled()
  await expect(resend).toHaveText(/^Send again in \d{1,2}s$/)
})
