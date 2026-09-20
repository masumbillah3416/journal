/**
 * bookMutations — what SCREENS.md §2.6's two controls do to the database, and
 * the Zod parses that stand between a `POST` and them.
 *
 * ═══ WHY THE DECISIONS ARE HERE AND NOT IN `actions.ts` ═══
 *
 * `galleryMutations.ts`'s reason, unchanged: a `'use server'` module carries a
 * whole-file `c8 ignore` in this repository because a Server Action is
 * dispatched under an opaque action id and needs a request context no Vitest
 * project has, so anything DECIDED there is decided where nothing measures it.
 * Zod schemas cannot sit at the top level of a `'use server'` module either
 * (`eslint-rules/guarded-server-actions.js` rule 4). The actions module is the
 * guard, the wiring and the cache hints; the parses and the writes live here
 * behind a `Payload` parameter, and `bookMutations.integration.test.ts`
 * executes them against a real Payload.
 *
 * ═══ A GLOBAL MERGES, AND TWO SCREENS DEPEND ON IT ═══
 *
 * `book` holds twelve columns. §2.6's card writes six of them and §2.7's Cover
 * card writes four more, so {@link saveBookSettings} names ONLY its own six and
 * relies on `updateGlobal` merging into the stored document rather than
 * replacing it. That is a property of Payload rather than of this file, so it
 * is asserted rather than assumed: `bookMutations.integration.test.ts` saves a
 * contents note and reads the cover title back through `readBookBundle`.
 *
 * The versioned-write dance three sibling modules carry does NOT apply to the
 * global. `apps/web/globals/book.ts` declares no `versions` block, so there is
 * no newest version for `updateGlobal` to merge from and a plain write is the
 * whole write. {@link saveBookmarkOrder} is the other half of that sentence:
 * `journeys` IS versioned, so it carries the dance in full — see its own notes.
 *
 * ═══ AN ORDER THAT IS NOT A BIJECTION REFUSES THE WHOLE WRITE ═══
 *
 * Standing orders, species 6, and `galleryMutations.ts`'s `setFrameOrder`
 * finding one screen along (MEDIUM-2, task-9-review.md). A list that does not
 * name the book's journeys ONE FOR ONE is not an arrangement of the book — it
 * is a request to renumber half of it, or somebody else's row, or the same
 * journey twice. A subset finds exactly as many rows as it names, so the check
 * is against the book's OWN journeys ({@link BOOK_JOURNEYS_QUERY}) rather than
 * against the rows the list happens to name, and both directions are compared.
 *
 * ═══ EVERY PARSE IS AN INVERSION, AND EVERY REFUSAL IS A DEAD END ═══
 *
 * Said first, because it is the thing an author meets. This screen draws no
 * error when a save is refused — SCREENS.md §2.6 gives it none and the
 * prototype has none — so every refusal below arrives as an unhandled Server
 * Action error. `docs/deviations.md` §60 records the gap. The refusals stay,
 * because the alternative is storing a value the book cannot print: a page turn
 * outside the column's own `min`/`max` is a write Payload refuses anyway, one
 * layer further down and with a message naming a column.
 *
 * Not one of them lists what is bad. The journey order must BE one of
 * `JOURNEY_ORDER_MODES`, the cover cloth must BE a six-digit hex colour, and
 * each slider's value must BE inside the range the column declares.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — the global's shape stops here, and
 * the screen's actions speak in {@link BookSettings} and journey ids. DTO for
 * that interface, which is §2.6's card and not the `book` row.
 *
 * INVARIANT — nothing here writes a `book` column §2.6's card does not draw,
 * and nothing here writes any column of `journeys` but `order`. The cover copy
 * is §2.7's (`coverMutations.ts`); a journey's own content is §2.3's
 * (`notesMutations.ts`).
 * Depends on: zod, `payload` (types), `JOURNEY_ORDER_MODES`
 * (@travel-diary/domain/bookBundle), `FLIP_DURATION_MS`
 * (@travel-diary/domain/flip), `GALLERY_THUMB_SIZE`
 * (@travel-diary/domain/gallery), `isRowId` (@travel-diary/domain/ids),
 * `AdminScope` (./adminScope).
 */
import { JOURNEY_ORDER_MODES, type JourneyOrderMode } from '@travel-diary/domain/bookBundle'
import { FLIP_DURATION_MS } from '@travel-diary/domain/flip'
import { GALLERY_THUMB_SIZE } from '@travel-diary/domain/gallery'
import { isRowId } from '@travel-diary/domain/ids'
import type { Payload, Where } from 'payload'
import { z } from 'zod'
import type { AdminScope } from './adminScope'

/**
 * Which journeys are IN the book, spelled once.
 *
 * `readBookBundle.ts` reads published, not-deleted, not-archived journeys, and
 * SCREENS.md §2.6's list is "also the order of the book" — so the set this
 * screen arranges has to be that set exactly. A second `where` here would be a
 * second answer to "which journeys does the book contain", and the two would
 * disagree the first time either moved.
 *
 * EXPORTED so `readBookScreen.ts` draws the same rows this module renumbers,
 * and so the integration test can ask the same question the write asks.
 */
