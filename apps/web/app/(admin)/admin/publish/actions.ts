'use server'

/**
 * actions — SCREENS.md §2.8's three writes, and the one place design spec §8's
 * "on-demand revalidation of affected paths only" is actually spent.
 *
 * Every export is built from `guardedAction`, which is what a Server Action
 * needs rather than a check it could forget: an action is a POST endpoint of
 * its own, dispatched before the page around it renders, so the page's own
 * guard has not run (SECURITY.md: nothing inherits trust from the page it was
 * reached from).
 *
 * NOTHING IS BUILT AT THE TOP LEVEL — `eslint-rules/guarded-server-actions.js`
 * rule 4 refuses a module that evaluates anything at load. Every decision lives
 * in `../../../../lib/admin/publishSelection.ts`, which an integration test
 * executes against a real Payload; this file is the guard, the wiring and the
 * cache hints.
 *
 * THE SCOPE IS HOISTED ONCE PER CALL and spread. `adminScope` reads the
 * account's row, so `...(await adminScope(session))` at each operation would be
 * one `users` lookup per operation — the N+1 CLAUDE.md §6 forbids.
 *
 * ═══ THE DIARY ADDRESSES ARE COMPUTED, WHICH IS WHY THEY ARRIVE AS A VALUE ═══
 *
 * Every other actions module in this directory names its addresses as
 * constants, and a `…RevalidationRegistration.test.ts` reads them off the
 * source — the only instrument there is for a file no Vitest project can
 * execute. This screen's set is one path per page of the journeys that went
 * out, so there is no constant to read. `publishSelection` and `restoreEdition`
 * answer the addresses and the loops below spend them, which puts WHICH paths
 * where an integration test can execute it and leaves this file holding the
 * same wiring the others hold. `publishRevalidationRegistration.test.ts`
 * asserts that the loops spend every path and that the admin addresses beside
 * them are the ones below.
 * Depends on: revalidatePath (next/cache), guardedAction
 * (../../../../lib/auth/guard), adminScope and the three writes
 * (../../../../lib/admin/…), getPayload (../../../../lib/payload).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: this file
 * names the guard factory, the writes it wraps and the addresses they
 * invalidate. Every decision is `guardedAction`'s (executed by
 * `guard.integration.test.ts`) or `publishSelection.ts`'s (executed by
 * `publishSelection.integration.test.ts`, gated at 100% by
 * vitest.integration.config.ts). Neither Vitest project can execute this file:
 * a Server Action is dispatched by Next.js under an opaque action id and needs
 * a request context no test process has. The `c8 ignore` is the treatment
 * CLAUDE.md §2.1 asks for and the one every comparable file here already
 * carries; what CAN be observed of it is asserted by
 * `publishRevalidationRegistration.test.ts`, which reads the addresses off this
 * source. Wraps the imports too: an unimported file's imports are themselves
 * uncovered lines. */
import { revalidatePath } from 'next/cache'
import {
  publishSelection as publishRows,
  readEdition,
  readRevert,
  readSelection,
  restoreEdition as restoreOne,
  revertChange as revertOne,
} from '../../../../lib/admin/publishSelection'
import { adminScope } from '../../../../lib/admin/adminScope'
import { guardedAction } from '../../../../lib/auth/guard'
import { getPayload } from '../../../../lib/payload'

/**
 * This screen's own address, which all three writes invalidate.
 *
 * The screen is a Server Component reading the pending changes and the
 * editions, so without this the Changes card redraws from the cached render
 * and a published change is still listed as waiting.
 */
const PUBLISH_PATH = '/admin/publish'

/**
 * The journeys list, whose status pill is the other reading of the same fact.
 *
 * `readJourneysScreen.ts` derives `edited` from "published, and something newer
 * is not" — which is precisely what publishing and reverting change, and the
 * one thing `journeyStatus.ts` exists to stop the two screens disagreeing
 * about. Checked rather than assumed: `readMediaScreen.ts` and
 * `readGalleriesScreen.ts` read no version at all, which is why neither is
 * here.
 */
const JOURNEYS_PATH = '/admin/journeys'

/**
 * The signed-in screen, which prints the same count.
 *
 * `SignedInStep.tsx`'s status line names how many changes are waiting
 * (`docs/deviations.md` §38), and `app/(admin)/admin/sign-in/done/page.tsx`
 * reads it from this very module. It is the one address outside this screen
 * group that prints the number, so a publish that did not name it would leave
 * the sign-in screen counting changes that have gone out.
 */
const SIGNED_IN_PATH = '/admin/sign-in/done'

/**
 * Publishes the ticked changes.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param form - The publish form's body: one `change` field per ticked row.
 * @returns Nothing. The screen asks for the page again rather than being told.
 */
export const publishChanges = guardedAction(async (session, form: FormData): Promise<void> => {
  const paths = await publishRows(await getPayload(), await adminScope(session), readSelection(form))
  // THE DIARY'S OWN ADDRESSES, one per page the publish made stale — design
  // spec §8, and the only computed revalidation in this repository.
  for (const path of paths) revalidatePath(path)
  revalidatePath(PUBLISH_PATH)
  revalidatePath(JOURNEYS_PATH)
  revalidatePath(SIGNED_IN_PATH)
})

/**
 * Discards one pending change.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param form - The same body, of which only `revert` is read.
 * @returns Nothing.
 */
export const revertOneChange = guardedAction(async (session, form: FormData): Promise<void> => {
  await revertOne(await getPayload(), await adminScope(session), readRevert(form))
  // NO DIARY ADDRESS, and that is the point of this export being here. A
  // revert puts a row back to the version readers are ALREADY looking at, so
  // nothing published changes and nothing served is stale. Only the three
  // screens that count what is waiting redraw.
  revalidatePath(PUBLISH_PATH)
  revalidatePath(JOURNEYS_PATH)
  revalidatePath(SIGNED_IN_PATH)
})

/**
 * Puts an older edition of a journey back.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param form - The Editions card's own form body: one `edition` field.
 * @returns Nothing.
 */
export const restoreOneEdition = guardedAction(async (session, form: FormData): Promise<void> => {
  const paths = await restoreOne(await getPayload(), await adminScope(session), readEdition(form))
  // A RESTORE DOES CHANGE WHAT IS PUBLISHED, so it names the same computed
  // addresses a publish does — AND the same three screens, which is measured
  // rather than assumed: `restoreVersion` makes the restored version the
  // latest one, so a draft that was pending on that row stops being the latest
  // and stops being waiting. The count moves.
  for (const path of paths) revalidatePath(path)
  revalidatePath(PUBLISH_PATH)
  revalidatePath(JOURNEYS_PATH)
  revalidatePath(SIGNED_IN_PATH)
})
/* c8 ignore stop */
