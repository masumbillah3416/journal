/**
 * mediaRevalidationRegistration.test.ts — every address SCREENS.md §2.4's bulk
 * writes change is an address they invalidate.
 *
 * ═══ WHY THE JOIN NEEDS A CASE OF ITS OWN ═══
 *
 * `clipAffordanceRegistration.test.ts`'s reason, one screen over and for the
 * same species: `app/(admin)/admin/media/actions.ts` carries a whole-file
 * `c8 ignore` because a Server Action is dispatched under an opaque action id
 * and needs a request context no Vitest project has — and a decision taken
 * behind one is a decision nothing measures. Which paths an action revalidates
 * IS such a decision, and it was wrong: all three bulk writes revalidated
 * `/admin/media` alone, under a comment at `moveMedia` reading "the public
 * diary is rendered per request … so there is nothing else here to invalidate".
 * That reasoned about the diary and missed two cached admin readers.
 *
 * ═══ WHAT READS WHAT, WHICH IS WHERE THE TABLE BELOW COMES FROM ═══
 *
 *   - `readJourneysScreen.ts` selects `{ journey, isCover, sizes }` off `media`
 *     for `/admin/journeys`'s per-journey tally and cover. `moveMedia` rewrites
 *     `journey`, so both the source's and the destination's cells move.
 *   - `readJourneyEditor.ts` selects `{ alt, kind, durationSec, inBook, sizes }`
 *     for the pool, SCOPED BY JOURNEY, and counts `inBook` for the
 *     "{n} of {total} in the book" eyebrow. `addToBook` moves that eyebrow;
 *     `moveMedia` moves pool membership itself, in two editors at once.
 *   - Nothing outside `/admin/media` reads `media.caption` — `PoolItem` says in
 *     its own TSDoc that the column was selected once and drawn by nobody — so
 *     `captionMedia` revalidating one address is correct, and is asserted here
 *     rather than left looking like an omission.
 *
 * `app/(admin)/admin/journeys/[id]/actions.ts` already revalidates exactly
 * those two addresses for exactly this reason (`revalidateEditor`), so this is
 * the repository's own convention rather than a judgement call.
 *
 * ═══ THE EDITOR IS INVALIDATED BY ITS ROUTE PATTERN, NOT BY AN ID ═══
 *
 * `moveMedia` knows the DESTINATION journey and not the sources: the selection
 * is media ids, and which journeys they were filed under is whatever the rows
 * said before the write. Reading them back to name two paths would be a query
 * per write for a cache hint. `revalidatePath('/admin/journeys/[id]', 'page')`
 * is Next.js's own spelling for "every page of this dynamic route", which
 * covers the source and the destination without knowing either.
 *
 * ═══ WHY A FILE READ, AND WHAT IT IS NOT ═══
 *
 * The shape `adminGuardRegistration.test.ts`, `e2e/ciRegistration.test.ts` and
 * `clipAffordanceRegistration.test.ts` already use: the honest subject is "what
 * does this module call", and neither Vitest project can execute a `'use
 * server'` module. Reading the source is reading the wire.
 *
 * IT IS NOT A PROOF THAT NEXT.JS THEN SERVES A FRESH RENDER. That would need
 * the running app, and under Next 16's dynamic `staleTime` of 0 the observable
 * window is small anyway; what this fails on is the edit that drops an address,
 * and on a fourth bulk write landing with no decision recorded about its
 * readers.
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

/** The module that dispatches SCREENS.md §2.4's writes, relative to {@link APP}. */
const MEDIA_ACTIONS = 'app/(admin)/admin/media/actions.ts'

/**
 * Every address each exported action revalidates, by the export's name.
 *
 * THE ADDRESSES ARE SPELLED OUT rather than named by their constants, so a
 * constant repointed at the wrong string fails here too. Every export is
 * listed, including the two that revalidate nothing: a new action added
 * without a row is the case failing, which is the direction that matters.
 */
const REVALIDATED: Readonly<Record<string, readonly string[]>> = {
  // Phase 3's actions, called here and not rewritten. The dropzone asks for
  // the page itself once its batch has finished (`router.refresh()`).
  requestUploadSlots: [],
  finaliseUpload: [],
  addToBook: ['/admin/media', '/admin/journeys/[id]'],
  captionMedia: ['/admin/media'],
  moveMedia: ['/admin/media', '/admin/journeys', '/admin/journeys/[id]'],
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
const actionsSource = (): string => readFileSync(path.join(APP, MEDIA_ACTIONS), 'utf8')

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
    throw new Error(`${MEDIA_ACTIONS} declares no actions in a shape this case can read`)
  }
  return found
}

describe('the media screen’s writes and the caches they invalidate', () => {
  it('invalidates every admin screen whose read its columns change', () => {
    // THE WHOLE FINDING IN ONE ASSERTION. `moveMedia` re-points `media.journey`
    // and `addToBook` writes `media.inBook`; `/admin/journeys` tallies media by
    // journey and `/admin/journeys/[id]` draws the pool and its `inBook`
    // eyebrow off exactly those columns.
    expect(revalidatedAddresses()).toEqual(REVALIDATED)
  })

  it('names the editor by its route pattern, which is what reaches a journey it was not told about', () => {
    // `moveMedia` knows the destination and not the sources. Next.js
    // invalidates every page of a dynamic route when the pattern is passed
    // with the `page` type, and silently does nothing useful without it.
    expect(actionsSource()).toContain("revalidatePath(EDITOR_PATTERN, 'page')")
  })
})
