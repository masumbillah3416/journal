'use server'

/**
 * actions — SCREENS.md §2.6's two writes. Every export is built from
 * `guardedAction`, which is what a Server Action needs rather than a check it
 * could forget: an action is a POST endpoint of its own, dispatched before the
 * page around it renders, so the page's own guard has not run (SECURITY.md:
 * nothing inherits trust from the page it was reached from).
 *
 * NOTHING IS BUILT AT THE TOP LEVEL — `eslint-rules/guarded-server-actions.js`
 * rule 4 refuses a module that evaluates anything at load. Every decision lives
 * in `../../../../lib/admin/bookMutations.ts`, which an integration test
 * executes against a real Payload; this file is the guard, the wiring and the
 * cache hints.
 *
 * THE SCOPE IS HOISTED ONCE PER CALL and spread. `adminScope` reads the
 * account's row, so `...(await adminScope(session))` at each operation would be
 * one `users` lookup per operation — the N+1 CLAUDE.md §6 forbids.
 *
 * ═══ WHICH ADDRESSES EACH WRITE INVALIDATES, AND WHY ═══
 *
 * `bookRevalidationRegistration.test.ts` holds the table and the reasoning; it
 * is a case rather than a comment because a decision taken behind a
 * `'use server'` module is a decision no Vitest project can execute.
 * Depends on: revalidatePath (next/cache), guardedAction
 * (../../../../lib/auth/guard), adminScope and the two writes
 * (../../../../lib/admin/…), getPayload (../../../../lib/payload).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: this file
 * names the guard factory and the writes it wraps. Every decision is
 * `guardedAction`'s (executed by `guard.integration.test.ts`) or
 * `bookMutations.ts`'s (executed by `bookMutations.integration.test.ts`, gated
 * at 100% by vitest.integration.config.ts). Neither Vitest project can execute
 * this file: a Server Action is dispatched by Next.js under an opaque action id
 * and needs a request context no test process has. The `c8 ignore` is the
 * treatment CLAUDE.md §2.1 asks for and the one every comparable file here
 * already carries; what CAN be observed of it is asserted by
 * `bookRevalidationRegistration.test.ts`, which reads the addresses off this
 * source. Wraps the imports too: an unimported file's imports are themselves
 * uncovered lines. */
import { revalidatePath } from 'next/cache'
import {
  readBookmarkOrder,
  saveBookSettings as writeBookSettings,
  saveBookmarkOrder as writeBookmarkOrder,
  type BookSettings,
} from '../../../../lib/admin/bookMutations'
import { adminScope } from '../../../../lib/admin/adminScope'
import { guardedAction } from '../../../../lib/auth/guard'
import { getPayload } from '../../../../lib/payload'

/**
 * This screen's own address, which both writes here invalidate.
 *
 * The screen is a Server Component reading the `book` global and the journeys,
 * so without this the list and the settings card redraw from the cached render
 * and the author's change is invisible until a hard reload.
 */
const BOOK_PATH = '/admin/book'

/**
 * The Cover & About screen, which reads FOUR of the same global's columns.
 *
 * `readCoverScreen.ts` selects `{ title, subtitle, owner, yearsShown,
 * coverCloth }`, and §2.6's Book settings card writes `coverCloth` — the same
 * four swatches, on the other screen. `contentsNote`, the two slider values and
 * the three toggles are not read there, which is why {@link saveBookmarkOrder}
 * does not name it.
 */
const COVER_PATH = '/admin/cover'

/**
 * The sign-in screen, which is the one route outside the admin that reads this
 * global and is rendered without a dynamic function.
 *
 * `readSignInScreen.ts` selects `{ title, subtitle, coverCloth }` and
 * `app/(admin)/admin/sign-in/page.tsx` declares no `dynamic`, no `cookies()`
 * and no `headers()`, so Next.js renders it at build. A changed cloth would
 * otherwise reach the diary immediately and the sign-in cloth never.
 */
const SIGN_IN_PATH = '/admin/sign-in'

/**
 * The journeys list, which is the only other admin screen sorted by
 * `journeys.order`.
 *
 * `readJourneysScreen.ts` reads `sort: 'order'`. `readMediaScreen.ts` and
 * `readGalleriesScreen.ts` both sort their journey selects by `name`, so
 * neither is here — checked, not assumed.
 */
const JOURNEYS_PATH = '/admin/journeys'

/**
 * Writes SCREENS.md §2.6's Book settings card.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param settings - The card's own eight controls.
 * @returns Nothing. The card asks for the page again rather than being told.
 */
export const saveBookSettings = guardedAction(async (session, settings: BookSettings): Promise<void> => {
  await writeBookSettings(await getPayload(), await adminScope(session), settings)
  revalidatePath(BOOK_PATH)
  // `coverCloth` IS THIS CARD'S TOO — §2.6 and §2.7 draw the same four
  // swatches — so both of the other screens that read it are named.
  revalidatePath(COVER_PATH)
  revalidatePath(SIGN_IN_PATH)
  // THE PUBLIC DIARY NEEDS NOTHING. `/p/<n>`, `/m/<n>` and `/gallery/<slug>`
  // are rendered per request from `readBookBundle`/`readGalleryBundle` and
  // declare no `generateStaticParams`, so there is no route cache holding a
  // stale contents note. Said here rather than left to be guessed, and asserted
  // by `bookRevalidationRegistration.test.ts`.
})

/**
 * Writes the book's journey order.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param form - The arrow's body: one `journey` field per journey of the book.
 * @returns Nothing.
 */
export const saveBookmarkOrder = guardedAction(async (session, form: FormData): Promise<void> => {
  await writeBookmarkOrder(await getPayload(), await adminScope(session), readBookmarkOrder(form))
  revalidatePath(BOOK_PATH)
  // `journeys.order` is the sort the journeys list draws itself in. The cover
  // screen and the sign-in screen read neither that column nor any journey at
  // all, which is why this write names two addresses where the other names three.
  revalidatePath(JOURNEYS_PATH)
})
/* c8 ignore stop */
