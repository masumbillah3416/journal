'use server'

/**
 * actions — SCREENS.md §2.11's six writes. Every export is built from
 * `guardedAction`, which is what a Server Action needs rather than a check it
 * could forget: an action is a POST endpoint of its own, dispatched before the
 * page around it renders, so the page's own guard has not run (SECURITY.md:
 * nothing inherits trust from the page it was reached from).
 *
 * NOTHING IS BUILT AT THE TOP LEVEL — `eslint-rules/guarded-server-actions.js`
 * rule 4 refuses a module that evaluates anything at load. Every decision lives
 * in `../../../../lib/admin/accountMutations.ts` and
 * `../../../../lib/auth/sessions.ts`, both of which an integration test
 * executes against a real Payload; this file is the guard, the wiring and the
 * cache hints.
 *
 * THE SCOPE IS HOISTED ONCE PER CALL and spread. `adminScope` reads the
 * account's row, so `...(await adminScope(session))` at each operation would be
 * one `users` lookup per operation — the N+1 CLAUDE.md §6 forbids.
 *
 * ═══ EVERY WRITE HERE INVALIDATES THIS SCREEN AND NOTHING ELSE ═══
 *
 * `accountRevalidationRegistration.test.ts` holds the table and the reasoning;
 * it is a case rather than a comment because a decision taken behind a
 * `'use server'` module is a decision no Vitest project can execute. Two of
 * these writes DO reach the admin layout, and the reason is the rail: it prints
 * the account's address in its profile block and nothing else on any other
 * screen reads a `users` column.
 *
 * ═══ THE PASSWORD REFUSAL TRAVELS BY REDIRECT ═══
 *
 * `changePassword` returns a `Result`, and a Server Action that handed a
 * refusal back to the page would need the page to hold it — which is state, and
 * state is a client island. It redirects to this screen's own address with a
 * query instead: the whole screen re-renders on the server, the address stays
 * shareable, and the card reads the notice through `passwordNotice`, which
 * refuses anything it did not write. `docs/deviations.md` §104 names this shape
 * as the preferred one for the five screens that still answer 500.
 * Depends on: revalidatePath (next/cache), redirect (next/navigation),
 * guardedAction (../../../../lib/auth/guard), adminScope and the writes
 * (../../../../lib/admin/…), createSessionService (../../../../lib/auth/sessions),
 * getPayload (../../../../lib/payload).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: this file
 * names the guard factory and the writes it wraps. Every decision is
 * `guardedAction`'s (executed by `guard.integration.test.ts`),
 * `accountMutations.ts`'s or `sessions.ts`'s (both executed by their own
 * integration suites, gated at 100% by vitest.integration.config.ts). Neither
 * Vitest project can execute this file: a Server Action is dispatched by
 * Next.js under an opaque action id and needs a request context no test
 * process has. The `c8 ignore` is the treatment CLAUDE.md §2.1 asks for and the
 * one every comparable file here already carries; what CAN be observed of it is
 * asserted by `accountRevalidationRegistration.test.ts`, which reads the
 * addresses off this source. Wraps the imports too: an unimported file's
 * imports are themselves uncovered lines. */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  PASSWORD_NOTICE_PARAM,
  changePassword as writePassword,
  readNotificationToggle,
  readOtpToggle,
  readPasswordChange,
  readProfileForm,
  readSessionRow,
  saveNotifications as writeNotifications,
  saveProfile as writeProfile,
  setOtpRequired as writeOtpRequired,
} from '../../../../lib/admin/accountMutations'
import { adminScope } from '../../../../lib/admin/adminScope'
import { guardedAction } from '../../../../lib/auth/guard'
import { createSessionService } from '../../../../lib/auth/sessions'
import { getPayload } from '../../../../lib/payload'

/** This screen's own address, which every write here invalidates. */
const ACCOUNT_PATH = '/admin/account'

/**
 * The admin route group's layout, which the rail hangs in.
 *
 * `AdminShell` prints the account's address in the rail's profile block on
 * EVERY admin screen, and the route group's layout is not a cache key of its
 * own — so a write that can change what that block draws invalidates the
 * layout as well as this page. Only the two session writes qualify: they are
 * the ones that can leave the reader without a session at all.
 */
