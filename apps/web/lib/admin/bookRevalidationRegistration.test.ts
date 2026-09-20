/**
 * bookRevalidationRegistration.test.ts — every address SCREENS.md §2.6's and
 * §2.7's four writes change is an address they invalidate, and every address
 * they leave alone is one this file says they leave alone.
 *
 * ═══ WHY THE JOIN NEEDS A CASE OF ITS OWN ═══
 *
 * `galleriesRevalidationRegistration.test.ts`'s reason, one screen over: both
 * action modules carry a whole-file `c8 ignore` because a Server Action is
 * dispatched under an opaque action id and needs a request context no Vitest
 * project has — and a decision taken behind one is a decision nothing measures.
 * Which paths an action revalidates IS such a decision, and it has been wrong
 * twice in this phase already.
 *
 * ═══ THESE FOUR WRITES ARE THE FIRST TO TOUCH SOMETHING OUTSIDE THE ADMIN ═══
 *
 * Every write before this task changed a `journeys`, `pages` or `media` row.
 * These change two GLOBALS, and the globals are read by the public diary and by
 * the sign-in screen as well as by the admin. So the table below is not the
 * usual "which admin screens draw this column" — it is that question asked
 * three times:
 *
 *   - `readBookScreen.ts` reads eight columns of `book` and the journeys, so
 *     everything both screens write reaches it.
 *   - `readCoverScreen.ts` reads `{ title, subtitle, owner, yearsShown,
 *     coverCloth }` of `book` and four fields of `about`. §2.6's Book settings
 *     card writes `coverCloth` — the same four swatches — so it is here too.
 *   - `readJourneysScreen.ts` sorts by `journeys.order`, which is exactly what
 *     `saveBookmarkOrder` writes. `readMediaScreen.ts` and
 *     `readGalleriesScreen.ts` sort THEIR journey selects by `name`, so neither
 *     is affected — checked rather than assumed, and asserted below.
 *   - `readSignInScreen.ts` reads `{ title, subtitle, coverCloth }`, and
 *     `app/(admin)/admin/sign-in/page.tsx` declares no `dynamic`, no `cookies()`
 *     and no `headers()`. It is the one route outside this screen group that
 *     reads these columns AND can be rendered at build.
 *
 * THE PUBLIC DIARY NEEDS NOTHING, and this is the first task where that is
 * worth stating rather than assuming. `/p/[n]`, `/m/[n]` and `/gallery/[slug]`
 * are rendered per request from `readBookBundle`/`readGalleryBundle` and declare
 * no `generateStaticParams` — `app/(diary)/p/[n]/page.tsx`'s own header records
 * the measurement behind that decision — so there is no route cache holding a
 * stale cover title. A third case below asserts that no revalidation of a diary
 * path was added on the assumption that there is.
 *
 * ═══ WHY A FILE READ, AND WHAT IT IS NOT ═══
 *
 * The shape `galleriesRevalidationRegistration.test.ts` and
 * `mediaRevalidationRegistration.test.ts` already use: the honest subject is
 * "what does this module call", and neither Vitest project can execute a
 * `'use server'` module. Reading the source is reading the wire. IT IS NOT a
 * proof that Next.js then serves a fresh render; what this fails on is the edit
 * that drops an address, and on a fifth write landing with no decision recorded
 * about its readers.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Two extractions and three
 * comparisons.
 * Depends on: node:fs, node:path, node:url, vitest.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Where the modules below are resolved from — `apps/web`. */
const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** The two modules that dispatch these screens' writes, relative to {@link APP}. */
const ACTION_MODULES = ['app/(admin)/admin/book/actions.ts', 'app/(admin)/admin/cover/actions.ts'] as const

/**
 * Every address each exported action revalidates, by the export's name.
 *
 * THE ADDRESSES ARE SPELLED OUT rather than named by their constants, so a
 * constant repointed at the wrong string fails here too. Every export of both
 * modules is listed, including the one that reaches a single address: a fifth
 * write added without a row is the case failing, which is the direction that
 * matters.
 */
const REVALIDATED: Readonly<Record<string, readonly string[]>> = {
  saveBookSettings: ['/admin/book', '/admin/cover', '/admin/sign-in'],
  saveBookmarkOrder: ['/admin/book', '/admin/journeys'],
  saveCover: ['/admin/cover', '/admin/book', '/admin/sign-in'],
  saveAbout: ['/admin/cover'],
}

/** A `const NAME = '…'` binding at the top of an actions module. */
const PATH_CONSTANT = /^const (\w+) = '([^']*)'$/gmu

