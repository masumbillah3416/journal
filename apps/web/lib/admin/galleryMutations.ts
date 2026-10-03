/**
 * galleryMutations — what SCREENS.md §2.5's controls do to the database, and
 * the Zod parses that stand between a `POST` and them.
 *
 * ═══ WHY THE DECISIONS ARE HERE AND NOT IN `actions.ts` ═══
 *
 * `mediaMutations.ts`'s reason, unchanged: a `'use server'` module carries a
 * whole-file `c8 ignore` in this repository because a Server Action needs a
 * request context no Vitest project has, so anything DECIDED there is decided
 * where nothing measures it. The actions module is the guard and the wiring;
 * the parses and the writes live here, behind a `Payload` parameter, and
 * `galleryMutations.integration.test.ts` executes them against a real Payload.
 *
 * ═══ NONE OF THIS NEEDS THE VERSIONED-WRITE DANCE ═══
 *
 * `pageMutations.ts`, `notesMutations.ts` and `slotMutations.ts` all write a
 * live row AND the pending draft in the same call, because `updateByID` calls
 * `getLatestCollectionVersion` with no `published` key and a plain update
 * therefore merges from the newest version whatever `draft` says. `media`
 * carries no `versions` block (`collections/media.ts`), so there is no newest
 * version to merge from and a plain update is the whole write. Said out loud
 * because three tasks in a row were bitten by the opposite.
 *
 * ═══ A REORDER TOUCHES ONLY THE ROWS THAT MOVED ═══
 *
 * Every row takes a DIFFERENT `order`, so this is the one write on this screen
 * that cannot be a single `where`-scoped `update`. {@link setFrameOrder} reads
 * the column first and writes only the rows whose position actually changed —
 * after a drag of one tile that is the span between where it left and where it
 * landed, not the whole gallery. The read is TWO queries — the
 * journey's pages, for the scrap its gallery rule excludes, and its frames —
 * over one journey's rows rather than the library's, and the writes are
 * bounded by the number of frames in ONE journey (design spec §12: ~100), not
 * by the size of the library. The property is observable:
 * `galleryMutations.integration.test.ts` reads `updatedAt` off a frame that
 * did not move and finds it untouched.
 *
 * ═══ AN ARRANGEMENT THAT IS NOT A BIJECTION REFUSES THE WHOLE WRITE ═══
 *
 * Standing orders, species 6: refuse what you do not recognise rather than
 * recognising what to refuse. {@link setFrameOrder} is handed a journey and a
 * list, and a list that does not name that journey's frames ONE FOR ONE is not
 * an arrangement of it — it is a request to renumber somebody else's gallery,
 * the same frame twice, or only half of one. Skipping the strangers would
 * write a partial arrangement and say nothing; the whole call refuses instead.
 *
 * THE FIRST VERSION OF THIS CHECK TESTED ONE DIRECTION OF THE BIJECTION and
 * said in this paragraph that it tested both. `current.docs.length !==
 * ids.length` against a `{ id: { in: ids } }` read catches a stranger and a
 * repeat — and a SUBSET finds exactly as many rows as it names, so a partial
 * arrangement was accepted and left two frames sharing `order: 0`.
 * The read is now of the journey's frames
 * themselves, by `../galleryFrames`'s own rule, and both directions are
 * compared.
 *
 * `CLAUDE.md` §1.1's rule about prose applies to this header: the
 * sentence above it was true of the intent and false of the code, which is the
 * species this paragraph now exists to record.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — the collection's shape stops here,
 * and the screen's actions speak in frame ids, journeys and captions.
 *
 * INVARIANT — nothing here deletes a media row, and nothing here writes
 * `media.journey`. §2.5 arranges a gallery; moving a photograph between
 * galleries is §2.4's "Move" (`mediaMutations.ts`).
 * Depends on: zod, `payload` (types), `ephemeraMediaIds`/`galleryFrameWhere`/
 * `journeyPagesQuery` (../galleryFrames), `AdminScope` (./adminScope).
 */
import type { Payload } from 'payload'
import { z } from 'zod'
import { ephemeraMediaIds, galleryFrameWhere, journeyPagesQuery } from '../galleryFrames'
import type { AdminScope } from './adminScope'

/**
 * The most frames one call may arrange or caption.
 *
 * A CHOSEN CEILING, AND NOTHING DERIVES IT. `SCREENS.md` §2.5 specifies no cap
 * at all, so this number is this implementation's: it bounds what one
 * unattended `POST` can rewrite, and it sits far enough above design spec
 * §12's "~100 assets per journey" that meeting it means something other than
 * an author is calling. It is the same number `mediaMutations.ts` chose for
 * the same reason, and it is NOT imported from there: that cap bounds a
 * selection across the whole library and this one bounds one journey's frames,
 * so a future task moving one must not silently move the other. Both sides of
 * this cap are pinned by cases built from this constant, so the boundary
 * follows it wherever it is moved.
 */
export const MAX_GALLERY_FRAMES = 500

