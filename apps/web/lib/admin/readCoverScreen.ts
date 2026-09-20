/**
 * readCoverScreen — everything SCREENS.md §2.7 draws, in four queries.
 *
 * ═══ THE PREVIEW IS DRAWN FROM WHAT THE BOOK WILL PRINT ═══
 *
 * §2.7's 172x224px preview shows the cover, so it is fed the same four fields
 * and the same cloth the Cover page reads off the `book` global, narrowed the
 * same way. Its title is sized by `fitPreviewTitleSize`
 * (@travel-diary/domain/coverTitle) — the module SCREENS.md §1.1's "Title must
 * fit, not truncate" is implemented in — so the preview cannot flatter a title
 * the page would have to shrink.
 *
 * ═══ THE PORTRAIT AND ITS REPLACEMENTS ARE TWO DIFFERENT READS ═══
 *
 * The portrait itself is read BY ID, because the `about` global names it; the
 * replacements the select offers are the newest {@link MAX_PORTRAIT_CHOICES}
 * ready photographs. The two are separate deliberately, and folding them into
 * one capped read was tried and rejected: the cap is applied to the whole
 * result, so a portrait older than the newest sixty would have fallen off the
 * end of its own `or` clause and the mount would have drawn empty. Read by id,
 * it is drawn whether or not it is still offered. See `docs/deviations.md` §83
 * for why Replace is a select at all.
 *
 * ═══ A DERIVATIVE, NEVER THE ORIGINAL ═══
 *
 * CLAUDE.md §6. The `thumb` tier is 400px square and serves both the 140px
 * portrait and the select's own rows; nothing here reads `media.url`.
 *
 * ═══ FOUR QUERIES, WHATEVER THE SIZE OF THE LIBRARY ═══
 *
 * One `findGlobal` for the cover copy, one for the About content, one `find`
 * for the capped choice list and one for the portrait — and the last is skipped
 * outright when the global names no portrait, so a diary that has never set one
 * costs three. None of them grows with the library. All four set `depth: 0`
 * and name the columns they read (CLAUDE.md §7).
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — one module owns how this screen's
 * data is fetched and shaped, and no component sees a Payload document. DTO:
 * {@link CoverScreenView} is the screen's two cards, not two global rows.
 *
 * INVARIANT — {@link AboutCardContent.paragraphs} always has exactly
 * `ABOUT_PARAGRAPHS` entries, padded from the stored array, because §2.7 draws
 * that many boxes whatever the global holds and `coverMutations.ts`'s parse
 * refuses any other count. A read that answered fewer would post fewer.
 * Depends on: `fitPreviewTitleSize` (@travel-diary/domain/coverTitle), `payload`
 * (types), `AdminScope` (./adminScope), `ABOUT_PARAGRAPHS`/`CoverFields`
 * (./coverMutations).
 */
import { fitPreviewTitleSize } from '@travel-diary/domain/coverTitle'
import type { Payload } from 'payload'
import type { AdminScope } from './adminScope'
import { ABOUT_PARAGRAPHS, type CoverFields } from './coverMutations'

/**
 * The most replacement portraits the select offers.
 *
 * A CHOSEN CEILING, AND NOTHING DERIVES IT. SCREENS.md §2.7 names no cap
 * because its Replace button opens nothing at all (`docs/deviations.md` §83).
 * This bounds the markup one render can emit — design spec §12 puts the corpus
 * at ~100 assets per journey and the handoff at ten journeys, so an uncapped
 * select would be a thousand `<option>`s on a screen whose subject is four text
 * fields. Both sides of it are pinned by cases built from this constant.
 */
export const MAX_PORTRAIT_CHOICES = 60

/** One photograph the Replace select offers. */
export interface PortraitChoice {
  /** The media row's id, which is what the select posts. */
  readonly id: string
  /** The filename, which is what an author recognises it by. */
  readonly filename: string
}

/** What SCREENS.md §2.7's Cover card draws. */
export interface CoverCardContent extends CoverFields {
  /** The preview title's font size in px, from the diary's own fitter. */
  readonly titleSizePx: number
}

/** What SCREENS.md §2.7's About card draws. */
export interface AboutCardContent {
  /** The 140px portrait's derivative URL, or `null` when none is set or none was made. */
  readonly portraitSrc: string | null
  /** What the portrait says it is, for a reader who cannot see it. */
  readonly portraitAlt: string
  /** Exactly `ABOUT_PARAGRAPHS` boxes, padded from the stored array. */
  readonly paragraphs: readonly string[]
  /** The Kit list, as stored. The card draws one input per line plus one empty. */
  readonly kit: readonly string[]
  /** The address under "Write to me". */
  readonly replyTo: string
  /** The photographs Replace offers, newest first. */
  readonly choices: readonly PortraitChoice[]
}

/** Everything SCREENS.md §2.7 draws. */
export interface CoverScreenView {
  /** The Cover card. */
  readonly cover: CoverCardContent
  /** The About card. */
  readonly about: AboutCardContent
}

/** The columns the Cover card reads back off the `book` global. */
const COVER_SELECT = { title: true, subtitle: true, owner: true, yearsShown: true, coverCloth: true } as const

