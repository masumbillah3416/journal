/**
 * trashRevalidationRegistration.test.ts — every address SCREENS.md §2.10's two
 * writes change is an address they invalidate.
 *
 * ═══ WHY THE JOIN NEEDS A CASE OF ITS OWN ═══
 *
 * `settingsRevalidationRegistration.test.ts`'s reason, one screen over:
 * `app/(admin)/admin/trash/actions.ts` carries a whole-file `c8 ignore`
 * because a Server Action needs a request context no Vitest project has, so
 * which paths it revalidates is a decision nothing measures.
 *
 * ═══ WHAT READS WHAT, WHICH IS WHERE THE TABLE BELOW COMES FROM ═══
 *
 * Both writes move a journey ACROSS the line every other admin read draws:
 * `{ deletedAt: { exists: false } }`. So both reach everything that counts a
 * live journey —
 *
 *   - `/admin/trash` itself, which is the inverse of that clause;
 *   - `/admin/journeys`, whose rows and whose five chips are the live set;
 *   - `/admin` (the Overview), whose stat grid counts live journeys, their
 *     pages and their photographs, and whose rail counts the trash.
 *
 * — and both reach the public diary, because `readBookBundle` excludes a
 * soft-deleted journey: putting one back returns its pages to the book and
 * re-opens its gallery, and destroying one removes them for good. Three
 * patterns cover that: `/p/[n]`, `/m/[n]` (two route entries for one address,
 * ADR 0012) and `/gallery/[slug]`.
 *
 * `/admin/settings` IS ON ONE LIST AND NOT THE OTHER, and that is the one
 * asymmetry here. §2.9's "Space used" is the media library's bytes, and
 * `deleteJourneyForGood` is the ONLY write in this phase that makes it go
 * down; `putJourneyBackFromTrash` writes no `media` row at all, so the bar it
 * would invalidate has not moved.
 *
 * ═══ WHY A FILE READ, AND WHAT IT IS NOT ═══
 *
 * The shape the other five registration files use: the honest subject is
 * "what does this module call". It is NOT a proof that Next.js then serves a
 * fresh render; what it fails on is the edit that drops an address.
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

/** The module that dispatches SCREENS.md §2.10's writes, relative to {@link APP}. */
const TRASH_ACTIONS = 'app/(admin)/admin/trash/actions.ts'

/**
 * Every address each exported action revalidates, by the export's name.
 *
 * THE ADDRESSES ARE SPELLED OUT rather than named by their constants, so a
 * constant repointed at the wrong string fails here too.
 */
const REVALIDATED: Readonly<Record<string, readonly string[]>> = {
  putJourneyBackFromTrash: ['/admin/trash', '/admin/journeys', '/admin', '/p/[n]', '/m/[n]', '/gallery/[slug]'],
  deleteJourneyForGood: [
    '/admin/trash',
    '/admin/journeys',
    '/admin',
    '/admin/settings',
    '/p/[n]',
    '/m/[n]',
    '/gallery/[slug]',
  ],
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
const actionsSource = (): string => readFileSync(path.join(APP, TRASH_ACTIONS), 'utf8')

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

  for (const chunk of source.split(EXPORT_BOUNDARY)) {
    const declared = EXPORTED_NAME.exec(chunk)
    if (declared?.[1] === undefined) continue
    const name = declared[1]
    found[name] = [...chunk.matchAll(REVALIDATE_CALL)].map((call) => {
      const argument = (call[1] ?? '').trim()
      return argument.startsWith("'") ? argument.slice(1, -1) : (addresses.get(argument) ?? argument)
    })
  }

  if (Object.keys(found).length === 0) {
    throw new Error(`${TRASH_ACTIONS} declares no actions in a shape this case can read`)
  }
  return found
}

describe('the trash screen’s writes and the caches they invalidate', () => {
  it('invalidates every screen that counts a live journey, and the public diary with them', () => {
    expect(revalidatedAddresses()).toEqual(REVALIDATED)
  })

  it('names every dynamic route by its pattern WITH the page type, at every call and not merely at one', () => {
    // COUNTED RATHER THAN SEARCHED FOR: this module makes SIX such calls
    // across three patterns, so a `toContain` would pass while one lost its
    // type. Next.js silently does nothing useful without it.
    const source = actionsSource()
    const patterns = ['BOOK_PATTERN', 'MOBILE_PATTERN', 'GALLERY_PATTERN'] as const

    expect(
      patterns.map((pattern) => ({
        pattern,
        calls: source.split(`revalidatePath(${pattern}`).length - 1,
        typed: source.split(`revalidatePath(${pattern}, 'page')`).length - 1,
      })),
    ).toEqual(patterns.map((pattern) => ({ pattern, calls: 2, typed: 2 })))
  })

  it('invalidates Space used only when something was actually deleted', () => {
    // THE ASYMMETRY, ASSERTED FROM BOTH SIDES rather than left to be read off
    // the table above. A restore writes no `media` row, so §2.9's bar has not
    // moved; a delete for good is the only write in this phase that moves it.
    const found = revalidatedAddresses()

    expect(found['deleteJourneyForGood']).toContain('/admin/settings')
    expect(found['putJourneyBackFromTrash']).not.toContain('/admin/settings')
  })
})
