/**
 * mediaMutations — what SCREENS.md §2.4's bulk bar does to the database, and
 * the Zod parses that stand between a `POST` and them.
 *
 * ═══ WHY THE DECISIONS ARE HERE AND NOT IN `actions.ts` ═══
 *
 * `journeyMutations.ts`'s reason, unchanged: a `'use server'` module carries a
 * whole-file `c8 ignore` in this repository because a Server Action needs a
 * request context no Vitest project has, so anything DECIDED there is decided
 * where nothing measures it. The actions module is the guard and the wiring;
 * the parses and the writes live here, behind a `Payload` parameter.
 *
 * ═══ THE ARGUMENTS ARE NOT `FormData`, AND THAT IS NOT LAXITY ═══
 *
 * `journeyMutations.ts` parses `FormData` because every one of its callers is
 * a `<form action={…}>`. §2.4's bulk bar has no form: the selection is a
 * `ReadonlySet<MediaId>` in a client island, and what crosses the boundary is
 * an array of strings React serialises. So the parses below take what actually
 * arrives. `z.coerce.number().int().positive()` is the same guard for the same
 * reason — `Number('nonsense')` reaching the driver as `NaN` escapes as a raw
 * `Failed query`.
 *
 * ═══ ONE WRITE PER ACTION, NOT ONE PER ID ═══
 *
 * Payload's `update` takes a `where`, so a selection of forty rows is one
 * statement (CLAUDE.md §6 — no N+1). `media` carries no `versions` block, so
 * none of this needs `journeyMutations.ts`'s two-write dance: there is no
 * newest version for a plain update to merge from.
 *
 * ═══ `inBook` GETS ITS FIRST WRITER HERE ═══
 *
 * Nothing in this repository wrote `media.inBook` before {@link addMediaToBook}
 * — `docs/qa/2026-09-19-journey-editor-sweep.md`'s EDITOR-004 names §2.4 as
 * the owner, and `docs/deviations.md` §63 records that the column had an
 * eyebrow counting it and no tile showing it. §2.4's grid draws the "In book"
 * chip and its filter; this is what makes either say anything.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — the collection's shape stops here,
 * and the screen's actions speak in media ids and journeys.
 *
 * INVARIANT — nothing here deletes a media row. §2.4's bulk bar is Add to
 * book, Caption, Move and Clear, and the last of those clears a SELECTION.
 * Depends on: zod, `payload` (types), `AdminScope` (./adminScope).
 */
import type { Payload } from 'payload'
import { z } from 'zod'
import type { AdminScope } from './adminScope'

/**
 * The most rows one bulk action may touch.
 *
 * Chosen against the screen rather than against a round number: the grid draws
 * at most a windowful of tiles at a time (`VIRTUAL_WINDOW` in
 * `@travel-diary/domain/admin/gridColumns`) and a selection is made by
 * clicking them, so a request naming more than a windowful is not one the
 * controls can produce. It is a ceiling on what one unattended `POST` can
 * rewrite, not a limit the author will meet.
 */
export const MAX_BULK_MEDIA = 500

/**
 * The ids a bulk action was submitted for.
 *
 * `min(1)` because an action over no rows is a write with no subject: Payload
 * would take `{ id: { in: [] } }` as a `where` matching nothing, which is a
 * silent no-op where a refusal is the honest answer.
 */
const MEDIA_IDS = z.array(z.coerce.number().int().positive()).min(1).max(MAX_BULK_MEDIA)

/** What "Caption" carries besides the ids. A caption may be blanked, not absent. */
const CAPTION = z.string()

/** The journey "Move" re-points the selection at. */
const JOURNEY_REF = z.coerce.number().int().positive()

/**
 * The media rows a bulk action names.
 *
 * @param ids - The ids the client sent, as strings.
 * @returns The row ids.
 * @throws {z.ZodError} When the list is empty, longer than
 *   {@link MAX_BULK_MEDIA}, or holds anything that is not a positive integer —
 *   none of which the grid's own tiles can produce.
 * @example
 * readMediaIds(['4', '9']) // [4, 9]
 */
