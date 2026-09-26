/**
 * prompts — SCREENS.md §2.1's "Needs a look" card: what the diary is asking
 * the author to do next, and the address each request opens.
 *
 * ═══ A PROMPT IS A DEEP LINK OR IT IS NOTHING ═══
 *
 * §2.1 states it in bold: "**These must deep-link to the exact screen _and_
 * selection** — 'Pick posters' resolves the first clip with no poster and
 * selects it by id; 'Caption them' opens the bulk panel already expanded." A
 * prompt that lands on `/admin/galleries` and leaves the author to find the
 * frame is the defect that sentence exists to prevent, and it renders
 * perfectly — which is why `prompts.test.ts` reads the query string rather
 * than the label.
 *
 * ═══ EVERY LINK CARRIES THE JOURNEY AS WELL AS THE FRAME ═══
 *
 * §2.5's Galleries screen is journey-scoped and falls back to the first
 * journey for an address naming none, so `?frame=41` alone opens somebody
 * else's gallery and highlights its first tile. Both halves are always
 * present, which is also CLAUDE.md §0.9 applied to an address: the frame is
 * the selection, the journey is the screen.
 *
 * ═══ ONE PROMPT PER KIND, AND EACH NAMES ONE GALLERY ═══
 *
 * The prototype's card holds three sentences, each about one journey. A card
 * with one row per outstanding frame would be a list of the library rather
 * than a list of things to do, so each kind resolves to the FIRST outstanding
 * frame's journey and counts what is outstanding IN THAT JOURNEY. Counting the
 * whole diary while naming one gallery would be a sentence the data does not
 * support.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. A derivation over four facts,
 * and the addresses they resolve to.
 *
 * INVARIANT — every href this returns is an address `activeNavId` owns, so no
 * prompt can point at a screen the rail does not have. `prompts.test.ts`
 * asserts it against that function rather than against a second list of paths.
 * Depends on: `JourneyId`/`MediaId` (../ids).
 */
import type { JourneyId, MediaId } from '../ids'

/** Which of §2.1's four requests a prompt is. */
export type PromptKind = 'pick-posters' | 'caption-them' | 'no-alt-text' | 'nothing-published'

/** One row of the "Needs a look" card. */
export interface Prompt {
  /** Which request this is; also the card's React key. */
  readonly kind: PromptKind
  /** The sentence, Garamond 16.5px / 1.35. */
  readonly text: string
  /** The link beneath it, Courier 9.5px `.16em`. */
  readonly action: string
  /** Where it leads — the exact screen AND selection. */
  readonly href: string
}

/**
 * One gallery frame that needs something, with the journey it belongs to.
 *
 * THE JOURNEY IS ON THE FRAME rather than beside the list, because a prompt's
 * address needs both and a list zipped against a parallel list of journeys
 * drifts the moment either drops an entry.
 */
export interface FrameNeed {
  /** The `media` row, which the destination selects by id. */
  readonly id: MediaId
  /** The journey whose gallery draws it (CLAUDE.md §0.9). */
  readonly journey: JourneyId
  /** That journey's name, which the sentence prints. */
  readonly journeyName: string
}

/** Everything §2.1's card decides from. */
export interface OverviewState {
  /** Clips with no poster frame chosen, in the gallery's own order. */
  readonly clipsWithoutPosters: readonly FrameNeed[]
  /** Gallery frames carrying no caption, in the same order. */
  readonly framesWithoutCaptions: readonly FrameNeed[]
  /** Gallery frames carrying no alt text, in the same order. */
  readonly framesWithoutAltText: readonly FrameNeed[]
  /** How many journeys a reader can actually see. Zero is its own prompt. */
  readonly publishedJourneys: number
}

/** §2.5's address, which three of the four prompts open. */
const GALLERIES = '/admin/galleries'

/** §2.8's address, which the fourth opens. */
const PUBLISH = '/admin/publish'