/**
 * The frames an arrangement names.
 *
 * `min(1)` because an arrangement of no frames is a write with no subject.
 * `z.coerce.number()` for the same reason `mediaMutations.ts` uses it:
 * `Number('nonsense')` reaching the driver as `NaN` escapes as a raw
 * `Failed query` past whatever contract is above it.
 */
const FRAME_IDS = z.array(z.coerce.number().int().positive()).min(1).max(MAX_GALLERY_FRAMES)

/** One frame, for the writes that act on exactly one. */
const FRAME_REF = z.coerce.number().int().positive()

/** The journey an arrangement belongs to. */
const JOURNEY_REF = z.coerce.number().int().positive()

/** A caption or an alt text. Either may be blanked, so neither is `min(1)`. */
const TEXT = z.string()

/** §2.5's three toggles, as the panel sends them. */
const FLAGS = z.object({ hidden: z.boolean(), inBook: z.boolean() })

/**
 * A poster timestamp in seconds, or `null` for "first frame".
 *
 * NON-NEGATIVE, AND A REAL NUMBER. §2.5's filmstrip offers four grabs computed
 * from the clip's own length, so nothing an author can click produces anything
 * else — but an action is a `POST` endpoint of its own, and `Infinity` or `-1`
 * reaching a `numeric` column is a state the panel would then have to draw.
 * `.finite()` is NOT spelled out because zod 4's `z.number()` already refuses
 * `Infinity` and `NaN`, and a redundant call reads as a guard that is doing
 * something — measured, by loosening the schema and watching the case that
 * pins it.
 * There is no UPPER bound here and that is deliberate: the ceiling would be
 * the clip's `durationSec`, which is a column this write would have to read
 * first, and a poster past the end of a clip is a still frame nobody sees
 * rather than a wrong row.
 */
const POSTER_AT = z.number().nonnegative().nullable()

/** One row of §2.5's bulk caption panel. */
const BULK_CAPTION = z.object({ id: z.coerce.number().int().positive(), caption: TEXT })

/** Every row the bulk panel submitted, bounded like an arrangement. */
const BULK_CAPTIONS = z.array(BULK_CAPTION).min(1).max(MAX_GALLERY_FRAMES)

/** What §2.5's three toggles carry. */
export interface FrameFlags {
  /** Whether the frame is withheld from the public gallery. */
  readonly hidden: boolean
  /** Whether the frame is marked for the book. */
  readonly inBook: boolean
}

/** One row of §2.5's bulk caption panel, as the client sends it. */
export interface BulkCaption {
  /** The frame's row id, as a string. */
  readonly id: string
  /** What to write. An empty or blank one is left alone — see {@link applyBulkCaptions}. */
  readonly caption: string
}

/**
 * Writes one journey's arrangement, densely, from the order it was given.
 *
 * THE INDEX IN THE LIST BECOMES `media.order`, which is the column
 * `apps/web/lib/galleryFrames.ts`'s `GALLERY_FRAME_SORT` sorts a public
 * gallery by — so this is the write that makes the admin's first tile and the
 * gallery's first frame the same photograph.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}, spread into every call.
 * @param journey - The journey being arranged, as the client sent it.
 * @param order - Every one of that journey's frames, in the new order.
 * @throws {z.ZodError} From the parses.
 * @throws {Error} When the list is not a bijection onto that journey's gallery
 *   frames — a repeat, a stranger, an omission, or a frame that has since gone.
 *   See this module's header for why the whole call refuses.
 * @example
 * await setFrameOrder(payload, scope, '7', ['9', '4', '11'])
 */
export const setFrameOrder = async (
  payload: Payload,
  scope: AdminScope,
  journey: string,
  order: readonly string[],
): Promise<void> => {
  const ids = FRAME_IDS.parse(order)
  const owner = JOURNEY_REF.parse(journey)

  // THE JOURNEY'S OWN FRAMES, BY THE SAME RULE THE SCREEN DREW THEM WITH, and
  // not the rows the list happens to name. Reading `{ id: { in: ids } }` finds
  // exactly as many rows as a SUBSET names, so a partial arrangement was
  // accepted and left two frames sharing `order: 0` — after which
  // `GALLERY_FRAME_SORT`'s `id` tiebreak decided the public cover
  // (MEDIUM-2, task-9-review.md). It has to be the gallery-frame rule rather
  // than every `media` row of the journey, because a Notes page's decorative
  // scrap is a row of the journey and is not one of its frames; that is one
  // extra `pages` read per write, over one journey's three pages.
  const pages = await payload.find(journeyPagesQuery(owner))
  const current = await payload.find({
    collection: 'media',
    ...scope,
    depth: 0,
    pagination: false,
    where: galleryFrameWhere([owner], ephemeraMediaIds(pages.docs), { includeHidden: true }),
    // The only column this write compares against.
    select: { order: true },
  })

  const held = new Map(current.docs.map((row) => [row.id, row.order]))
  const named = new Set(ids)

  // A BIJECTION, ASSERTED IN BOTH DIRECTIONS. A repeat makes the list longer
  // than the set it names; a stranger or an omission makes the set a different
  // size from the gallery, or a member of it absent from the gallery.
  if (named.size !== ids.length) {
    throw new Error(
      `setFrameOrder: the arrangement lists ${String(ids.length)} ids but only ${String(named.size)} distinct frames`,
    )
  }
  if (named.size !== held.size || [...named].some((id) => !held.has(id))) {
    throw new Error(
      `setFrameOrder: the arrangement names ${String(named.size)} of the ${String(held.size)} frames in journey ${String(owner)}, and must name each of them exactly once`,
    )
  }
  for (const [index, id] of ids.entries()) {
    // ONLY WHAT MOVED. A drag of one tile changes the span it crossed and
    // nothing else; rewriting every row would touch `updatedAt` on a whole
    // gallery to record that one photograph moved.
    if (held.get(id) === index) continue
    await payload.update({ collection: 'media', ...scope, depth: 0, id, data: { order: index } })
  }
}

