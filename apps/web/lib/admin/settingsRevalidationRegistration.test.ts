/**
 * settingsRevalidationRegistration.test.ts — every address SCREENS.md §2.9's
 * three writes change is an address they invalidate, and this is the first
 * screen in the phase whose writes reach the PUBLIC diary.
 *
 * ═══ WHY THE JOIN NEEDS A CASE OF ITS OWN ═══
 *
 * `galleriesRevalidationRegistration.test.ts`'s reason, unchanged:
 * `app/(admin)/admin/settings/actions.ts` carries a whole-file `c8 ignore`
 * because a Server Action is dispatched under an opaque action id and needs a
 * request context no Vitest project has — and a decision taken behind one is a
 * decision nothing measures. Which paths an action revalidates IS such a
 * decision, and §96 records the round where it was got wrong.
 *
 * ═══ WHAT READS WHAT, WHICH IS WHERE THE TABLE BELOW COMES FROM ═══
 *
 *   - `saveSite` writes `name`, `domain`, `description` and `replyTo`. The
 *     first is on EVERY admin screen: `AdminShell` prints `site.name` in the
 *     rail's masthead, and the route group's layout is not a cache key of its
 *     own — hence `revalidatePath('/admin', 'layout')`, which is Next.js's own
 *     spelling for "this segment's layout and everything under it". The other
 *     three are read by nothing else in this repository today: `domain` and
 *     `description` have no reader at all, and `about.replyTo` is a DIFFERENT
 *     column from `site.replyTo` (`apps/web/globals/about.ts`), which is why
 *     the public About page is deliberately absent here.
 *   - `setReaderSetting` can write any of the five, and one action writes all
 *     of them, so it invalidates every address the five reach rather than
 *     reading the column back to decide. `indexGalleries` is read by
 *     `app/robots.ts` and by the gallery route's `generateMetadata`;
 *     `passwordProtect` is read by all four public entries; `allowDownloads`,
 *     `allowShare` and `touchPageTurn` are read by the diary's own pages. A
 *     cache hint that had to ask which setting changed would be a second place
 *     the mapping lives.
 *   - `takeBookOffline` writes the same column the fourth toggle writes
 *     (`docs/deviations.md` §102), so it names the same public addresses. The
 *     two lists are identical ON PURPOSE: a divergence would be a second
 *     decision about which addresses a site setting reaches.
 *
 * `/robots.txt` IS IN BOTH, and it does not read `passwordProtect`. That is
 * the one deliberate over-invalidation here, and it is cheap: the route is
 * `force-dynamic`, so the call drops nothing today and costs nothing tomorrow,
 * while a `takeBookOffline` that omitted it would be the only write on this
 * screen whose list a reader has to check against the columns.
 *
 * ═══ WHY A FILE READ, AND WHAT IT IS NOT ═══
 *
 * The shape `adminGuardRegistration.test.ts` and the other four registration
 * files already use: the honest subject is "what does this module call", and
 * neither Vitest project can execute a `'use server'` module. Reading the
 * source is reading the wire. It is NOT a proof that Next.js then serves a
 * fresh render; what it fails on is the edit that drops an address, and on a
 * fourth write landing with no decision recorded about its readers.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One extraction and three
 * comparisons.
 * Depends on: node:fs, node:path, node:url, vitest.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Where the module below is resolved from — `apps/web`. */
const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** The module that dispatches SCREENS.md §2.9's writes, relative to {@link APP}. */
const SETTINGS_ACTIONS = 'app/(admin)/admin/settings/actions.ts'

/**
 * Every address each exported action revalidates, by the export's name.
 *
 * THE ADDRESSES ARE SPELLED OUT rather than named by their constants, so a
 * constant repointed at the wrong string fails here too. Every export is
 * listed, including the one that reaches two addresses: a fourth action added
 * without a row is the case failing, which is the direction that matters.
 */
const REVALIDATED: Readonly<Record<string, readonly string[]>> = {
  saveSite: ['/admin/settings', '/admin'],
  setReaderSetting: ['/admin/settings', '/robots.txt', '/gallery/[slug]', '/p/[n]', '/m/[n]'],
  takeBookOffline: ['/admin/settings', '/robots.txt', '/gallery/[slug]', '/p/[n]', '/m/[n]'],
}

/** A `const NAME = '…'` binding at the top of the actions module. */
const PATH_CONSTANT = /^const (\w+) = '([^']*)'$/gmu

/** Where one exported binding begins, which is where the one before it ends. */
const EXPORT_BOUNDARY = /^export const /mu

