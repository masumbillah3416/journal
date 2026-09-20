'use server'

/**
 * actions — SCREENS.md §2.5's five writes. Every export is built from
 * `guardedAction`, which is what a Server Action needs rather than a check it
 * could forget: an action is a POST endpoint of its own, dispatched before the
 * page around it renders, so the page's own guard has not run (SECURITY.md:
 * nothing inherits trust from the page it was reached from).
 *
 * NOTHING IS BUILT AT THE TOP LEVEL — `eslint-rules/guarded-server-actions.js`
 * rule 4 refuses a module that evaluates anything at load, because an
 * attachment made at load is an export no `export` keyword spells. Every
 * decision lives in `../../../../lib/admin/galleryMutations.ts`, which an
 * integration test executes against a real Payload; this file is the guard,
 * the wiring and the cache hints.
 *
 * THE SCOPE IS HOISTED ONCE PER CALL and spread. `adminScope` reads the
 * account's row, so `...(await adminScope(session))` at each operation would be
 * one `users` lookup per operation — the N+1 CLAUDE.md §6 forbids.
 *
 * ═══ WHICH ADDRESSES EACH WRITE INVALIDATES, AND WHY ═══
 *
 * `galleriesRevalidationRegistration.test.ts` holds the table and the
 * reasoning; it is a case rather than a comment because a decision taken
 * behind a `'use server'` module is a decision no Vitest project can execute.
 * Depends on: revalidatePath (next/cache), guardedAction
 * (../../../../lib/auth/guard), adminScope and the five writes
 * (../../../../lib/admin/…), getPayload (../../../../lib/payload).
 */
/* c8 ignore start -- Framework passthrough with no authored logic: this file
 * names the guard factory and the writes it wraps. Every decision is
 * `guardedAction`'s (executed by `guard.integration.test.ts`) or
 * `galleryMutations.ts`'s (executed by
 * `galleryMutations.integration.test.ts`, gated at 100% by
 * vitest.integration.config.ts). Neither Vitest project can execute this file:
 * a Server Action is dispatched by Next.js under an opaque action id and needs
 * a request context no test process has. The `c8 ignore` is the treatment
 * CLAUDE.md §2.1 asks for and the one every comparable file here already
 * carries; what CAN be observed of it is asserted by
 * `galleriesRevalidationRegistration.test.ts`, which reads the addresses off
 * this source. Wraps the imports too: an unimported file's imports are
 * themselves uncovered lines. */
import { revalidatePath } from 'next/cache'
import { adminScope } from '../../../../lib/admin/adminScope'
import {
  applyBulkCaptions as writeBulkCaptions,
  setFrameFlags as writeFrameFlags,
  setFrameOrder as writeFrameOrder,
  setFrameText as writeFrameText,
  setPosterAt as writePosterAt,
  type BulkCaption,
  type FrameFlags,
} from '../../../../lib/admin/galleryMutations'
import { guardedAction } from '../../../../lib/auth/guard'
import { getPayload } from '../../../../lib/payload'

/**
 * This screen's own address, which every write here invalidates.
 *
 * The screen is a Server Component reading the gallery, so without this the
 * grid redraws from the cached render and the author's change is invisible
 * until a hard reload. `app/(admin)/admin/media/actions.ts` does the same for
 * the same reason.
 */
const GALLERIES_PATH = '/admin/galleries'

/**
 * The media screen, whose grid this screen's writes reorder and re-label.
 *
 * `readMediaScreen.ts` sorts by `order` and selects `{ alt, inBook }`, so an
 * arrangement, a saved alt text and a "Also place in the book" all change what
 * it draws. It does NOT select `caption`, which is why the bulk caption panel
 * is not here.
 */
const MEDIA_PATH = '/admin/media'

