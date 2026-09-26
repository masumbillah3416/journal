/**
 * pendingChange — what a change waiting to go out IS, what it is called on the
 * wire, and the three strings the screens that count them print.
 *
 * ═══ TWO KINDS, BECAUSE TWO COLLECTIONS CAN HOLD AN UNPUBLISHED CHANGE ═══
 *
 * `DATA_MODEL.md` puts `versions: { drafts: true }` on `journeys` and on
 * `pages`, and on nothing else. A `media` row, the `book` global, the `about`
 * global and the `site` global are written LIVE — there is no newer version of
 * one for a Publish screen to hold back, and no "last publish" of one for a
 * change to be newer than. So a caption, an upload, a bookmark reorder and a
 * cover title reach a reader the moment they are saved, and cannot be pending.
 * {@link CHANGE_KINDS} is therefore two values rather than the six the task
 * brief named: the other four would be arms nothing can ever produce, covered
 * only by the fixtures written to cover them (standing orders, species 4).
 * `docs/deviations.md` §87 records what that costs the screen.
 *
 * ═══ THE ID IS THE TICK'S OWN VALUE, AND IT IS PARSED, NEVER TRUSTED ═══
 *
 * SCREENS.md §2.8's checkbox posts one string per row, so the id crosses a
 * `<form>` and comes back as text anybody can write. {@link parsedChangeId}
 * therefore inverts: the kind must BE one of {@link CHANGE_KINDS} and the row
 * must BE a row id Postgres could have minted, rather than a list of spellings
 * to reject. `journey:012` is refused as well as `media:12`, because a second
 * spelling of one row is a second id for one change and the selection is a set.
 *
 * ═══ THE LABEL'S INERT FORM IS A DECISION, NOT A SPEC VALUE ═══
 *
 * SCREENS.md §2.8 gives the button "Publish all 4" and "Publish 2 of 4" and
 * says it goes inert with a muted ring and `#8f836d` when nothing is ticked —
 * it does not say what the inert button READS. The handoff's prototype does:
 * `Travel Diary Admin.dc.html` computes
 * `pending.filter(c => c.included).length === pending.length ? 'Publish all ' +
 * pending.length : 'Publish ' + … + ' of ' + pending.length`, which answers
 * "Publish 0 of 4" for an untouched-to-empty selection. {@link
 * publishButtonLabel} follows that expression, with ONE departure it cannot
 * reach: its `pending` is a four-element literal, so `total === 0` never
 * happens there and the expression would answer "Publish all 0" — an inert
 * button offering to publish everything, on the screen an author sees straight
 * after publishing. Zero takes the "n of m" form here.
 *
 * ═══ THE SINGULAR IS OURS TOO ═══
 *
 * SCREENS.md §2.8 writes the headline as "{n} changes waiting" and the
 * prototype interpolates the count into that literal, so both print "1 changes
 * waiting". The template never reaches one; a real count does, every time an
 * author publishes all but one thing. Written in the singular here, and
 * recorded in `docs/deviations.md` §87.
 *
 * PATTERNS (CLAUDE.md §3.3): Value object — {@link PendingChange} is the shape
 * both SCREENS.md §2.1's "Waiting to go out" rows and §2.8's Changes card are
 * drawn from, and the id that addresses one is minted and parsed in one place.
 *
 * INVARIANT — every change is keyed by the JOURNEY it belongs to (CLAUDE.md
 * §0.9). Both kinds are journey-scoped: a `pages` row carries a required
 * `journey` relationship, so there is no pending change with no journey behind
 * it, and nothing here is addressed by a slug or by a position in a list.
 * Depends on: `JourneyId` (../ids).
 */
import type { JourneyId } from '../ids'

/**
 * The collections whose newest version can be a draft the public book has not
 * seen — which is the whole of what "waiting to go out" can mean here.
 *
 * A LIST RATHER THAN A UNION LITERAL, because {@link parsedChangeId} inverts
 * against it: a kind added here without a write path fails the round-trip case
 * rather than reaching Payload as a collection slug nothing checked.
 */
export const CHANGE_KINDS = ['journey', 'page'] as const

/** Which collection a pending change is a row of. Also the kind chip's word. */
export type ChangeKind = (typeof CHANGE_KINDS)[number]

/**
 * One row of SCREENS.md §2.8's Changes card, which is also one row of §2.1's
 * "Waiting to go out" list — the same data drawn twice.
 */