export const BOOK_JOURNEYS_QUERY = Object.freeze({
  collection: 'journeys',
  depth: 0,
  pagination: false,
  limit: 1000,
  where: {
    and: [{ _status: { equals: 'published' } }, { deletedAt: { equals: null } }, { archived: { not_equals: true } }],
  } satisfies Where,
} as const)

/**
 * The most journeys one call may arrange.
 *
 * A CHOSEN CEILING, AND NOTHING DERIVES IT. SCREENS.md §2.6 specifies no cap,
 * so this number is this implementation's: it bounds what one unattended `POST`
 * can renumber, and it sits far above the handoff's ten journeys and above
 * {@link BOOK_JOURNEYS_QUERY}'s own `limit` of a thousand — which is what makes
 * it a guard on the body rather than a second opinion about the book's size.
 * Both sides of it are pinned by cases built from this constant, so the
 * boundary follows it wherever it is moved.
 */
export const MAX_BOOK_JOURNEYS = 1000

/** Everything SCREENS.md §2.6's Book settings card holds, in the shape the global stores it. */
export interface BookSettings {
  /** The right-aligned italic note in the Contents header — "this is the line the diary prints". */
  readonly contentsNote: string
  /** Which of the three chips is pressed. */
  readonly journeyOrderMode: JourneyOrderMode
  /** The cover cloth, as a `#rrggbb` string. Also §2.7's four swatches. */
  readonly coverCloth: string
  /** How long one page takes to turn, inside {@link FLIP_DURATION_MS}. */
  readonly flipDurationMs: number
  /** The gallery grid's minimum tile track, inside {@link GALLERY_THUMB_SIZE}. */
  readonly galleryThumbPx: number
  /** Whether the cover's washi strip and airmail stamp are drawn. */
  readonly showDecorations: boolean
  /** Whether the ribbon bookmark is drawn. */
  readonly showRibbon: boolean
  /** Whether the `NN / NN` page counter is drawn. */
  readonly showCounter: boolean
}

/**
 * The cover cloth, as the four swatches post it.
 *
 * A SHAPE CHECK, NOT MEMBERSHIP OF THE PALETTE — `notesMutations.ts`'s `ACCENT`
 * reasoning, for the same two reasons in the same order. It has to be at least
 * this strict because the value is interpolated into a CSS declaration:
 * `Cover.tsx` sets `--cover-cloth` from it and `SignInShell.tsx` sets
 * `--sign-in-cloth`, so a value carrying a `)` or a `url(` is a `POST` writing
 * CSS into the diary and the sign-in screen. It must not be stricter, because
 * `coverCloths` is what the swatches OFFER today: a book whose stored cloth
 * predates a change to those four must still be savable, or its author cannot
 * edit anything else on the screen until somebody notices why.
 *
 * EXPORTED, and shared with `coverMutations.ts`, which is the one place in this
 * directory where two mutation modules share a schema. `mediaMutations.ts` and
 * `galleryMutations.ts` deliberately do NOT share their caps, because those two
 * numbers bound different things and a future task must be able to move one
 * without the other. This is the opposite case: it is literally the same column
 * of the same global, written by two screens' worth of identical swatches, so a
 * second copy would be a second answer to one question.
 */
