/**
 * galleriesRevalidationRegistration.test.ts — every address SCREENS.md §2.5's
 * five writes change is an address they invalidate.
 *
 * ═══ WHY THE JOIN NEEDS A CASE OF ITS OWN ═══
 *
 * `mediaRevalidationRegistration.test.ts`'s reason, one screen over and for the
 * same species: `app/(admin)/admin/galleries/actions.ts` carries a whole-file
 * `c8 ignore` because a Server Action is dispatched under an opaque action id
 * and needs a request context no Vitest project has — and a decision taken
 * behind one is a decision nothing measures. Which paths an action revalidates
 * IS such a decision, and one screen earlier it was wrong: §2.4's three bulk
 * writes revalidated `/admin/media` alone, under a comment reasoning about the
 * public diary and missing two cached admin readers.
 *
 * ═══ WHAT READS WHAT, WHICH IS WHERE THE TABLE BELOW COMES FROM ═══
 *
 *   - `readMediaScreen.ts` reads `media` SORTED BY `order` and selects
 *     `{ filename, alt, kind, durationSec, inBook, sizes }`. So an arrangement
 *     changes the order its grid draws, a saved alt changes what its tiles
 *     say, and "Also place in the book" changes the "In book" chip and the
 *     filter behind it. It does NOT select `caption`, which is why the two
 *     caption writes are not there.
 *   - `readJourneyEditor.ts` reads the pool SORTED BY `order`, uses `alt` on
 *     each tile and counts `inBook` for the "{n} of {total} in the book"
 *     eyebrow — the same three writes, one screen along.
 *   - `readJourneysScreen.ts` selects `{ journey, isCover, sizes }` off `media`
 *     and counts rows per journey. NOTHING here writes any of those: §2.5
 *     arranges a gallery and never re-points `media.journey` (that is §2.4's
 *     Move), and "Use as gallery cover" is a MOVE to the front rather than a
 *     write to `media.isCover` — so `/admin/journeys` is deliberately absent,
 *     and this file is where that is recorded rather than left to be guessed.
 *   - Nothing outside this screen reads `media.caption` or `media.posterAt`:
 *     `PoolItem` says in its own TSDoc that `caption` was selected once and
 *     drawn by nobody, and §2.5 is `posterAt`'s first reader as well as its
 *     first writer. So those two writes revalidating one address each is
 *     correct, and is asserted here rather than left looking like an omission.
 *
 * THE PUBLIC DIARY NEEDS NOTHING. `/gallery/<slug>` is rendered per request
 * from `readGalleryBundle` and carries no route cache — which is what §2.4's
 * `moveMedia` comment said, correctly, before it concluded too much from it.
 *
 * ═══ THE EDITOR IS INVALIDATED BY ITS ROUTE PATTERN, NOT BY AN ID ═══
 *
 * `setFrameText` and `setFrameFlags` are handed a media id and no journey, so
 * naming the affected editor would mean reading the row back for a cache hint.
 * `revalidatePath('/admin/journeys/[id]', 'page')` is Next.js's own spelling
 * for "every page of this dynamic route". `setFrameOrder` DOES know its
 * journey, and still uses the pattern: two spellings of one hint in one file
 * is a second thing to keep right for no gain.
 *
 * ═══ WHY A FILE READ, AND WHAT IT IS NOT ═══
 *
 * The shape `adminGuardRegistration.test.ts`, `e2e/ciRegistration.test.ts`,
 * `clipAffordanceRegistration.test.ts` and `mediaRevalidationRegistration.test.ts`
 * already use: the honest subject is "what does this module call", and neither
 * Vitest project can execute a `'use server'` module. Reading the source is
 * reading the wire.
 *
 * IT IS NOT A PROOF THAT NEXT.JS THEN SERVES A FRESH RENDER. That would need
 * the running app; what this fails on is the edit that drops an address, and on
 * a sixth write landing with no decision recorded about its readers.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One extraction and two
 * comparisons.
 * Depends on: node:fs, node:path, node:url, vitest.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Where the module below is resolved from — `apps/web`. */
const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** The module that dispatches SCREENS.md §2.5's writes, relative to {@link APP}. */
const GALLERIES_ACTIONS = 'app/(admin)/admin/galleries/actions.ts'

/**
 * Every address each exported action revalidates, by the export's name.
 *
 * THE ADDRESSES ARE SPELLED OUT rather than named by their constants, so a
 * constant repointed at the wrong string fails here too. Every export is
 * listed, including the two that reach one address only: a new action added
 * without a row is the case failing, which is the direction that matters.
 */
const REVALIDATED: Readonly<Record<string, readonly string[]>> = {
  setFrameOrder: ['/admin/galleries', '/admin/media', '/admin/journeys/[id]'],
  setFrameText: ['/admin/galleries', '/admin/media', '/admin/journeys/[id]'],
  setFrameFlags: ['/admin/galleries', '/admin/media', '/admin/journeys/[id]'],
  setPosterAt: ['/admin/galleries'],
  applyBulkCaptions: ['/admin/galleries'],
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
 *
 * @returns The file, as written.
 */
const actionsSource = (): string => readFileSync(path.join(APP, GALLERIES_ACTIONS), 'utf8')

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
    throw new Error(`${GALLERIES_ACTIONS} declares no actions in a shape this case can read`)
  }
  return found
}

describe('the galleries screen’s writes and the caches they invalidate', () => {
  it('invalidates every admin screen whose read its columns change, and no screen it leaves alone', () => {
    // THE WHOLE FINDING IN ONE ASSERTION. `media.order` is the sort BOTH other
    // media readers use, `alt` is on both their tiles and `inBook` is §2.4's
    // chip and the editor's eyebrow — while `caption` and `posterAt` are drawn
    // by this screen and by nothing else in the admin.
    expect(revalidatedAddresses()).toEqual(REVALIDATED)
  })

  it('names the editor by its route pattern with the page type, at EVERY call and not merely at one', () => {
    // Two of these writes are handed a media id and no journey. Next.js
    // invalidates every page of a dynamic route when the pattern is passed
    // with the `page` type, and silently does nothing useful without it.
    //
    // COUNTED RATHER THAN SEARCHED FOR, and that is the whole difference: a
    // `toContain` passes while two of three calls carry the type and the third
    // does not — measured, by dropping the type from one call and watching a
    // `toContain` stay green. The second half of the pair is the sentinel: a
    // refactor that renamed the constant would otherwise make `0 === 0` true.
    const source = actionsSource()
    const calls = source.split('revalidatePath(EDITOR_PATTERN').length - 1
    const typed = source.split("revalidatePath(EDITOR_PATTERN, 'page')").length - 1

    expect({ calls, typed, any: calls > 0 }).toEqual({ calls: typed, typed, any: true })
  })

  it('leaves the journeys list alone, because nothing here writes a column it reads', () => {
    // ASSERTED RATHER THAN OMITTED. `/admin/journeys` tallies `media` by
    // journey and draws its 44px square from `media.isCover`; §2.5 writes
    // neither, because "Use as gallery cover" is a move to the front rather
    // than a flag. A future task that DOES write `isCover` here has to change
    // this line, which is the point of it.
    expect(actionsSource()).not.toContain("revalidatePath('/admin/journeys')")
  })
})
