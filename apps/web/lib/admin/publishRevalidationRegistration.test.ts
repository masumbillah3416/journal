/**
 * publishRevalidationRegistration.test.ts — which addresses SCREENS.md §2.8's
 * three writes invalidate, and which they deliberately leave alone.
 *
 * ═══ WHY THE JOIN NEEDS A CASE OF ITS OWN ═══
 *
 * `bookRevalidationRegistration.test.ts`'s reason, one screen over: the actions
 * module carries a whole-file `c8 ignore` because a Server Action is dispatched
 * under an opaque action id and needs a request context no Vitest project has —
 * and a decision taken behind one is a decision nothing measures.
 *
 * ═══ THIS IS THE FIRST SCREEN WHOSE ADDRESSES ARE COMPUTED ═══
 *
 * Every registration test before this one compares a list of CONSTANTS, because
 * every write before this one invalidated a fixed set of admin screens. Design
 * spec §8 asks for something else: "on-demand revalidation of affected paths
 * only", which is one path per page of the journeys that went out and therefore
 * has no constant to read. So the split is:
 *
 *   - WHICH paths is `publishSelection.ts`'s, and
 *     `publishSelection.integration.test.ts` executes it against a real
 *     Postgres, comparing the answer with the book's own page list.
 *   - THAT EVERY ONE OF THEM IS SPENT is this file's, because the loop that
 *     spends them is in a module nothing can execute.
 *
 * Neither half is worth much alone. A loop over an empty list revalidates
 * nothing and passes this file; a correct list nobody loops over passes the
 * integration file. Both are asserted.
 *
 * ═══ AND THE EXPORT THAT REVALIDATES NO DIARY ADDRESS IS PINNED AS HARD ═══
 *
 * `revertOneChange` puts a row back to the version readers are ALREADY looking
 * at, so nothing published changes and no diary path is stale. That is a
 * decision, not an omission, and a later edit that "helpfully" added the loop
 * to it would invalidate a page of the book on every discarded draft. It is
 * asserted by COUNT rather than by membership — standing orders §8, where a
 * `toContain` against a module making two identical calls left a one-sided
 * guard green for a whole task.
 *
 * ═══ WHY A FILE READ, AND WHAT IT IS NOT ═══
 *
 * The shape the four sibling registration files already use: the honest subject
 * is "what does this module call", and no Vitest project can execute a
 * `'use server'` module. Reading the source is reading the wire. IT IS NOT a
 * proof that Next.js then serves a fresh render; what this fails on is the edit
 * that drops an address, the fourth write that lands with no decision recorded,
 * and the loop that stops looping.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One extraction and five
 * comparisons.
 * Depends on: node:fs, node:path, node:url, vitest.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Where the module below is resolved from — `apps/web`. */
const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** The module that dispatches this screen's three writes, relative to {@link APP}. */
const ACTIONS = 'app/(admin)/admin/publish/actions.ts'

/**
 * What the table below writes where an address is COMPUTED rather than named.
 *
 * `revalidatePath(path)` inside a loop cannot be resolved to a string by
 * reading the source, and pretending otherwise would be the "count that cannot
 * see what it counts" these standing orders were written about. It is marked as
 * what it is, and the loop that produces it is asserted separately.
 */
const COMPUTED = '(every path the write answered)'

/**
 * The exact loop that spends the answered paths.
 *
 * SPELLED OUT RATHER THAN MATCHED LOOSELY. A loop that iterated something else,
 * or called something else, is the defect this exists to catch — and a regex
 * general enough to allow either would allow both.
 */
const SPENDS_THE_PATHS = 'for (const path of paths) revalidatePath(path)'

/**
 * How each write's answered paths reach the loop that spends them.
 *
 * ═══ THE SEAM BETWEEN THE TWO HALVES, WHICH NEITHER HALF READS ═══
 *
 * `publishSelection.integration.test.ts` measures WHICH paths come back, and
 * {@link SPENDS_THE_PATHS} counts the loop that spends them. Any expression
 * applied BETWEEN them is invisible to both: a reviewer appended
 * `.slice(0, 1)` to the call and this file still reported five passing cases
 * while the publish revalidated one path of four and left the rest stale
 * (review F3).
 *
 * So the assignment is spelled out, in the same idiom the loop is. A
 * transformation of the answer has to change one of these strings.
 */
const ANSWERS_THE_PATHS = ['const paths = await publishRows(', 'const paths = await restoreOne('] as const

/**
 * Every address each exported action revalidates, by the export's name.
 *
 * THE ADDRESSES ARE SPELLED OUT rather than named by their constants, so a
 * constant repointed at the wrong string fails here too. Every export of the
 * module is listed, including the one that reaches no diary address: a fourth
 * write added without a row is the case failing, which is the direction that
 * matters.
 *
 * `/admin/sign-in/done` is on all three because `SignedInStep.tsx` prints the
 * count of what is waiting (`docs/deviations.md` §38), and all three writes
 * move it — a publish and a revert obviously, and a restore because
 * `restoreVersion` makes the restored version the latest one, which takes a
 * pending draft off the list.
 */