/** The columns the About card reads back off the `about` global. */
const ABOUT_SELECT = { portrait: true, paragraphs: true, kit: true, replyTo: true } as const

/**
 * The `thumb` derivative of a media row, or `null`.
 *
 * NEVER `media.url` (CLAUDE.md §6). `null` is an ordinary state: an upload
 * smaller than the tier produces no `thumb` at all, and the card draws an empty
 * mount rather than a broken image.
 * @param sizes - The derivative map as Payload returned it.
 * @returns The URL, or `null`.
 */
const thumbOf = (sizes: { readonly thumb?: { readonly url?: string | null } } | undefined): string | null => {
  const url = sizes?.thumb?.url
  return typeof url === 'string' && url !== '' ? url : null
}

/**
 * The lines of an `about` array field, as stored.
 * THE `null` ARM IS A TYPE OBLIGATION THIS DATABASE CANNOT REACH, and that was
 * measured rather than assumed: Payload answers `[]` for an array field with no
 * rows, and REFUSES a write of `null` to one outright — `updateGlobal` with
 * `paragraphs: null` throws "Cannot use 'in' operator to search for '$push' in
 * null" out of the drizzle adapter. `readMediaScreen.ts` carries the same arm
 * with the same reason.
 * @param rows - `paragraphs` or `kit`, as `findGlobal` returns them.
 * @returns The lines, blanks included — a row an editor cleared reads as `''`
 *   rather than disappearing, so the card's boxes keep their places.
 */
const linesOf = (rows: readonly { readonly text?: string | null }[] | null | undefined): readonly string[] => {
  /* c8 ignore next -- see this function's doc comment: the `null` arm is a type obligation Payload cannot reach. */
  const stored = rows ?? []
  return stored.map((row) => row.text ?? '')
}

/**
 * Everything SCREENS.md §2.7 draws, in four queries.
 *
 * @param payload - The Local API instance.
 * @param scope - The hoisted {@link AdminScope}, spread into every call.
 * @returns The two cards.
 * @throws From Payload, when a read is refused by the access rules.
 * @example
 * const view = await readCoverScreen(await getPayload(), scope)
 */
export const readCoverScreen = async (payload: Payload, scope: AdminScope): Promise<CoverScreenView> => {
  const [book, about] = await Promise.all([
    payload.findGlobal({ slug: 'book', ...scope, depth: 0, select: COVER_SELECT }),
    payload.findGlobal({ slug: 'about', ...scope, depth: 0, select: ABOUT_SELECT }),
  ])

  // The `depth: 0` above means Payload answers this upload relationship as a row
  // id, never as a populated document, so the second arm of the `typeof` is
  // unreachable from this call site. It is written rather than asserted away
  // because the generated type is a union and CLAUDE.md §0.8 bans the `!`;
  // `readMediaScreen.ts` carries the same arm for the same reason.
  /* c8 ignore next -- unreachable at `depth: 0`; see above */
  const portraitId = typeof about.portrait === 'number' ? about.portrait : (about.portrait?.id ?? null)
  const [photographs, portraitRow] = await Promise.all([
    payload.find({
      collection: 'media',
      ...scope,
      depth: 0,
      limit: MAX_PORTRAIT_CHOICES,
      sort: '-createdAt',
      // A CLIP IS NEVER OFFERED — §2.7's mount is a photograph — and a row the
      // pipeline has not finished has no derivative to draw.
      where: { and: [{ state: { equals: 'ready' } }, { kind: { equals: 'still' } }] },
      select: { filename: true },
    }),
    portraitId === null
      ? Promise.resolve(null)
      : payload.find({
          collection: 'media',
          ...scope,
          depth: 0,
          limit: 1,
          where: { id: { equals: portraitId } },
          select: { alt: true, sizes: true },
        }),
  ])

  const portrait = portraitRow?.docs[0]
  const stored = linesOf(about.paragraphs)

  return {
    cover: {
      title: book.title ?? '',
      subtitle: book.subtitle ?? '',
      owner: book.owner ?? '',
      yearsShown: book.yearsShown ?? '',
      coverCloth: book.coverCloth ?? '',
      titleSizePx: fitPreviewTitleSize(book.title ?? ''),
    },
    about: {
      portraitSrc: portrait === undefined ? null : thumbOf(portrait.sizes),
      portraitAlt: portrait?.alt ?? '',
      // PADDED TO THE NUMBER OF BOXES THE CARD DRAWS — see this module's
      // INVARIANT. A global holding one paragraph must still post two, or the
      // parse refuses the save the author made about the other one.
      paragraphs: Array.from({ length: ABOUT_PARAGRAPHS }, (_, index) => stored[index] ?? ''),
      kit: linesOf(about.kit),
      replyTo: about.replyTo ?? '',
      choices: photographs.docs
        .filter((doc) => doc.id !== portraitId)
        // `media` is an upload collection, so a stored row always has a
        // filename; the fallback exists because the generated type admits
        // `null` and an option with no label would be unpickable.
        /* c8 ignore next -- see above */
        .map((doc) => ({ id: String(doc.id), filename: doc.filename ?? String(doc.id) })),
    },
  }
}