/**
 * EVERY journey editor, named by its route pattern rather than by an id.
 *
 * `readJourneyEditor.ts` draws the pool from `media` SORTED BY `order`, uses
 * `alt` on each tile and counts `inBook` for the "{n} of {total} in the book"
 * eyebrow — so three of the five writes below move something it reads. Passing
 * the PATTERN with the `page` type is Next.js's own spelling for "every page of
 * this dynamic route", which `app/(admin)/admin/media/actions.ts` already uses
 * and which reaches the journey without the write having to name it.
 */
const EDITOR_PATTERN = '/admin/journeys/[id]'

/**
 * Writes one journey's arrangement, densely, from the order it was given.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param journey - The journey being arranged.
 * @param order - Every one of its frames, in the new order.
 * @returns Nothing. The grid asks for the page again rather than being told.
 */
export const setFrameOrder = guardedAction(
  async (session, journey: string, order: readonly string[]): Promise<void> => {
    await writeFrameOrder(await getPayload(), await adminScope(session), journey, order)
    revalidatePath(GALLERIES_PATH)
    // `media.order` is the sort BOTH other media readers use.
    revalidatePath(MEDIA_PATH)
    revalidatePath(EDITOR_PATTERN, 'page')
  },
)

/**
 * Writes one frame's caption and alt text.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param id - The frame.
 * @param caption - The caption the gallery prints. `''` clears it.
 * @param alt - What the frame says it is to a reader who cannot see it.
 * @returns Nothing.
 */
export const setFrameText = guardedAction(async (session, id: string, caption: string, alt: string): Promise<void> => {
  await writeFrameText(await getPayload(), await adminScope(session), id, caption, alt)
  revalidatePath(GALLERIES_PATH)
  // `alt` IS DRAWN BY BOTH, on every tile. `caption` is drawn by neither —
  // `readMediaScreen.ts` does not select it and `PoolItem`'s own TSDoc
  // records that the editor removed it — so this pair is here for the alt.
  revalidatePath(MEDIA_PATH)
  revalidatePath(EDITOR_PATTERN, 'page')
})

/**
 * Writes one frame's two column toggles.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param id - The frame.
 * @param flags - Hidden from the gallery, and in the book.
 * @returns Nothing.
 */
export const setFrameFlags = guardedAction(async (session, id: string, flags: FrameFlags): Promise<void> => {
  await writeFrameFlags(await getPayload(), await adminScope(session), id, flags)
  revalidatePath(GALLERIES_PATH)
  // `inBook` is §2.4's "In book" chip and its filter, and the editor's
  // "{n} of {total} in the book" eyebrow.
  revalidatePath(MEDIA_PATH)
  revalidatePath(EDITOR_PATTERN, 'page')
})

/**
 * Writes one clip's poster timestamp.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param id - The clip.
 * @param seconds - Where the poster is taken from, or `null` for the first frame.
 * @returns Nothing.
 */
export const setPosterAt = guardedAction(async (session, id: string, seconds: number | null): Promise<void> => {
  await writePosterAt(await getPayload(), await adminScope(session), id, seconds)
  // ONE ADDRESS, and it is checked rather than assumed: `media.posterAt` is
  // drawn by this panel and by nothing else in this repository — §2.5 is the
  // column's first reader as well as its first writer.
  revalidatePath(GALLERIES_PATH)
})

/**
 * Writes §2.5's bulk caption panel, one caption per frame.
 *
 * @param session - The account the guard admitted, resolved to a scope.
 * @param rows - One row per frame the panel offered.
 * @returns Nothing.
 */
export const applyBulkCaptions = guardedAction(async (session, rows: readonly BulkCaption[]): Promise<void> => {
  await writeBulkCaptions(await getPayload(), await adminScope(session), rows)
  // ONE ADDRESS. Nothing outside this screen reads `media.caption`: §2.4's
  // grid does not select it, and the editor's pool selected it once and drew
  // it nowhere. Asserted rather than left looking like an omission.
  revalidatePath(GALLERIES_PATH)
})
/* c8 ignore stop */
