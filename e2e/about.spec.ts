/**
 * about.spec.ts — the About page's browser-only guarantees (SCREENS.md §1.6).
 *
 * What the component DECIDES — which blocks it omits when the `about` global
 * has been cleared, how many kit lines and paragraphs it prints, whether the
 * decorations are drawn — is covered without a browser in
 * `apps/web/components/pages/About.test.tsx`, and its appearance by the
 * baselines in `e2e/visual.spec.ts`. What only a laid-out page can answer is
 * here.
 *
 * THE PORTRAIT'S FOCAL POINT IS THE CASE THAT MATTERS. It is the one
 * photograph in the diary whose focal point comes from the MEDIA ITEM rather
 * than from a `pages` slot — the `about` global holds a bare `upload` with no
 * slot to override it with (DATA_MODEL.md: "`media.focalPoint` is the
 * default; the slot overrides it") — so it travels a different path through
 * `readBookBundle` than the other ninety, and a wiring that held for slots
 * alone would leave this one silently centred. The method is
 * `e2e/notes.spec.ts`'s: assert the fit is `cover`, assert the computed
 * position, then screenshot the element at its focal point and again forced
 * back to the centre, and require the two buffers to DIFFER.
 *
 * THE COPY IS RETYPED HERE, not imported from `apps/web/scripts/seed-data.ts`
 * — the same choice `e2e/pages.spec.ts` makes for the cover. SCREENS.md's
 * copy is final (CLAUDE.md §9, Pass 3), so a spec that read the seed's own
 * constant would ratify a paraphrase instead of failing on it: two
 * independent transcriptions of the same final copy is the point.
 *
 * The selectors are scoped to leaf 32 for the reason `e2e/notes.spec.ts`'s
 * header sets out: `Book.tsx` renders all thirty-three leaves at once. The
 * About page is the only one of its kind in the book, so the scope is
 * belt-and-braces here rather than strictly necessary — but an unscoped
 * selector on this page would quietly start matching a second one the day the
 * book grows a second About.
 *
 * Depends on: @playwright/test, the running app from playwright.config.ts's
 * `webServer`, and the seeded diary (`npm run db:seed`) — the About page is
 * the thirty-third and last.
 */
import { expect, test, type Page } from '@playwright/test'
import { drawsMobileReadingMode } from './support/surface'

// SCREENS.md §1.10 replaces the book below 860px - "No book, no flip, no
// scaling" - so this file's subject does not exist at the `mobile` project.
// The mobile reading mode has its own suite in `e2e/mobile.spec.ts`; see
// `e2e/support/surface.ts` for why this is a skip rather than a rewrite.
test.skip(({ viewport }) => drawsMobileReadingMode(viewport), 'the book is not drawn below 860px')

/** The About page: the last of the seeded book's thirty-three. */
const ABOUT_PAGE = 33

/** The About section on its own leaf. See this file's header. */
const ABOUT = `[data-leaf="${String(ABOUT_PAGE - 1)}"] [data-page="about"]`

/** The focal point `apps/web/scripts/seed-data.ts` writes onto the portrait's media item. */
const PORTRAIT_FOCAL = { x: 34, y: 22 } as const

/** The seeded `about` global's copy, asserted verbatim — this copy is final. */
const SEEDED = {
  portraitCaption: 'Somewhere with bad coffee and a good window',
  paragraphs: [
    'This is a paper habit that ended up on a screen. I keep one page of notes per journey, then paste in whatever frames survive the edit. Everything else goes into the gallery behind each entry — sometimes a hundred photographs, most of them of doorways.',
    'Nothing here is a recommendation. The notes are written the same evening, badly, and left that way on purpose. If a page looks crooked, that is the tape.',
  ],
  kit: ['35mm rangefinder, one lens', 'Pocket notebook, blue ink', 'Roll of washi tape, always'],
  replyTo: 'hello@wanderings.travel',
} as const

/**
 * Opens the About page and waits for it.
 * @param page - The Playwright page.
 */
const openAbout = async (page: Page): Promise<void> => {
  await page.goto(`/p/${String(ABOUT_PAGE)}`)
  await expect(page.locator(ABOUT)).toBeVisible()
}