/** The name a chunk of the module declares, once split at a boundary. */
const EXPORTED_NAME = /^(\w+) = guardedAction\(/u

/** The first argument of a `revalidatePath` call. */
const REVALIDATE_CALL = /revalidatePath\(\s*([^,)]+)/gu

/**
 * The actions module's own source.
 * @returns The file, as written.
 */
const actionsSource = (): string => readFileSync(path.join(APP, SETTINGS_ACTIONS), 'utf8')

/**
 * The addresses each exported action revalidates, with constants resolved.
 *
 * @returns One entry per export, in the order the module declares them.
 * @throws {Error} When the module declares no exports in a shape this case can
 *   read — which is the refactor being reported, not a test defect.
 */
const revalidatedAddresses = (): Readonly<Record<string, readonly string[]>> => {
  const source = actionsSource()
  const addresses = new Map([...source.matchAll(PATH_CONSTANT)].map((found) => [found[1] ?? '', found[2] ?? '']))
  const found: Record<string, readonly string[]> = {}

  // SPLIT RATHER THAN MATCHED, because "this export's body" is "everything up
  // to the next export" and JavaScript's regular expressions have no
  // end-of-input anchor that a lazy quantifier can stop at.
  for (const chunk of source.split(EXPORT_BOUNDARY)) {
    const declared = EXPORTED_NAME.exec(chunk)
    if (declared?.[1] === undefined) continue
    const name = declared[1]
    found[name] = [...chunk.matchAll(REVALIDATE_CALL)].map((call) => {
      const argument = (call[1] ?? '').trim()
      // A LITERAL IS TAKEN AS ITSELF and a bare name is resolved, so the table
      // above compares addresses however this module chooses to spell them.
      return argument.startsWith("'") ? argument.slice(1, -1) : (addresses.get(argument) ?? argument)
    })
  }

  if (Object.keys(found).length === 0) {
    throw new Error(`${SETTINGS_ACTIONS} declares no actions in a shape this case can read`)
  }
  return found
}

/**
 * How many times one pattern is passed with a given second argument.
 * @param constant - The constant naming the pattern.
 * @param type - Next.js's own second argument.
 * @returns The calls in total, and those carrying the type.
 */
const typedCalls = (constant: string, type: string): { readonly calls: number; readonly typed: number } => {
  const source = actionsSource()
  return {
    calls: source.split(`revalidatePath(${constant}`).length - 1,
    typed: source.split(`revalidatePath(${constant}, '${type}')`).length - 1,
  }
}

describe('the settings screen’s writes and the caches they invalidate', () => {
  it('invalidates every address whose read its columns change, and no address it leaves alone', () => {
    // THE WHOLE DECISION IN ONE ASSERTION. `saveSite` reaches the admin's own
    // layout because the rail prints the site's name; the two settings writes
    // reach the four public addresses the five columns are read at.
    expect(revalidatedAddresses()).toEqual(REVALIDATED)
  })

  it('names every dynamic route by its pattern WITH the page type, at every call and not merely at one', () => {
    // Next.js invalidates every page of a dynamic route when the pattern is
    // passed with the `page` type, and silently does nothing useful without
    // it. COUNTED RATHER THAN SEARCHED FOR, and that is the whole difference:
    // this module makes SIX such calls across three patterns, so a `toContain`
    // would pass while one of them lost its type. The `any` half is the
    // sentinel — a refactor that renamed a constant would otherwise make
    // `0 === 0` true.
    const patterns = ['GALLERY_PATTERN', 'BOOK_PATTERN', 'MOBILE_PATTERN'] as const

    expect(
      patterns.map((pattern) => ({ pattern, ...typedCalls(pattern, 'page') })),
      'each of these patterns must be passed with the page type at every call',
    ).toEqual(patterns.map((pattern) => ({ pattern, calls: 2, typed: 2 })))
  })

  it('names the admin layout with the layout type, because the masthead is not on this screen alone', () => {
    // `revalidatePath('/admin')` alone invalidates the Overview PAGE and
    // nothing else; the rail is a layout, and the site name it prints is what
    // `saveSite` changes on every screen.
    expect(actionsSource()).toContain("revalidatePath('/admin', 'layout')")
  })

  it('leaves the public About page alone, because that reply-to is a different column', () => {
    // ASSERTED RATHER THAN OMITTED. `site.replyTo` and `about.replyTo` are two
    // columns on two globals, and it is the second that the diary's About page
    // prints (`apps/web/globals/about.ts`). A future task that made the About
    // page read the site's has to change this line, which is the point of it.
    expect(actionsSource()).not.toContain("revalidatePath('/about')")
  })
})