export const COVER_CLOTH = z.string().regex(/^#[0-9a-fA-F]{6}$/u, { message: 'not a hex colour' })

/**
 * A journey id, as the bookmark list posts one.
 *
 * `notesMutations.ts`'s spelling, for its reason: `z.coerce.number()` first,
 * because a form body is text, and then `isRowId` rather than
 * `int().positive()`, because past 2^53 `Number` stops telling one integer from
 * the next and a crafted id would ask Postgres about a different row.
 */
const JOURNEY_REF = z.coerce.number().refine(isRowId, { message: 'not a row id' })

/** Every journey of the book, in the order the list now has them. */
const BOOKMARK_ORDER = z.array(JOURNEY_REF).min(1).max(MAX_BOOK_JOURNEYS)

/** What SCREENS.md §2.6's Book settings card amounts to. */
const BOOK_SETTINGS = z.object({
  contentsNote: z.string(),
  journeyOrderMode: z.enum(JOURNEY_ORDER_MODES),
  coverCloth: COVER_CLOTH,
  // `.int()` because the column is a whole number of milliseconds and the
  // slider steps in fifties; the bounds are the column's own, read from the
  // constant `apps/web/globals/book.schema.test.ts` compares it against.
  flipDurationMs: z.coerce.number().int().min(FLIP_DURATION_MS.min).max(FLIP_DURATION_MS.max),
  galleryThumbPx: z.coerce.number().int().min(GALLERY_THUMB_SIZE.min).max(GALLERY_THUMB_SIZE.max),
  showDecorations: z.boolean(),
  showRibbon: z.boolean(),
  showCounter: z.boolean(),
})

/**
 * Writes SCREENS.md §2.6's Book settings card.
 *
 * SIX COLUMNS OF THE `book` GLOBAL, NAMED. The other six are §2.7's and the
 * Publish screen's, and they survive this write because `updateGlobal` merges —
 * see this module's header, and the case that proves it.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}, spread into the call.
 * @param settings - The card's own eight controls.
 * @throws {z.ZodError} From the parse.
 * @throws From Payload, when the write is refused by the access rules.
 * @example
 * await saveBookSettings(payload, scope, { contentsNote: 'kept in a drawer', … })
 */
export const saveBookSettings = async (payload: Payload, scope: AdminScope, settings: BookSettings): Promise<void> => {
  const parsed = BOOK_SETTINGS.parse(settings)

  await payload.updateGlobal({ slug: 'book', ...scope, depth: 0, data: parsed })
}

/**
 * Writes the book's journey order, densely, from the order it was given.
 *
 * ═══ THE INDEX IN THE LIST BECOMES `journeys.order` ═══
 *
 * Which is the column `readBookBundle.ts` sorts by under
 * `journeyOrderMode: 'manual'` — so this is the write that makes the admin's
 * first row and the book's first journey the same trip. Under the other two
 * modes the column is written and the book ignores it, which is why
 * `readBookScreen.ts` offers no arrows there.
 *
 * ═══ TWO WRITES PER ROW THAT MOVED, BECAUSE `journeys` IS VERSIONED ═══
 *
 * `journeyMutations.ts`'s `writeJourneyFlag` shape, and its reasoning: Payload's
 * `updateByID` merges into the NEWEST VERSION whatever `draft` says, so a
 * one-line `update({ data: { order } })` on a journey with a pending draft would
 * write that unpublished text into the live row and stamp it
 * `_status: 'draft'` — which is the defect Task 4 paid two review rounds for on
 * this very collection. The live row is written from its own content first, and
 * the pending draft is then saved again with the same `order` on it, so the
 * author's unpublished edits stay reachable through `draft: true`.
 *
 * ONLY WHAT MOVED. A journey nudged one place changes two rows, not the book:
 * on a versioned collection every write mints a version row.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}, spread into every call.
 * @param order - Every journey in the book, in the new order, as the list sent them.
 * @throws {z.ZodError} From the parse.
 * @throws {Error} When the list is not a bijection onto the book's journeys — a
 *   repeat, a stranger, an omission, or a journey unpublished since the render.
 * @example
 * await saveBookmarkOrder(payload, scope, ['7', '4', '11'])
 */
export const saveBookmarkOrder = async (
  payload: Payload,
  scope: AdminScope,
  order: readonly string[],
): Promise<void> => {
  const ids = BOOKMARK_ORDER.parse(order)
  const current = await payload.find({ ...BOOK_JOURNEYS_QUERY, ...scope, sort: 'order', select: { order: true } })

  const held = new Map(current.docs.map((row) => [row.id, row.order]))
  const named = new Set(ids)

  // A BIJECTION, ASSERTED IN BOTH DIRECTIONS. A repeat makes the list longer
  // than the set it names; a stranger or an omission makes the set a different
  // size from the book, or a member of it absent from the book.
  if (named.size !== ids.length) {
    throw new Error(
      `saveBookmarkOrder: the order lists ${String(ids.length)} ids but only ${String(named.size)} distinct journeys`,
    )
  }
  if (named.size !== held.size || [...named].some((id) => !held.has(id))) {
    throw new Error(
      `saveBookmarkOrder: the order names ${String(named.size)} of the ${String(held.size)} journeys in the book, and must name each of them exactly once`,
    )
  }

  for (const [index, id] of ids.entries()) {
    if (held.get(id) === index) continue
    await writeJourneyPlace(payload, scope, id, index)
  }
}

/**
 * Writes one journey's `order` to its LIVE row without publishing anything.
 *
 * Extracted rather than inlined so {@link saveBookmarkOrder}'s loop reads as
 * the arrangement it is; the two-write shape and the reason for it are in that
 * function's own notes and in `journeyMutations.ts`'s `writeJourneyFlag`.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param id - The journey's row id.
 * @param place - Its new `order`.
 * @throws From Payload, when the write is refused by the access rules.
 */
const writeJourneyPlace = async (payload: Payload, scope: AdminScope, id: number, place: number): Promise<void> => {
  const [live, newest] = await Promise.all([
    payload.findByID({ collection: 'journeys', id, ...scope, depth: 0 }),
    payload.findByID({ collection: 'journeys', id, ...scope, depth: 0, draft: true }),
  ])

  await payload.update({ collection: 'journeys', id, ...scope, data: { ...live, order: place } })

  if (newest._status === 'draft') {
    await payload.update({
      collection: 'journeys',
      id,
      ...scope,
      draft: true,
      data: { ...newest, order: place },
    })
  }
}
