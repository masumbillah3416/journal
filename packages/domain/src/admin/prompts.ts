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
import { mediaId, type JourneyId, type MediaId } from '../ids'

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

/**
 * What one of this module's addresses asks the destination to open in.
 *
 * The other half of {@link prompts}: a link is only a deep link if the screen
 * it lands on reads it, and a writer and a reader that disagree about a
 * parameter's name are two modules that each look right on their own.
 * `prompts.test.ts` round-trips one through the other rather than asserting a
 * literal on both sides — `pendingChange.ts`'s `changeId`/`parsedChangeId`
 * shape, for the same reason.
 */
export interface PromptedSelection {
  /** The frame the destination selects, or `null` when none was named. */
  readonly frame: MediaId | null
  /** Whether §2.5's bulk caption panel opens expanded. */
  readonly captionAll: boolean
}

/** A row id as Postgres writes one: digits, no sign, no leading zero, not zero. */
const ROW = /^[1-9]\d*$/u

/** The one value {@link prompts} writes for the bulk panel. */
const CAPTION_ALL_ASKED = '1'

/**
 * The first value an address gives for a key.
 *
 * Next.js hands an ARRAY when a key repeats (`?frame=41&frame=67`), which is
 * an address anybody can type. Taking the first is the same refusal-free
 * reading `app/(admin)/admin/galleries/page.tsx` gives `?journey=`: a 500 for
 * a malformed query string is worse than the default screen.
 * @param value - The entry as Next.js parsed it.
 * @returns The first value, or `undefined`.
 */
const first = (value: string | readonly string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : value?.[0]

/**
 * What one of §2.1's addresses asks §2.5's screen to open in.
 *
 * AN INVERSION (CLAUDE.md §3.3, `eslint-rules/guarded-server-actions.js`'s
 * doctrine): the frame must BE a row id Postgres could have minted, rather
 * than not be one of a list of spellings to reject — `041` is refused as well
 * as `41x`, because a second spelling of one row is a second address for one
 * frame. The bulk panel opens for exactly the value this module writes and for
 * nothing else that happens to be truthy.
 *
 * @param query - The address's query string, as Next.js parsed it.
 * @returns See {@link PromptedSelection}. Nothing here throws: every field has
 *   an answer for an address that names nothing.
 * @example
 * promptedSelection({ frame: '41', captionAll: '1' }) // { frame: '41', captionAll: true }
 * promptedSelection({ frame: 'media-41' }) // { frame: null, captionAll: false }
 */
export const promptedSelection = (
  query: Readonly<Record<string, string | readonly string[] | undefined>>,
): PromptedSelection => {
  const asked = first(query['frame'])
  const branded = asked !== undefined && ROW.test(asked) ? mediaId(asked) : null

  return {
    frame: branded !== null && branded.ok ? branded.value : null,
    captionAll: first(query['captionAll']) === CAPTION_ALL_ASKED,
  }
}
