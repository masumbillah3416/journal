'use server'

/**
 * actions — the Journeys screen's four mutations. Every export is built from
 * `guardedAction`, which is what a Server Action needs rather than a check it
 * could forget: an action is a `POST` endpoint of its own, dispatched before
 * the page around it renders, so the page's own guard has not run
 * (`SECURITY.md`: nothing inherits trust from the page it was reached from).
 *
 * NOTHING IS BUILT AT THE TOP LEVEL, and nothing is DECIDED here either. The
 * first is `eslint-rules/guarded-server-actions.js`'s rule 4: a module that
 * evaluates anything at load can attach an export no `export` keyword spells.
 * The second is CLAUDE.md §2.1's: a `'use server'` module cannot be executed by
 * either Vitest project, so it carries a whole-file `c8 ignore` — and a
 * decision taken behind one is a decision nothing measures. The parses, the
 * slug that must not collide, the three pages, the copy that must be a draft
 * and the soft delete are all `../../../../lib/admin/journeyMutations.ts`'s,
 * executed by `journeyMutations.integration.test.ts`.
 *
 * THE SCOPE IS HOISTED ONCE PER ACTION. `adminScope` reads the account's row,
 * so resolving it per Payload call would be one `users` lookup per operation —
 * the N+1 CLAUDE.md §7 forbids.
 *
 * EVERY ARGUMENT IS `FormData`, because every caller is a
 * `<form action={…}>` — the create panel's, and the three in the row strip.
 * Zod parses it at that boundary (CLAUDE.md §3.1): the guard says WHO is
 * calling and says nothing at all about what they sent.
 *
 * `revalidatePath` AFTER EVERY ONE. The screen is a Server Component reading
 * the database; without it the row the author just archived is still on their
 * screen, which is the silent-failure species this branch keeps finding.
 *
 * ═══ `@throws {z.ZodError}` BELOW IS WHAT THE PARSE REFUSES, NOT WHAT A
 *     CALLER SEES ═══
 *
 * Since `docs/deviations.md` §104 a `ZodError` from an action whose first
 * argument is a `FormData` — which is every export here — does not escape:
 * `guardedAction` catches it, hands the message and the values the form asked
 * to keep to the render that follows, and the action resolves. Each
 * `@throws {z.ZodError}` line still names exactly what the schema refuses,
 * which is the useful half; what it no longer describes is a rejection the
 * caller has to handle. Said once here rather than edited into every line,
 * because a sentence repeated once per export goes stale once per export.
 *
 * Depends on: `revalidatePath` (next/cache), `guardedAction`
 * (../../../../lib/auth/guard), `adminScope` and the mutations
 * (../../../../lib/admin/…), `getPayload` (../../../../lib/payload).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: this file
 * names the guard factory, hoists the scope and calls one mutation. Every
 * decision is `guardedAction`'s (executed by `guard.integration.test.ts`) or
 * `journeyMutations.ts`'s (executed by `journeyMutations.integration.test.ts`,
 * gated at 100% by vitest.integration.config.ts). Neither Vitest project can
 * execute this file: a Server Action is dispatched by Next.js under an opaque
 * action id and needs a request context no test process has. The `c8 ignore` is
 * the treatment CLAUDE.md §2.1 asks for and the one
 * `app/(admin)/admin/media/actions.ts` already carries. Wraps the imports too:
 * an unimported file's imports are themselves uncovered lines. */
import { revalidatePath } from 'next/cache'
import { adminScope } from '../../../../lib/admin/adminScope'
import {
  createJourneyRow,
  duplicateJourneyRow,
  readJourneyRef,
  readNewJourney,
  softDeleteJourney,
  toggleJourneyArchived,
} from '../../../../lib/admin/journeyMutations'
import { guardedAction } from '../../../../lib/auth/guard'
import { getPayload } from '../../../../lib/payload'

/**
 * The address every one of these actions invalidates.
 *
 * A string literal, which is the one initialiser `guarded-server-actions.js`'s
 * rule 4 admits at the top level of a `'use server'` module besides a function
 * expression and a `guardedAction(...)` call.
 */
const JOURNEYS_PATH = '/admin/journeys'

/**
 * Creates a journey, as a draft, with the three pages the panel promises.
 *
 * @param session - The account the guard admitted; the scope is read from it.
 * @param form - The create panel's three fields.
 * @throws {z.ZodError} When a field is missing or empty.
 */
export const createJourney = guardedAction(async (session, form: FormData): Promise<void> => {
  const input = readNewJourney(form)
  const scope = await adminScope(session)
  await createJourneyRow(await getPayload(), scope, input)
  revalidatePath(JOURNEYS_PATH)
})

/**
 * Copies a journey and its pages, always as drafts.
 *
 * @param session - The account the guard admitted.
 * @param form - The strip's hidden `journey` field.
 * @throws {z.ZodError} When the field names no row id.
 */
export const duplicateJourney = guardedAction(async (session, form: FormData): Promise<void> => {
  const journey = readJourneyRef(form)
  const scope = await adminScope(session)
  await duplicateJourneyRow(await getPayload(), scope, journey)
  revalidatePath(JOURNEYS_PATH)
})

/**
 * Puts a journey on the archive shelf, or takes it off.
 *
 * @param session - The account the guard admitted.
 * @param form - The strip's hidden `journey` field.
 * @throws {z.ZodError} When the field names no row id.
 */
export const archiveJourney = guardedAction(async (session, form: FormData): Promise<void> => {
  const journey = readJourneyRef(form)
  const scope = await adminScope(session)
  await toggleJourneyArchived(await getPayload(), scope, journey)
  revalidatePath(JOURNEYS_PATH)
})

/**
 * Moves a journey to the trash — a `deletedAt`, never a delete.
 *
 * @param session - The account the guard admitted.
 * @param form - The strip's hidden `journey` field.
 * @throws {z.ZodError} When the field names no row id.
 */
export const trashJourney = guardedAction(async (session, form: FormData): Promise<void> => {
  const journey = readJourneyRef(form)
  const scope = await adminScope(session)
  await softDeleteJourney(await getPayload(), scope, journey)
  revalidatePath(JOURNEYS_PATH)
})
/* c8 ignore stop */