export const readMediaIds = (ids: readonly string[]): readonly number[] => MEDIA_IDS.parse(ids)

/**
 * Marks every named row as being in the book.
 *
 * NOT A TOGGLE. §2.4's control says "Add to book", and a toggle over a mixed
 * selection has no honest answer — half of it would come back out. Taking a
 * photograph out of the book is the Galleries screen's "Also place in the
 * book" (§2.5), which acts on one frame.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}, spread into the write.
 * @param ids - The selection, as the client sent it.
 * @throws {z.ZodError} From {@link readMediaIds}, and from Payload when the
 *   write is refused by the access rules the scope switches on.
 * @example
 * await addMediaToBook(payload, scope, ['4', '9'])
 */
export const addMediaToBook = async (payload: Payload, scope: AdminScope, ids: readonly string[]): Promise<void> => {
  await payload.update({
    collection: 'media',
    ...scope,
    depth: 0,
    where: { id: { in: [...readMediaIds(ids)] } },
    data: { inBook: true },
  })
}

/**
 * Writes one caption to every named row.
 *
 * ONE CAPTION FOR THE WHOLE SELECTION, which is what a bulk control can mean.
 * Per-frame captions are §2.5's, where each row has its own field.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param ids - The selection, as the client sent it.
 * @param caption - What to write. The empty string CLEARS the caption, which
 *   is a thing an author can want and is why this is not `min(1)`.
 * @throws {z.ZodError} From the parses, and from Payload when refused.
 * @example
 * await captionMediaRows(payload, scope, ['4'], 'The last morning in Kyoto')
 */
export const captionMediaRows = async (
  payload: Payload,
  scope: AdminScope,
  ids: readonly string[],
  caption: string,
): Promise<void> => {
  await payload.update({
    collection: 'media',
    ...scope,
    depth: 0,
    where: { id: { in: [...readMediaIds(ids)] } },
    data: { caption: CAPTION.parse(caption) },
  })
}

/**
 * Re-points every named row at another journey.
 *
 * ═══ THIS CHANGES WHICH GALLERY A PHOTOGRAPH IS IN ═══
 *
 * `apps/web/lib/galleryFrames.ts`'s `galleryFrameWhere` selects a gallery's
 * frames by `journey`, so moving a row moves it between two public galleries —
 * the source loses a frame and the destination gains one, with no other write.
 * `mediaMutations.integration.test.ts` asserts both counts through that
 * module's own query rather than counting rows itself, because a test that
 * spelled the rule again would agree with itself about a rule the diary does
 * not use.
 *
 * WHAT IT DOES NOT DO: it does not clear a page slot that still holds the
 * photograph. A slot is `pages.slots[].media`, and a page in journey A holding
 * a photograph now filed under B still prints it — `readJourneyEditor` draws
 * that cell empty, because its pool is scoped to the journey, and the book
 * prints it, because `readBookBundle` resolves the slot by id. §2.4 specifies
 * a move and no cascade, and inventing one is the abstraction CLAUDE.md §4
 * refuses; it is recorded in `docs/deviations.md` rather than left to be found.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param ids - The selection, as the client sent it.
 * @param journey - The destination journey's row id, as the client sent it.
 * @throws {z.ZodError} From the parses, and from Payload when refused.
 * @example
 * await moveMediaRows(payload, scope, ['4', '9'], '7')
 */
export const moveMediaRows = async (
  payload: Payload,
  scope: AdminScope,
  ids: readonly string[],
  journey: string,
): Promise<void> => {
  await payload.update({
    collection: 'media',
    ...scope,
    depth: 0,
    where: { id: { in: [...readMediaIds(ids)] } },
    data: { journey: JOURNEY_REF.parse(journey) },
  })
}
