/**
 * adminScope — the one way an admin read or write reaches Payload with this
 * repository's access rules switched ON.
 *
 * Payload's Local API defaults `overrideAccess` to `true`: a call that passes
 * nothing runs with collection and field access control SKIPPED. Phase 2 was
 * right to leave it that way — every call there had already authenticated the
 * request itself — and `docs/security.md` names it a trap for this phase,
 * because eleven screens of Server Actions are about to call `payload.update`.
 * Deciding it per call site is deciding it eleven times and forgetting once.
 * `docs/adr/0023-admin-authorization-and-override-access.md` carries the
 * decision and the options rejected to reach it.
 *
 * It resolves the account ROW because `AuthenticatedSession` carries only a
 * branded id and Payload's access predicates read `req.user.id`. One extra
 * `findByID` per action, not per row: this is not the N+1 CLAUDE.md §6 forbids.
 *
 * THE BOOTSTRAP LOOKUP ITSELF RUNS WITH THE RULES OFF, and that is not an
 * exception to the rule above — it is the reason the rule needs a module. The
 * `findByID` below passes no `overrideAccess`, so it takes Payload's default,
 * because there is no `req.user` to judge it by until it has returned. Running
 * it under `ownAccountOnly` would need the answer it is being asked for. It is
 * therefore kept to exactly one read, of exactly one row, by primary key.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. It is one lookup and one
 * object; naming a pattern for that would be cargo cult.
 *
 * INVARIANT — `overrideAccess` is `false` here and nowhere else in this
 * directory. `apps/web/lib/auth/overrideAccessSites.test.ts` pins the
 * production set to this file and `setNewPassword.ts`, and requires both to be
 * named in `docs/security.md` and `docs/api.md`.
 * Depends on: `payload` (types), `accountRowId` (@travel-diary/domain/ids),
 * `getPayload` (../payload), `AuthenticatedSession` (../auth/sessions).
 */
import { accountRowId } from '@travel-diary/domain/ids'
import type { TypedUser } from 'payload'
import type { AuthenticatedSession } from '../auth/sessions'
import { getPayload } from '../payload'

/** What every admin Local API call spreads, so no call site decides this. */
export interface AdminScope {
  /** The account row Payload's access predicates judge against. */
  readonly user: TypedUser
  /**
   * Literally `false`, not `boolean`.
   *
   * WHAT THIS TYPE DOES AND DOES NOT CATCH, because the first draft of this
   * line credited the wrong mechanism and thirteen screen tasks read it. It
   * refuses an {@link AdminScope} VALUE built with anything but `false` — a
   * second producer of this shape cannot hand out a permissive one. It does
   * NOT refuse a call site that spreads this and then sets the option itself:
   * the destination parameter is `overrideAccess?: boolean`, a later key in an
   * object literal wins, and that flip compiles (measured under
   * `tsc -p apps/web --noEmit`, exit 0).
   *
   * What catches THAT is `apps/web/lib/auth/overrideAccessSites.test.ts`: any
   * non-test file under `apps/` or `packages/` carrying the option is a third
   * production site, and its first case fails on the commit that adds one. A
   * Server Action under `apps/web/app/` is inside that scan.
   */
  readonly overrideAccess: false
}

/**
 * The scope for the account the guard admitted.
 *
 * @param session - What `guardedAction` handed the action.
 * @returns The scope to spread into every Local API call the action makes.
 * @throws When the session's brand names no account row — which is a bug in
 *   whatever minted it, not a state a screen can draw — and, from Payload,
 *   when it names a row that is not there.
 * @example
 * const scope = await adminScope(session)
 * await payload.update({ collection: 'journeys', id, ...scope, data })
 */
export const adminScope = async (session: AuthenticatedSession): Promise<AdminScope> => {
  const id = accountRowId(session.user)
  if (id === undefined) throw new Error('the admitted session names no account row')

  const payload = await getPayload()
  const account = await payload.findByID({ collection: 'users', id, depth: 0 })

  return { user: { ...account, collection: 'users' }, overrideAccess: false }
}