export interface PendingChange {
  /** What a tick posts. `<kind>:<row id>`; see {@link changeId}. */
  readonly id: string
  /** The kind chip's word, colour-coded by tone. */
  readonly kind: ChangeKind
  /** The journey this change belongs to. Everything is keyed by it (§0.9). */
  readonly journey: JourneyId
  /** That journey's gallery address, which is a path this change can affect. */
  readonly slug: string
  /** The change text, Garamond 17px — struck through when excluded. */
  readonly text: string
  /** The `{location}` half of the line beneath it — "Tokyo · notes". */
  readonly location: string
  /** The `{when}` half, already formatted. */
  readonly at: string
}

/**
 * The id a tick posts for one pending change.
 *
 * THE COLLECTION IS IN THE ID because `journeys` row 12 and `pages` row 12 are
 * two different changes, and the Changes card lists both in one form. Without
 * the kind, ticking one would publish the other.
 * @param kind - Which collection the row is in.
 * @param row - Its row id, as Postgres minted it.
 * @returns The id, e.g. `'journey:12'`.
 * @example
 * changeId('page', 41) // 'page:41'
 */
export const changeId = (kind: ChangeKind, row: number): string => `${kind}:${String(row)}`

/** A row id as Postgres writes one: digits, no sign, no leading zero, not zero. */
const ROW = /^[1-9]\d*$/u

/**
 * What one posted id names, or `null` when it names nothing this screen can
 * publish.
 *
 * AN INVERSION. The kind has to BE one of {@link CHANGE_KINDS} and the row has
 * to BE a row id — rather than a list of bad shapes, which passes the one
 * nobody listed. The `Number.isSafeInteger` check is the same one
 * `@travel-diary/domain/ids`' `isRowId` makes and for the same reason: past
 * 2^53 `Number` stops telling one integer from the next, so a crafted id would
 * publish a different row from the one it names.
 * @param posted - The id, exactly as the form carried it.
 * @returns The collection and the row, or `null`.
 * @example
 * parsedChangeId('journey:12') // { kind: 'journey', row: 12 }
 * parsedChangeId('media:12') // null - `media` holds no drafts
 */
export const parsedChangeId = (posted: string): { readonly kind: ChangeKind; readonly row: number } | null => {
  const parts = posted.split(':')
  const [rawKind, rawRow] = parts
  if (parts.length !== 2 || rawKind === undefined || rawRow === undefined) return null

  const kind = CHANGE_KINDS.find((known) => known === rawKind)
  if (kind === undefined || !ROW.test(rawRow)) return null

  const row = Number.parseInt(rawRow, 10)
  return Number.isSafeInteger(row) ? { kind, row } : null
}

/**
 * The word for a count of changes, in the number the count actually is.
 * @param count - How many.
 * @returns `'change'` or `'changes'`.
 */
const changeWord = (count: number): string => (count === 1 ? 'change' : 'changes')

/**
 * What SCREENS.md §2.8's primary button reads.
 *
 * @param total - How many changes are waiting.
 * @param ticked - How many of them are ticked to go out.
 * @returns The button's copy. See this module's header for where each form
 *   comes from and which of them is ours.
 * @example
 * publishButtonLabel(4, 4) // 'Publish all 4'
 * publishButtonLabel(4, 2) // 'Publish 2 of 4'
 */
export const publishButtonLabel = (total: number, ticked: number): string =>
  ticked === total && total > 0 ? `Publish all ${String(total)}` : `Publish ${String(ticked)} of ${String(total)}`

/**
 * SCREENS.md §2.8's Caveat 40px headline.
 * @param waiting - How many changes are waiting.
 * @returns e.g. `'4 changes waiting'`.
 * @example
 * publishHeadline(1) // '1 change waiting'
 */
export const publishHeadline = (waiting: number): string => `${String(waiting)} ${changeWord(waiting)} waiting`

/**
 * SCREENS.md §3.4's status line, which can name a real number from Phase 4
 * Task 11 onwards.
 *
 * `docs/deviations.md` §38 held the line to a sentence with no count in it,
 * because the count is the Publish screen's and no phase before this one could
 * compute it. It can now: `readPendingChanges` is the same read both screens
 * use. The prototype's own line is "Four changes are still unpublished from
 * your last session."; the trailing clause is not kept, because nothing
 * attributes a draft to the session that wrote it.
 * @param waiting - How many changes are waiting, from the same read the
 *   Publish screen draws.
 * @returns The line, with the number in it.
 * @example
 * unpublishedStatusLine(0) // 'Nothing is waiting to go out.'
 */
export const unpublishedStatusLine = (waiting: number): string =>
  waiting === 0
    ? 'Nothing is waiting to go out.'
    : `${String(waiting)} ${changeWord(waiting)} ${waiting === 1 ? 'is' : 'are'} still unpublished.`