const REVALIDATED: Readonly<Record<string, readonly string[]>> = {
  publishChanges: [COMPUTED, '/admin/publish', '/admin/journeys', '/admin/sign-in/done'],
  revertOneChange: ['/admin/publish', '/admin/journeys', '/admin/sign-in/done'],
  restoreOneEdition: [COMPUTED, '/admin/publish', '/admin/journeys', '/admin/sign-in/done'],
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
const source = (): string => readFileSync(path.join(APP, ACTIONS), 'utf8')

/**
 * The addresses each exported action revalidates, with constants resolved and
 * the loop variable marked as {@link COMPUTED}.
 *
 * @returns One entry per export.
 * @throws {Error} When the module declares no exports in a shape this case can
 *   read — which is the refactor being reported, not a test defect.
 */
const revalidatedAddresses = (): Readonly<Record<string, readonly string[]>> => {
  const text = source()
  const addresses = new Map([...text.matchAll(PATH_CONSTANT)].map((match) => [match[1] ?? '', match[2] ?? '']))
  const found: Record<string, readonly string[]> = {}

  // SPLIT RATHER THAN MATCHED, because "this export's body" is "everything up
  // to the next export" and JavaScript's regular expressions have no
  // end-of-input anchor that a lazy quantifier can stop at.
  for (const chunk of text.split(EXPORT_BOUNDARY)) {
    const declared = EXPORTED_NAME.exec(chunk)
    if (declared?.[1] === undefined) continue
    found[declared[1]] = [...chunk.matchAll(REVALIDATE_CALL)].map((call) => {
      const argument = (call[1] ?? '').trim()
      if (argument === 'path') return COMPUTED
      // A LITERAL IS TAKEN AS ITSELF and a bare name is resolved, so the table
      // above compares addresses however this module chooses to spell them.
      return argument.startsWith("'") ? argument.slice(1, -1) : (addresses.get(argument) ?? argument)
    })
  }

  if (Object.keys(found).length === 0) {
    throw new Error('the publish actions module declares no action in a shape this case can read')
  }
  return found
}

describe('the publish screen’s writes and the caches they invalidate', () => {
  it('invalidates every screen whose read its writes change, and no screen it leaves alone', () => {
    // THE WHOLE FINDING IN ONE ASSERTION. Two of the three answer a computed
    // set of diary addresses and one deliberately answers none; all three move
    // the count three admin screens print.
    expect(revalidatedAddresses()).toEqual(REVALIDATED)
  })

  it('spends every path the write answered, in exactly the two writes that answer any', () => {
    // COUNTED RATHER THAN SEARCHED FOR, which is the difference standing
    // orders §8 was written about: a `toContain` passes while one of two
    // writes carries the loop and the other does not. `publishChanges` and
    // `restoreOneEdition` change what is published; `revertOneChange` does not.
    const loops = source().split(SPENDS_THE_PATHS).length - 1

    expect({ loops, any: loops > 0 }).toEqual({ loops: 2, any: true })
  })

  it('hands each loop the write’s own answer, with nothing applied in between', () => {
    // BOTH SPELLINGS, COUNTED. The loop above proves the paths are spent; this
    // proves they are the paths the write answered. `.slice()`, `.filter()`,
    // a `??` or a second variable between the call and the loop all move one
    // of these counts off 1 — which is the only direction the split between
    // "which paths" and "spending them" does not otherwise cover.
    const text = source()
    const assignments = ANSWERS_THE_PATHS.map((spelling) => text.split(spelling).length - 1)

    expect(assignments).toEqual([1, 1])
  })

  it('leaves the revert with no diary address at all, because a discarded draft was never served', () => {
    // ASSERTED RATHER THAN OMITTED. A revert restores the version readers are
    // already looking at, so the live row does not move and nothing served is
    // stale — `publishSelection.integration.test.ts` measures that through
    // `readBookBundle`. A later edit that added the loop here would invalidate
    // a page of the book on every discarded draft.
    const revert = revalidatedAddresses()['revertOneChange'] ?? []

    expect(revert.filter((address) => address === COMPUTED)).toEqual([])
  })

  it('names no diary address as a literal, because every one of them is computed', () => {
    // A `revalidatePath('/p/2')` in this file would be an address somebody
    // wrote down, which is the opposite of "affected paths only": the set
    // depends on which journeys went out and on where the book puts their
    // pages. `affectedPaths` answers it, and nothing here second-guesses it.
    const text = source()

    expect(["'/p/", "'/m/", "'/gallery/"].filter((prefix) => text.includes(prefix))).toEqual([])
  })

  it('declares exactly the three writes §2.8 draws, so a fourth arrives with a decision', () => {
    expect(Object.keys(revalidatedAddresses())).toHaveLength(3)
  })
})
