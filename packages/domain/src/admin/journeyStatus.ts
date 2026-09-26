/**
 * journeyStatus — the one word SCREENS.md §2.2's pill prints, derived from the
 * two facts the database actually stores.
 *
 * ═══ THE STATUS IS DERIVED BECAUSE NOTHING STORES IT ═══
 *
 * `apps/web/collections/journeys.ts` has `versions: { drafts: true }`, which
 * gives Payload's `_status` (`'draft'` or `'published'`), and an `archived`
 * checkbox. SCREENS.md §2.2 asks for FIVE chips over FOUR statuses, and
 * `'edited'` is in neither column: it is "published, and something newer is
 * not", which needs both facts at once. A screen that read `_status` alone
 * would call a journey with unpublished edits `'published'` — the exact state
 * SCREENS.md §2.8's "n changes waiting" counts, so the two screens would
 * disagree about one journey while both looked right on their own.
 *
 * ARCHIVED IS CHECKED FIRST, AND THAT IS THE DESIGN RATHER THAN AN ORDERING
 * CONVENIENCE. Archiving is a shelf, not a stage: SCREENS.md §2.2's row strip
 * offers Archive/Unarchive beside Duplicate, with no publishing in it, so a
 * journey keeps whatever version state it had while it sits there and gets it
 * back when it comes off. That is why `archived` shadows the other two rather
 * than being a fifth value they could reach.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. One derivation over three
 * booleans; naming a pattern for that would be cargo cult.
 *
 * INVARIANT — every value {@link JOURNEY_STATUS_FILTERS} offers but `'all'` is
 * one {@link journeyStatus} can return, so no chip on the screen selects an
 * empty set by construction. `journeyStatus.test.ts` asks the function rather
 * than a second list.
 * Depends on: nothing.
 */

/** The four words SCREENS.md §2.2's pill can print. */
export type JourneyStatus = 'draft' | 'published' | 'edited' | 'archived'

/** What the database holds about one journey's publication state. */
export interface JourneyVersionState {
  /** Payload's own `_status` for the row. */
  readonly status: 'draft' | 'published'
  /** Whether a draft version exists that is newer than the published one. */
  readonly hasNewerDraft: boolean
  /** The `archived` checkbox — a shelf, not a stage. */
  readonly archived: boolean
}

/**
 * The status one journey's row shows.
 *
 * @param row - See {@link JourneyVersionState}.
 * @returns The word the pill prints.
 * @example
 * journeyStatus({ status: 'published', hasNewerDraft: true, archived: false }) // 'edited'
 */
export const journeyStatus = ({ status, hasNewerDraft, archived }: JourneyVersionState): JourneyStatus => {
  if (archived) return 'archived'
  if (status === 'draft') return 'draft'
  return hasNewerDraft ? 'edited' : 'published'
}

/**
 * The five chips above the table, in the order SCREENS.md §2.2 prints them.
 *
 * `'all'` is first and is not a {@link JourneyStatus}: it selects everything
 * rather than matching a status, which is why the union is widened here rather
 * than a fifth status being invented for it.
 */
export const JOURNEY_STATUS_FILTERS: readonly ('all' | JourneyStatus)[] = [
  'all',
  'published',
  'edited',
  'draft',
  'archived',
]

/**
 * What SCREENS.md §2's header chip reads.
 *
 * ═══ IT SAYS WHAT IT COUNTS, WHICH §2's OWN WORDING DOES NOT ═══
 *
 * HANDOFF-DEVIATION (docs/deviations.md §91): §2 writes the chip as "n
 * unpublished", and the handoff's prototype computes it from the SAME list its
 * Publish screen counts (`pending.length`, rendered twice), so the two numbers
 * can never disagree there. Here they can. The chip is `readNavCounts`'
 * `unpublished` — live journeys whose `_status` is `draft`, which is
 * {@link journeyStatus}'s `'draft'` — and §2.8's headline is
 * `readPendingChanges().length`, every ROW whose newest version is a draft. A
 * diary with three journeys edited after publishing and one never published
 * drew **"1 unpublished" beside "4 changes waiting"** on one screen
 * (`docs/qa/2026-09-26-publish-sweep.md`, PUB-001).
 *
 * TWO NUMBERS ON ONE SCREEN DESCRIBING THE SAME THING DIFFERENTLY is the
 * defect this module was written to avoid, so one of them had to move. Making
 * the chip count the pending set is four more queries on twelve screens — the
 * rail is drawn on every one — and the chip is chrome that no screen owns. So
 * the LABEL moves instead: it is not wrong about anything once it says what it
 * counts, and it costs nothing.
 *
 * @param count - Live journeys that have never been published.
 * @returns The chip's copy, in the number the count actually is.
 * @example
 * draftJourneysChipLabel(1) // '1 journey never published'
 */
export const draftJourneysChipLabel = (count: number): string =>
  `${String(count)} ${count === 1 ? 'journey' : 'journeys'} never published`
