'use server'

/**
 * actions — SCREENS.md §2.7's two writes. `app/(admin)/admin/book/actions.ts`'s
 * header applies unchanged: every export is built from `guardedAction` because
 * a Server Action is a POST endpoint of its own, nothing is built at the top
 * level (`eslint-rules/guarded-server-actions.js` rule 4), and the scope is
 * hoisted once per call and spread.
 *
 * IT IS A SECOND MODULE RATHER THAN TWO MORE EXPORTS IN THE FIRST, because a
 * Server Action module is reached through the route that imports it and these
 * are two routes. `bookRevalidationRegistration.test.ts` reads both files and
 * holds one table for the four writes, which is where the addresses and the
 * reasoning live.
 * Depends on: revalidatePath (next/cache), guardedAction
 * (../../../../lib/auth/guard), adminScope and the two writes
 * (../../../../lib/admin/…), getPayload (../../../../lib/payload).
 */
/* c8 ignore start -- Framework passthrough with no authored logic, and the same
 * treatment as its sibling one route over: every decision is `guardedAction`'s
 * or `coverMutations.ts`'s (executed by `coverMutations.integration.test.ts`,
 * gated at 100% by vitest.integration.config.ts), and neither Vitest project
 * can execute a `'use server'` module. What CAN be observed of it is asserted by
 * `bookRevalidationRegistration.test.ts`. Wraps the imports too: an unimported
 * file's imports are themselves uncovered lines. */
import { revalidatePath } from 'next/cache'
import { adminScope } from '../../../../lib/admin/adminScope'
import {
  readAbout,
  saveAbout as writeAbout,
  saveCover as writeCover,
  type CoverFields,
} from '../../../../lib/admin/coverMutations'
import { guardedAction } from '../../../../lib/auth/guard'
import { getPayload } from '../../../../lib/payload'

/** This screen's own address, which both writes here invalidate. */
const COVER_PATH = '/admin/cover'

/**
 * The Book & bookmarks screen, which reads `book.coverCloth` too.
 *
 * `readBookScreen.ts` selects it for §2.6's own four swatches, so a cloth
 * chosen here has to reach that card. It reads none of the `about` global,
 * which is why {@link saveAbout} does not name it.
 */
const BOOK_PATH = '/admin/book'

/**
 * The sign-in screen, for the reason its sibling module gives: it selects
 * `{ title, subtitle, coverCloth }` and is rendered without a dynamic function,
 * so Next.js renders it at build.
 */
const SIGN_IN_PATH = '/admin/sign-in'

/**
 * Writes SCREENS.md §2.7's Cover card.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param cover - The card's five fields.
 * @returns Nothing.
 */
export const saveCover = guardedAction(async (session, cover: CoverFields): Promise<void> => {
  await writeCover(await getPayload(), await adminScope(session), cover)
  revalidatePath(COVER_PATH)
  // `title`, `subtitle` and `coverCloth` are all read elsewhere: the cloth by
  // §2.6's swatches, and all three by the sign-in cloth panel.
  revalidatePath(BOOK_PATH)
  revalidatePath(SIGN_IN_PATH)
})

/**
 * Writes SCREENS.md §2.7's About card.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param form - The card's whole form body.
 * @returns Nothing.
 */
export const saveAbout = guardedAction(async (session, form: FormData): Promise<void> => {
  await writeAbout(await getPayload(), await adminScope(session), readAbout(form))
  // ONE ADDRESS, and it is checked rather than assumed: the `about` global is
  // read by this screen and by `readBookBundle`, and the diary's routes carry
  // no route cache — they declare no `generateStaticParams` and render per
  // request. Nothing else in the admin selects a column of it.
  revalidatePath(COVER_PATH)
})
/* c8 ignore stop */
