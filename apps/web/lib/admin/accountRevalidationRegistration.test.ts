/**
 * accountRevalidationRegistration.test.ts — every address SCREENS.md §2.11's
 * six writes change is an address they invalidate, and the two that can leave
 * the reader without a session reach the rail as well.
 *
 * ═══ WHY THE JOIN NEEDS A CASE OF ITS OWN ═══
 *
 * `settingsRevalidationRegistration.test.ts`'s reason, unchanged:
 * `app/(admin)/admin/account/actions.ts` carries a whole-file `c8 ignore`
 * because a Server Action is dispatched under an opaque action id and needs a
 * request context no Vitest project has — and a decision taken behind one is a
 * decision nothing measures. Which paths an action revalidates IS such a
 * decision, and `docs/deviations.md` §96 records the round where it was got
 * wrong.
 *
 * ═══ WHAT READS WHAT, WHICH IS WHERE THE TABLE BELOW COMES FROM ═══
 *
 *   - `saveProfile`, `saveNotifications` and `setOtpRequired` write columns on
 *     the caller's own `users` row, and this screen is the only thing in this
 *     repository that draws any of them. `displayName` is NOT on the cover the
 *     public book serves — `readBookBundle.ts` reads the `about` global, not
 *     `users` — so nothing public is stale.
 *   - `setOtpRequired` is the one to check twice, because the sign-in screen's
 *     footer line also states whether the code step is on
 *     (`readSignInScreen.ts`). That line is read PER REQUEST on a route this
 *     repository does not cache, so there is no prerendered artefact to drop;
 *     the day `/admin/sign-in` becomes cacheable it belongs in this table, and
 *     this sentence is the record of that.
 *   - `changePassword` writes a credential and redirects; it names this screen
 *     for the same reason the others do — the card it redirects to is this one.
 *   - `revokeOneSession` and `signOutEverywhere` can leave the reader with NO
 *     live session, and the rail is drawn on every admin screen from the route
 *     group's layout, which is not a cache key of its own. Both therefore name
 *     `/admin` with the `layout` type as well: a cached layout is a rail drawn
 *     for a session that has been revoked.
 *
 * ═══ WHY A FILE READ, AND WHAT IT IS NOT ═══
 *
 * The shape the other five registration files use: the honest subject is "what
 * does this module call", and neither Vitest project can execute a
 * `'use server'` module. Reading the source is reading the wire. It is NOT a
 * proof that Next.js then serves a fresh render; what it fails on is the edit
 * that drops an address, and on a seventh write landing with no decision
 * recorded about its readers.
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

/** The module that dispatches SCREENS.md §2.11's writes, relative to {@link APP}. */
const ACCOUNT_ACTIONS = 'app/(admin)/admin/account/actions.ts'

/**
 * Every address each exported action revalidates, by the export's name.
 *
 * THE ADDRESSES ARE SPELLED OUT rather than named by their constants, so a
 * constant repointed at the wrong string fails here too. Every export is
 * listed, including the four that reach exactly one address: a seventh action
 * added without a row is the case failing, which is the direction that matters.
 */
const REVALIDATED: Readonly<Record<string, readonly string[]>> = {
  saveProfile: ['/admin/account'],
  saveNotifications: ['/admin/account'],
  setOtpRequired: ['/admin/account'],
  changePassword: ['/admin/account'],
  revokeOneSession: ['/admin/account', '/admin'],
  signOutEverywhere: ['/admin/account', '/admin'],
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
const actionsSource = (): string => readFileSync(path.join(APP, ACCOUNT_ACTIONS), 'utf8')

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
    throw new Error(`${ACCOUNT_ACTIONS} declares no actions in a shape this case can read`)
  }
  return found
}

describe('the account screen’s writes and the caches they invalidate', () => {
  it('invalidates this screen for every write, and the rail for the two that can end the session', () => {
    expect(revalidatedAddresses()).toEqual(REVALIDATED)
  })

  it('names the admin layout with the layout type, at BOTH calls and not merely at one', () => {
    // COUNTED RATHER THAN SEARCHED FOR, which is the whole difference:
    // `revalidatePath('/admin')` alone invalidates the Overview PAGE and
    // nothing else, and two actions make this call — so a `toContain` would
    // pass while one of them lost its type. The `any` half is the sentinel: a
    // refactor that renamed the constant would otherwise make `0 === 0` true.
    const source = actionsSource()
    const calls = source.split('revalidatePath(ADMIN_LAYOUT').length - 1
    const typed = source.split("revalidatePath(ADMIN_LAYOUT, 'layout')").length - 1

    expect({ calls, typed }).toEqual({ calls: 2, typed: 2 })
  })

  it('leaves the sign-in screen alone, because its footer line is read per request', () => {
    // ASSERTED RATHER THAN OMITTED. `readSignInScreen.ts` prints whether the
    // code step is on, from the lowest-id account's own column — the one
    // `setOtpRequired` writes. There is nothing to drop while that route is
    // uncached, and a future task that caches it has to change this line, which
    // is the point of it.
    expect(actionsSource()).not.toContain("revalidatePath('/admin/sign-in')")
  })

  it('redirects to this screen with the notice parameter, so a refusal is not a 500', () => {
    // The one thing `changePassword` does that no other action here does, and
    // the reason this screen is not a sixth instance of docs/deviations.md
    // §104. Read off the source for the same reason the addresses are.
    expect(actionsSource()).toContain('redirect(')
    expect(actionsSource()).toContain('PASSWORD_NOTICE_PARAM')
  })
})
