/**
 * lighthouseCollects.test.js — every admin screen that has a literal address
 * is collected by `lighthouserc.admin.json`.
 *
 * ═══ THE DEFECT THIS PINS IS THE OPPOSITE OF `lighthouseJudged.test.js`'s ═══
 *
 * That file asks whether every URL a configuration COLLECTS is judged by an
 * assertion. It cannot ask the question that matters more, because it reads
 * only the configuration: **a screen that is not in the list at all.** Phase 4
 * exit criterion 7 is phrased "every collected screen", and a criterion
 * phrased that way is discharged by leaving a screen out — the budget is not
 * red, it is unmeasured, and nothing anywhere goes the colour of a hole.
 *
 * It had happened five times when this file was written. `/admin/media`,
 * `/admin/galleries`, `/admin/settings`, `/admin/trash` and `/admin/account`
 * were all mounted, all reachable, and none of them collected; the first two
 * deliberately (`docs/deviations.md` §73 and §80) and the last three because
 * nobody said. `docs/testing.md` meanwhile said the config collected "the
 * eight URLs", which was true and said nothing about the five it did not.
 *
 * ═══ IT IS AN INVERSION, NOT A LIST (standing orders, species 6) ═══
 *
 * Every earlier version of this idea in this repository was a list of the
 * addresses somebody remembered. This one discovers the addresses the way
 * Next.js does — walking `apps/web/app/` and dropping `(group)` segments — and
 * REFUSES every admin address it finds that the configuration does not
 * collect. The only addresses it excuses are the ones that have no literal
 * address to collect: a segment in brackets is a parameter, and
 * `lighthouserc*.json` holds URLs rather than patterns, so `/admin/reset/[token]`
 * and `/admin/journeys/[id]` cannot be named there at all. That exclusion is a
 * PROPERTY of the address, read off the address, not a name anybody typed.
 *
 * ═══ AND IT RUNS IN BOTH DIRECTIONS ═══
 *
 * A URL in the configuration whose page no longer exists is the same drift
 * wearing the other face: the collector asks for an address, Next answers 404,
 * and `http-status-code` fails a gate for a screen that was deleted on purpose.
 * So the second case reads the configuration's own URLs back against the walk.
 *
 * Depends on: node:fs, node:path, node:url, vitest.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** The repository root, from this file's own location. */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** The Next.js app directory whose tree defines what addresses exist. */
const APP_DIRECTORY = path.join(ROOT, 'apps', 'web', 'app')

/** The configuration that is supposed to hold every admin screen. */
const ADMIN_CONFIG = 'lighthouserc.admin.json'

/**
 * The file names Next.js serves a PAGE from.
 *
 * Pages only: a `route.ts` answers a fetch rather than drawing a screen, and a
 * performance budget on `/admin/sign-out` would be a budget on a redirect.
 */
const PAGE_FILES = new Set(['page.tsx', 'page.ts', 'page.jsx', 'page.js', 'page.mdx'])

/**
 * Whether a directory name contributes nothing to the address it sits in.
 *
 * `(admin)` is a route group: Next.js removes it, so `app/(admin)/admin` is
 * served at `/admin`.
 * @param {string} segment - One directory name.
 * @returns {boolean} `true` when Next.js drops it from the address.
 */
const isRouteGroup = (segment) => segment.startsWith('(') && segment.endsWith(')')

/**
 * Every address `apps/web/app/` draws a page at.
 *
 * @param {string} directory - Where to walk from.
 * @param {string} address - The address that directory is served at so far.
 * @returns {string[]} One entry per page file, as the path Next.js serves it
 *   at — `/admin` for the root one rather than the empty string.
 */
const pageAddresses = (directory, address) => {
  const found = []

  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry)

    if (statSync(full).isDirectory()) {
      found.push(...pageAddresses(full, isRouteGroup(entry) ? address : `${address}/${entry}`))
      continue
    }

    if (PAGE_FILES.has(entry)) found.push(address === '' ? '/' : address)
  }

  return found
}

/**
 * Whether an address carries a parameter, and therefore has no literal URL.
 *
 * @param {string} address - A page address from {@link pageAddresses}.
 * @returns {boolean} `true` for `/admin/reset/[token]` and its kind.
 */
const isParameterised = (address) => address.includes('[')

/** Every admin page address with a literal URL a collector could ask for. */
const addressableAdminScreens = () =>
  pageAddresses(APP_DIRECTORY, '')
    .filter((address) => address === '/admin' || address.startsWith('/admin/'))
    .filter((address) => !isParameterised(address))
    .sort()

/** The paths `lighthouserc.admin.json` collects, as addresses. */
const collectedPaths = () => {
  const parsed = JSON.parse(readFileSync(path.join(ROOT, ADMIN_CONFIG), 'utf8'))
  const urls = parsed?.ci?.collect?.url ?? []
  return urls.map((url) => new URL(url).pathname.replace(/(.)\/$/, '$1')).sort()
}

describe(`${ADMIN_CONFIG} and the admin screens that exist`, () => {
  it('finds admin screens to collect at all, so the two cases below are not vacuous', () => {
    expect(addressableAdminScreens().length).toBeGreaterThan(0)
  })

  it('collects every admin screen whose address has no parameter in it', () => {
    const uncollected = addressableAdminScreens().filter((address) => !collectedPaths().includes(address))

    expect(uncollected).toEqual([])
  })

  it('collects no address that no page is mounted at', () => {
    const screens = addressableAdminScreens()
    const phantom = collectedPaths().filter((address) => !screens.includes(address))

    expect(phantom).toEqual([])
  })
})
