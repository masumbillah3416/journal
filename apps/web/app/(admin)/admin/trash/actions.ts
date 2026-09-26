'use server'

/**
 * actions — SCREENS.md §2.10's two writes. Every export is built from
 * `guardedAction`, for `app/(admin)/admin/settings/actions.ts`'s reason: an
 * action is a POST endpoint of its own, dispatched before the page around it
 * renders, so the page's own guard has not run.
 *
 * NOTHING IS BUILT AT THE TOP LEVEL, and every decision — including the parse
 * that turns a form field into a row id, and the refusal that stops a journey
 * being destroyed from a stale form — lives in
 * `../../../../lib/admin/journeyMutations.ts`, which an integration test
 * executes against a real Payload.
 *
 * ═══ WHICH ADDRESSES EACH WRITE INVALIDATES, AND WHY ═══
 *
 * `trashRevalidationRegistration.test.ts` holds the table and the reasoning.
 * Both writes move a journey between the live set and the trash, so both
 * reach every screen that counts either — and Delete for good reaches the
 * public diary, because a journey that was still published when it was
 * trashed has pages and a gallery that are about to stop existing.
 * Depends on: revalidatePath (next/cache), guardedAction
 * (../../../../lib/auth/guard), adminScope, `readJourneyRef`,
 * `restoreJourney` and `deleteJourneyForGood` (../../../../lib/admin/…),
 * getPayload (../../../../lib/payload).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: this file
 * names the guard factory and the two writes it wraps. Every decision is
 * `guardedAction`'s (executed by `guard.integration.test.ts`) or
 * `journeyMutations.ts`'s (executed by
 * `journeyMutations.integration.test.ts`). Neither Vitest project can execute
 * this file: a Server Action is dispatched by Next.js under an opaque action
 * id and needs a request context no test process has. What CAN be observed of
 * it is asserted by `trashRevalidationRegistration.test.ts`, which reads the
 * addresses off this source. Wraps the imports too. */
import { revalidatePath } from 'next/cache'
import { adminScope } from '../../../../lib/admin/adminScope'
import {
  deleteJourneyForGood as destroyJourney,
  readJourneyRef,
  restoreJourney as putJourneyBack,
} from '../../../../lib/admin/journeyMutations'
import { guardedAction } from '../../../../lib/auth/guard'
import { getPayload } from '../../../../lib/payload'

/** This screen's own address, which both writes invalidate. */
const TRASH_PATH = '/admin/trash'

/** The journeys list, whose rows and whose chips are the live set. */
const JOURNEYS_PATH = '/admin/journeys'

/** The Overview, whose stat grid counts live journeys, pages and photographs. */
const OVERVIEW_PATH = '/admin'

/** The Settings screen, whose "Space used" bar is the media library's bytes. */
const SETTINGS_PATH = '/admin/settings'

/** Every page of the book, by pattern. A restored or destroyed journey changes what is in it. */
const BOOK_PATTERN = '/p/[n]'

/** The mobile surface's own route entry, for `BOOK_PATTERN`'s reason (ADR 0012). */
const MOBILE_PATTERN = '/m/[n]'

/** Every gallery page, by pattern: a journey's gallery goes with the journey. */
const GALLERY_PATTERN = '/gallery/[slug]'

/**
 * Takes a journey back out of the trash.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param form - The row's form body, carrying the journey's id.
 * @returns Nothing.
 */
export const putJourneyBackFromTrash = guardedAction(async (session, form: FormData): Promise<void> => {
  await putJourneyBack(await getPayload(), await adminScope(session), readJourneyRef(form))
  revalidatePath(TRASH_PATH)
  // THE LIVE SET CHANGED, so every admin screen that counts it is stale: the
  // journeys table and its chips, the Overview's stat grid, and the rail's own
  // counts on both.
  revalidatePath(JOURNEYS_PATH)
  revalidatePath(OVERVIEW_PATH)
  // AND THE PUBLIC DIARY, if the journey was published when it was thrown
  // away: `readBookBundle` excludes a soft-deleted journey, so restoring one
  // puts its pages back into the book and re-opens its gallery.
  revalidatePath(BOOK_PATTERN, 'page')
  revalidatePath(MOBILE_PATTERN, 'page')
  revalidatePath(GALLERY_PATTERN, 'page')
})

/**
 * Removes a trashed journey, its pages and its photographs, for good.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param form - The row's form body, carrying the journey's id.
 * @returns Nothing.
 */
export const deleteJourneyForGood = guardedAction(async (session, form: FormData): Promise<void> => {
  await destroyJourney(await getPayload(), await adminScope(session), readJourneyRef(form))
  revalidatePath(TRASH_PATH)
  revalidatePath(JOURNEYS_PATH)
  revalidatePath(OVERVIEW_PATH)
  // THE ONLY WRITE IN THIS PHASE THAT MAKES "Space used" GO DOWN, which is
  // §2.9's bar and nothing else's.
  revalidatePath(SETTINGS_PATH)
  revalidatePath(BOOK_PATTERN, 'page')
  revalidatePath(MOBILE_PATTERN, 'page')
  revalidatePath(GALLERY_PATTERN, 'page')
})
/* c8 ignore stop */