/**
 * A count in the register §2.1's prototype writes it in.
 *
 * "One clip", not "1 clip": the prototype's own sentences spell the small
 * numbers ("Three clips in the Marrakech gallery…"), and a template that
 * interpolated a bare `1` would print "1 clips" — the defect
 * `pendingChange.ts`'s `publishHeadline` was written in the singular for.
 * Beyond one the digit is clearer than the word, which is where the
 * prototype's own "twelve uncaptioned frames" is not followed.
 * @param count - How many.
 * @returns `'One'` or the digits.
 */
const spelled = (count: number): string => (count === 1 ? 'One' : String(count))

/**
 * The frames of one need that belong to the FIRST of them's journey.
 * @param needs - Every outstanding frame of one kind.
 * @returns The leading frame and the frames sharing its journey, or `null`.
 */
const leadingGallery = (
  needs: readonly FrameNeed[],
): { readonly first: FrameNeed; readonly inGallery: readonly FrameNeed[] } | null => {
  const [first] = needs
  if (first === undefined) return null

  return { first, inGallery: needs.filter((need) => need.journey === first.journey) }
}

/**
 * The address of one frame, on the screen that edits it.
 * @param need - The frame.
 * @param extra - Anything else the destination has to open in.
 * @returns The path and its query string.
 */
const galleryAddress = (need: FrameNeed, extra: Readonly<Record<string, string>> = {}): string => {
  const query = new URLSearchParams({ journey: need.journey, ...extra })
  // The frame is last so the address reads screen, then selection.
  query.set('frame', need.id)

  return `${GALLERIES}?${query.toString()}`
}

/**
 * What SCREENS.md §2.1's "Needs a look" card asks for, in the order it prints.
 *
 * @param state - See {@link OverviewState}.
 * @returns At most one {@link Prompt} per {@link PromptKind}; an empty list
 *   for a published diary with nothing outstanding, which the card draws as
 *   nothing rather than as an empty card.
 * @example
 * prompts({ clipsWithoutPosters: [clip], framesWithoutCaptions: [], framesWithoutAltText: [], publishedJourneys: 4 })
 */
export const prompts = (state: OverviewState): readonly Prompt[] => {
  const posters = leadingGallery(state.clipsWithoutPosters)
  const captions = leadingGallery(state.framesWithoutCaptions)
  const alt = leadingGallery(state.framesWithoutAltText)

  return [
    ...(posters === null
      ? []
      : [
          {
            kind: 'pick-posters' as const,
            text: `${spelled(posters.inGallery.length)} clip${posters.inGallery.length === 1 ? '' : 's'} in the ${
              posters.first.journeyName
            } gallery ${posters.inGallery.length === 1 ? 'has' : 'have'} no poster frame chosen.`,
            action: 'Pick posters',
            href: galleryAddress(posters.first),
          },
        ]),
    ...(captions === null
      ? []
      : [
          {
            kind: 'caption-them' as const,
            text: `${captions.first.journeyName} has ${
              captions.inGallery.length === 1 ? 'one' : String(captions.inGallery.length)
            } uncaptioned frame${captions.inGallery.length === 1 ? '' : 's'} in its gallery.`,
            action: 'Caption them',
            // THE BULK PANEL, ASKED FOR IN THE ADDRESS — §2.1's own words,
            // "opens the bulk panel already expanded". The frame rides along
            // so the panel opens over the right selection rather than the
            // gallery's first tile.
            href: galleryAddress(captions.first, { captionAll: '1' }),
          },
        ]),
    ...(alt === null
      ? []
      : [
          {
            kind: 'no-alt-text' as const,
            text: `${spelled(alt.inGallery.length)} frame${alt.inGallery.length === 1 ? '' : 's'} in the ${
              alt.first.journeyName
            } gallery ${alt.inGallery.length === 1 ? 'has' : 'have'} no alt text.`,
            action: 'Add alt text',
            href: galleryAddress(alt.first),
          },
        ]),
    ...(state.publishedJourneys > 0
      ? []
      : [
          {
            kind: 'nothing-published' as const,
            text: 'Nothing has been published yet, so a reader opening the diary finds an empty book.',
            action: 'Review what is waiting',
            href: PUBLISH,
          },
        ]),
  ]
}