/**
 * Writes one frame's caption and alt text.
 *
 * BOTH IN ONE CALL, because §2.5's panel has one "Save frame" beneath both
 * fields. Either may be blanked: an author removing a caption is a thing an
 * author can want.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param id - The frame, as the client sent it.
 * @param caption - The caption the gallery prints. `''` clears it.
 * @param alt - What the frame says it is to a reader who cannot see it.
 * @throws {z.ZodError} From the parses, and from Payload when refused.
 * @example
 * await setFrameText(payload, scope, '9', 'The last morning in Kyoto', 'A quiet street at dawn')
 */
export const setFrameText = async (
  payload: Payload,
  scope: AdminScope,
  id: string,
  caption: string,
  alt: string,
): Promise<void> => {
  await payload.update({
    collection: 'media',
    ...scope,
    depth: 0,
    id: FRAME_REF.parse(id),
    data: { caption: TEXT.parse(caption), alt: TEXT.parse(alt) },
  })
}

/**
 * Writes one frame's two column toggles.
 *
 * TWO, NOT THREE. §2.5's panel draws "Hidden from the gallery", "Use as
 * gallery cover" and "Also place in the book"; the middle one is not a column
 * at all, because §2.5 also says "The first frame is the gallery cover" — so
 * it is dispatched as a {@link setFrameOrder} that moves the frame to the
 * front, and `docs/deviations.md` records the reading.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param id - The frame, as the client sent it.
 * @param flags - See {@link FrameFlags}.
 * @throws {z.ZodError} From the parses, and from Payload when refused.
 * @example
 * await setFrameFlags(payload, scope, '9', { hidden: true, inBook: false })
 */
export const setFrameFlags = async (
  payload: Payload,
  scope: AdminScope,
  id: string,
  flags: FrameFlags,
): Promise<void> => {
  const parsed = FLAGS.parse(flags)
  await payload.update({
    collection: 'media',
    ...scope,
    depth: 0,
    id: FRAME_REF.parse(id),
    data: { hidden: parsed.hidden, inBook: parsed.inBook },
  })
}

/**
 * Writes one clip's poster timestamp.
 *
 * THE COLUMN'S FIRST WRITER IN THIS REPOSITORY. `media.posterAt` has existed
 * since the schema was transcribed from `DATA_MODEL.md` and nothing has ever
 * set it; §2.5's Poster frame block is what makes it mean anything.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param id - The clip, as the client sent it.
 * @param seconds - Where the poster is taken from, or `null` for the first
 *   frame — which is the state §2.5's amber chip prints.
 * @throws {z.ZodError} From the parses, and from Payload when refused.
 * @example
 * await setPosterAt(payload, scope, '9', 11)
 */
export const setPosterAt = async (
  payload: Payload,
  scope: AdminScope,
  id: string,
  seconds: number | null,
): Promise<void> => {
  await payload.update({
    collection: 'media',
    ...scope,
    depth: 0,
    id: FRAME_REF.parse(id),
    data: { posterAt: POSTER_AT.parse(seconds) },
  })
}

/**
 * Writes §2.5's bulk caption panel, one caption per frame.
 *
 * A BLANK ROW IS LEFT ALONE, which is §2.5's own sentence: "Anything left
 * empty keeps its file name for now." The panel's inputs are placeholder-
 * hinted with a suggestion rather than pre-filled, so an untouched row arrives
 * empty — and writing `''` to every untouched row would CLEAR captions the
 * author never looked at, which is the opposite of what a panel headed
 * "Caption what is still blank" can mean.
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}.
 * @param captions - One row per frame the panel offered. See {@link BulkCaption}.
 * @throws {z.ZodError} From the parse, and from Payload when refused.
 * @example
 * await applyBulkCaptions(payload, scope, [{ id: '9', caption: 'Dawn' }, { id: '4', caption: '' }])
 */
export const applyBulkCaptions = async (
  payload: Payload,
  scope: AdminScope,
  captions: readonly BulkCaption[],
): Promise<void> => {
  for (const row of BULK_CAPTIONS.parse(captions)) {
    const caption = row.caption.trim()
    if (caption === '') continue
    await payload.update({ collection: 'media', ...scope, depth: 0, id: row.id, data: { caption } })
  }
}