test.describe('About — SCREENS.md §1.6', () => {
  test.beforeEach(async ({ page }) => {
    await openAbout(page)
  })

  test('holds the page at its authored padding, gap and two columns', async ({ page }) => {
    const box = await page.evaluate((selector) => {
      const node = document.querySelector(selector)
      if (node === null) return null
      const style = getComputedStyle(node)
      const [left, right] = style.gridTemplateColumns.split(' ').map(Number.parseFloat)
      return { padding: style.padding, gap: style.columnGap, ratio: (left ?? 0) / (right ?? 1) }
    }, ABOUT)

    // "grid-template-columns: .78fr 1.22fr, gap 44px, padding 36px 48px 32px 54px."
    expect(box?.padding).toBe('36px 48px 32px 54px')
    expect(box?.gap).toBe('44px')
    expect(box?.ratio).toBeCloseTo(0.78 / 1.22, 2)
  })

  test('tilts the portrait mount and tapes its washi strip at the authored offsets', async ({ page }) => {
    const mount = await page.evaluate((selector) => {
      const node = document.querySelector<HTMLElement>(`${selector} [data-mount="portrait"]`)
      const washi = node?.querySelector<HTMLElement>('[data-decoration="washi"]')
      if (node === null || washi === null || washi === undefined) return null
      const readRotation = (element: HTMLElement): number => {
        const matrix = new DOMMatrix(getComputedStyle(element).transform)
        return Number(((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI).toFixed(3))
      }
      const washiStyle = getComputedStyle(washi)
      const caption = node.querySelector('figcaption')
      return {
        mountRotationDeg: readRotation(node),
        washiTop: washiStyle.top,
        washiLeft: washiStyle.left,
        washiRotationDeg: readRotation(washi),
        captionSize: caption === null ? 'no caption' : getComputedStyle(caption).fontSize,
      }
    }, ABOUT)

    // "portrait mount rotate(-1.6deg) with washi at top: -15px; left: -18px
    //  rotate(-9deg), caption 25px".
    await expect(page.locator(`${ABOUT} [data-mount="portrait"] figcaption`)).toHaveText(SEEDED.portraitCaption)
    expect(mount).toEqual({
      mountRotationDeg: -1.6,
      washiTop: '-15px',
      washiLeft: '-18px',
      washiRotationDeg: -9,
      captionSize: '25px',
    })
  })

  test('prints the kit list under its own eyebrow, verbatim from the about global', async ({ page }) => {
    const kit = page.locator(`${ABOUT} [data-kit] li`)

    await expect(page.locator(ABOUT)).toContainText('Kit')
    await expect(kit).toHaveCount(SEEDED.kit.length)
    // "three Garamond 17px lines".
    expect(await kit.allInnerTexts()).toEqual([...SEEDED.kit])
    await expect(kit.first()).toHaveCSS('font-size', '17px')
  })

  test('prints the colophon eyebrow, the heading and the 56px rule at their authored sizes', async ({ page }) => {
    const column = await page.evaluate((selector) => {
      const heading = document.querySelector<HTMLElement>(`${selector} h1`)
      const rule = document.querySelector<HTMLElement>(`${selector} [data-about-rule]`)
      if (heading === null || rule === null) return null
      const headingStyle = getComputedStyle(heading)
      const ruleStyle = getComputedStyle(rule)
      return {
        headingText: heading.textContent,
        headingSize: headingStyle.fontSize,
        headingLineHeight: headingStyle.lineHeight,
        ruleWidth: ruleStyle.width,
        ruleHeight: ruleStyle.height,
      }
    }, ABOUT)

    // '"Colophon" eyebrow, "About" (Caveat 70px / .94), 56x1.5px rule'.
    await expect(page.locator(ABOUT)).toContainText('Colophon')
    expect(column).toEqual({
      headingText: 'About',
      headingSize: '70px',
      // 70 x .94 = 65.8, which Chromium reports to one decimal place.
      headingLineHeight: '65.8px',
      ruleWidth: '56px',
      ruleHeight: '1.5px',
    })
  })

  test('prints both biography paragraphs verbatim, at their authored size and leading', async ({ page }) => {
    const paragraphs = page.locator(`${ABOUT} [data-about-paragraph]`)

    await expect(paragraphs).toHaveCount(SEEDED.paragraphs.length)
    expect(await paragraphs.allInnerTexts()).toEqual([...SEEDED.paragraphs])
    // "two Garamond 19px / 1.64 paragraphs" — 19 x 1.64 = 31.16.
    await expect(paragraphs.first()).toHaveCSS('font-size', '19px')
    await expect(paragraphs.first()).toHaveCSS('line-height', '31.16px')
  })

  test('prints the reply-to address under its own eyebrow, in the accent', async ({ page }) => {
    const address = page.locator(`${ABOUT} [data-reply-to]`)

    // '"Write to me" eyebrow with the address in Caveat 32px #a34434'.
    await expect(page.locator(ABOUT)).toContainText('Write to me')
    await expect(address).toHaveText(SEEDED.replyTo)
    await expect(address).toHaveCSS('font-size', '32px')
    await expect(address).toHaveCSS('color', 'rgb(163, 68, 52)')
  })

  test('draws three mini stamps at their authored size and angles', async ({ page }) => {
    const stamps = await page.evaluate((selector) => {
      const faces = [...document.querySelectorAll<HTMLElement>(`${selector} [data-stamp-face]`)]
      return faces.map((face) => {
        const wrap = face.parentElement
        const matrix = new DOMMatrix(wrap === null ? 'none' : getComputedStyle(wrap).transform)
        return {
          width: face.offsetWidth,
          height: face.offsetHeight,
          rotationDeg: Math.round((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI),
        }
      })
    }, ABOUT)

    // "three mini stamps (56x68px faces, rotations -6deg / +4deg / -2deg)".
    // Whole degrees are enough here: the three are three degrees apart at the
    // closest, unlike the frames pages' seven angles.
    expect(stamps).toEqual([
      { width: 56, height: 68, rotationDeg: -6 },
      { width: 56, height: 68, rotationDeg: 4 },
      { width: 56, height: 68, rotationDeg: -2 },
    ])
  })

  test('crops the portrait at the media item’s focal point, not at the centre', async ({ page }) => {
    const portrait = page.locator(`${ABOUT} [data-mount="portrait"] img`)
    await portrait.evaluate(async (node) => {
      if (node instanceof HTMLImageElement) await node.decode()
    })

    const applied = await portrait.evaluate((node) => {
      const style = getComputedStyle(node)
      return { objectFit: style.objectFit, objectPosition: style.objectPosition }
    })

    // `object-position` only means anything while the image is being cropped.
    expect(applied.objectFit).toBe('cover')
    expect(applied.objectPosition).toBe(`${String(PORTRAIT_FOCAL.x)}% ${String(PORTRAIT_FOCAL.y)}%`)

    const atFocalPoint = await portrait.screenshot()
    await portrait.evaluate((node) => {
      if (node instanceof HTMLElement) node.style.objectPosition = '50% 50%'
    })
    const atCentre = await portrait.screenshot()

    // The proof: the same element, the same box, the same photograph, and
    // different pixels.
    expect(atFocalPoint.equals(atCentre)).toBe(false)
  })
})