/** Where one exported binding begins, which is where the one before it ends. */
const EXPORT_BOUNDARY = /^export const /mu

/** The name a chunk of the module declares, once split at a boundary. */
const EXPORTED_NAME = /^(\w+) = guardedAction\(/u

/** The first argument of a `revalidatePath` call. */
const REVALIDATE_CALL = /revalidatePath\(\s*([^,)]+)/gu

/**
 * One actions module's own source.
 * @param module - Its path under `apps/web`.
 * @returns The file, as written.
 */
const sourceOf = (module: string): string => readFileSync(path.join(APP, module), 'utf8')

/** Both actions modules' sources, concatenated. */
const bothSources = (): string => ACTION_MODULES.map(sourceOf).join('\n')

/**
 * The addresses each exported action revalidates, with constants resolved.
 *
 * @returns One entry per export across both modules.
 * @throws {Error} When the modules declare no exports in a shape this case can
 *   read — which is the refactor being reported, not a test defect.
 */
const revalidatedAddresses = (): Readonly<Record<string, readonly string[]>> => {
  const found: Record<string, readonly string[]> = {}

  for (const module of ACTION_MODULES) {
    const source = sourceOf(module)
    const addresses = new Map([...source.matchAll(PATH_CONSTANT)].map((match) => [match[1] ?? '', match[2] ?? '']))

    // SPLIT RATHER THAN MATCHED, because "this export's body" is "everything up
    // to the next export" and JavaScript's regular expressions have no
    // end-of-input anchor that a lazy quantifier can stop at.
    for (const chunk of source.split(EXPORT_BOUNDARY)) {
      const declared = EXPORTED_NAME.exec(chunk)
      if (declared?.[1] === undefined) continue
      found[declared[1]] = [...chunk.matchAll(REVALIDATE_CALL)].map((call) => {
        const argument = (call[1] ?? '').trim()
        // A LITERAL IS TAKEN AS ITSELF and a bare name is resolved, so the table
        // above compares addresses however these modules choose to spell them.
        return argument.startsWith("'") ? argument.slice(1, -1) : (addresses.get(argument) ?? argument)
      })
    }
  }

  if (Object.keys(found).length === 0) {
    throw new Error('neither actions module declares an action in a shape this case can read')
  }
  return found
}

describe('the book and cover screens’ writes and the caches they invalidate', () => {
  it('invalidates every screen whose read its columns change, and no screen it leaves alone', () => {
    // THE WHOLE FINDING IN ONE ASSERTION. `coverCloth` is written by BOTH
    // screens and read by three; `journeys.order` is read by one other screen
    // and by neither of these two; and the `about` global is read by this
    // screen group and by the diary, which caches nothing.
    expect(revalidatedAddresses()).toEqual(REVALIDATED)
  })

  it('names the sign-in screen from every write that touches a column its cloth panel reads', () => {
    // COUNTED RATHER THAN SEARCHED FOR, which is the difference Task 9's fix
    // round was caught on: a `toContain` passes while one of two writes carries
    // the address and the other does not. `readSignInScreen.ts` selects
    // `{ title, subtitle, coverCloth }` — §2.6's card writes the cloth and
    // §2.7's card writes all three — so exactly two of the four writes name it.
    const calls = bothSources().split('revalidatePath(SIGN_IN_PATH)').length - 1

    expect({ calls, any: calls > 0 }).toEqual({ calls: 2, any: true })
  })

  it('revalidates no diary address, because the diary caches none of this', () => {
    // ASSERTED RATHER THAN OMITTED. `/p/<n>`, `/m/<n>` and `/gallery/<slug>` are
    // rendered per request and declare no `generateStaticParams`, so a
    // `revalidatePath` aimed at one of them would be a line that looks like
    // care and buys nothing. A task that makes the diary static has to change
    // this case, which is the point of it.
    const source = bothSources()
    const diaryPaths = ["'/p/", "'/m/", "'/gallery/"].filter((prefix) => source.includes(prefix))

    expect(diaryPaths).toEqual([])
  })

  it('leaves the media and galleries screens alone, because neither sorts a journey by `order`', () => {
    // ASSERTED RATHER THAN OMITTED. Both screens draw a journey select, and both
    // sort it by `name`; only `readJourneysScreen.ts` sorts by `order`. A future
    // task that re-sorted either has to change this line.
    const source = bothSources()

    expect([source.includes("'/admin/media'"), source.includes("'/admin/galleries'")]).toEqual([false, false])
  })
})