const ADMIN_LAYOUT = '/admin'

/**
 * Writes SCREENS.md §2.11's three profile fields.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param form - The profile card's whole form body.
 * @returns Nothing. The screen asks for the page again rather than being told.
 */
export const saveProfile = guardedAction(async (session, form: FormData): Promise<void> => {
  await writeProfile(await getPayload(), await adminScope(session), readProfileForm(form))
  revalidatePath(ACCOUNT_PATH)
})

/**
 * Writes one "Tell me when" toggle.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param form - The toggle's own form body: the column and the value.
 * @returns Nothing.
 */
export const saveNotifications = guardedAction(async (session, form: FormData): Promise<void> => {
  await writeNotifications(await getPayload(), await adminScope(session), readNotificationToggle(form))
  revalidatePath(ACCOUNT_PATH)
})

/**
 * Writes the setting SECURITY.md calls the only source of truth for the code
 * step.
 *
 * IT INVALIDATES THIS SCREEN ONLY, and that is worth saying because the sign-in
 * screen's footer line also states whether the code step is on
 * (`readSignInScreen.ts`). That line is drawn for the LOWEST-ID account and is
 * read per request on a route this repository does not cache, so there is
 * nothing to drop; the moment `/admin/sign-in` becomes cacheable, it belongs in
 * this list.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param form - The toggle's form body: the value it is switching to.
 * @returns Nothing.
 */
export const setOtpRequired = guardedAction(async (session, form: FormData): Promise<void> => {
  await writeOtpRequired(await getPayload(), await adminScope(session), readOtpToggle(form))
  revalidatePath(ACCOUNT_PATH)
})

/**
 * Changes the account's password, and says on this screen what happened.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param form - The two password boxes.
 * @returns Nothing. It redirects either way — see this module's header.
 */
export const changePassword = guardedAction(async (session, form: FormData): Promise<void> => {
  const changed = await writePassword(await getPayload(), await adminScope(session), readPasswordChange(form))
  revalidatePath(ACCOUNT_PATH)
  redirect(`${ACCOUNT_PATH}?${PASSWORD_NOTICE_PARAM}=${changed.ok ? 'changed' : changed.error}`)
})

/**
 * Revokes one of the account's own sessions, addressed by its row.
 *
 * @param session - The account the guard admitted.
 * @param form - The row's id.
 * @returns Nothing. If the row revoked was this request's own, the next
 *   navigation is redirected to the sign-in screen by the guard — which is why
 *   the layout is invalidated as well as the page.
 */
export const revokeOneSession = guardedAction(async (session, form: FormData): Promise<void> => {
  const payload = await getPayload()
  const sessions = createSessionService({ payload, now: Date.now })
  // THE REFUSAL IS DELIBERATELY NOT SURFACED, and this line says so because the
  // module it comes from promises the opposite ("a caller cannot reach an
  // account id without handling the refusal"). `err('unknown')` here means the
  // row is already revoked, or is not this account's — and in both cases the
  // honest thing to draw is the list as it now stands, which is what the
  // re-render below does. The author reached this action by pressing a button
  // beside a row on their own screen, so the only way to reach the refusal is a
  // hand-built POST, and telling its author which row ids exist is not
  // something this screen owes them.
  void (await sessions.revokeSessionRow({ row: readSessionRow(form), owner: session.user }))
  revalidatePath(ACCOUNT_PATH)
  revalidatePath(ADMIN_LAYOUT, 'layout')
})

/**
 * Revokes every live session the account holds, this one included.
 *
 * @param session - The account the guard admitted.
 * @returns Nothing.
 */
export const signOutEverywhere = guardedAction(async (session): Promise<void> => {
  const payload = await getPayload()
  const sessions = createSessionService({ payload, now: Date.now })
  await sessions.revokeAllSessions({ owner: session.user })
  revalidatePath(ACCOUNT_PATH)
  revalidatePath(ADMIN_LAYOUT, 'layout')
})
/* c8 ignore stop */
