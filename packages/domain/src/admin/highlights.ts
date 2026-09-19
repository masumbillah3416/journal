/**
 * highlights — the Notes page's highlight list, and the cap three documents
 * agree on.
 *
 * ═══ FOUR IS A LAYOUT FACT, NOT A PREFERENCE ═══
 *
 * `DATA_MODEL.md` caps `highlights` at four "in the schema, not just the UI —
 * the notes page layout is tuned for 3–4 and a fifth breaks its rhythm", and
 * SCREENS.md §2.3 prints the instruction "four maximum — they set the page
 * rhythm". {@link MAX_HIGHLIGHTS} is the third place that number exists, and
 * the agreement between it and `apps/web/collections/journeys.ts`'s `maxRows`
 * is asserted by `apps/web/collections/journeys.schema.test.ts` — from that
 * side, because this package must never import from `apps/`.
 *
 * ═══ EVERY OPERATION IS BY ID (CLAUDE.md §0.9) ═══
 *
 * A highlight row has no `order` column: its place IS its place in the array,
 * which is what the pane renders and what the save writes. But the row a `×` or
 * a grip was pressed on is named by its id, never by the index the pane
 * happened to draw it at — an index taken from a list that a concurrent save,
 * a filter or a re-sort could reshuffle moves a different row. `pageRail.ts`'s
 * `movePage` takes ids for the same reason one column along.
 *
 * ═══ A REFUSAL ANSWERS THE LIST IT WAS GIVEN ═══
 *
 * The same contract as `movePage`: the fifth highlight, the first row asked to
 * go up and an id nobody holds are not error states — they are buttons at the
 * edge of what the list allows. Returning the input (the SAME reference, not a
 * copy) lets the pane draw its controls unconditionally and lets a caller tell
 * "nothing changed" from "something did" without comparing contents.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Three pure functions over one
 * list, in the shape `pageRail.ts` already uses.
 *
 * INVARIANT — no function here ever returns more than {@link MAX_HIGHLIGHTS}
 * rows from a list that had no more than that. {@link addHighlight} is the only
 * one that grows the list, and it refuses at the cap.
 * Depends on: nothing.
 */

/**
 * How many highlight lines the Notes page holds.
 *
 * READ, NEVER RETYPED. `apps/web/collections/journeys.ts` sets `maxRows` to the
 * same number and `journeys.schema.test.ts` compares the two, so a change here
 * fails there until the schema follows.
 */
export const MAX_HIGHLIGHTS = 4

/** One line of the Notes page's highlight list. */
export interface Highlight {
  /**
   * The row's identity — Payload's own array-row `id` for a saved row, and a
   * minted one for a row the author has just added. Every operation here
   * addresses this and never an index.
   */
  readonly id: string
  /** What the line says, as the author typed it. */
  readonly text: string
}

/** Which way a highlight's grip moves it. */
export type HighlightDirection = 'up' | 'down'

/**
 * The list with one more line on the end, unless it is already full.
 *
 * AT THE END, because that is where the author's cursor goes next: the pane's
 * "Add highlight" sits below the last row, and a row appearing above it would
 * be a row they have to go and find.
 * @param rows - The highlights as they stand.
 * @param row - The line being added.
 * @returns The longer list, or `rows` itself when it already holds
 *   {@link MAX_HIGHLIGHTS}.
 * @example
 * addHighlight(three, { id: 'd', text: 'nineteen tarts' }) // four rows
 */
export const addHighlight = (rows: readonly Highlight[], row: Highlight): readonly Highlight[] =>
  rows.length >= MAX_HIGHLIGHTS ? rows : [...rows, row]

/**
 * The list with one line moved a place.
 *
 * @param rows - The highlights as they stand.
 * @param id - The row whose grip was used.
 * @param direction - Which way it goes.
 * @returns The new sequence — or `rows` itself when the move cannot happen (the
 *   end of the list, or an id the list does not hold).
 * @example
 * moveHighlight(rows, 'b', 'up') // b, a, c
 */
export const moveHighlight = (
  rows: readonly Highlight[],
  id: string,
  direction: HighlightDirection,
): readonly Highlight[] => {
  const from = rows.findIndex((row) => row.id === id)
  const to = direction === 'up' ? from - 1 : from + 1
  // One guard for three refusals, as `movePage` next door: `findIndex` answers
  // -1 for an id the list does not hold, which puts `to` out of bounds either
  // way, and the two ends of the list do the same.
  if (from === -1 || to < 0 || to >= rows.length) return rows

  const moved = [...rows]
  const mover = rows[from]
  const neighbour = rows[to]
  // Unreachable while the bounds check above holds — both indices are inside
  // the array it measured — and written rather than asserted because
  // CLAUDE.md §0.8 bans the `!` that would hide it.
  /* c8 ignore next */
  if (mover === undefined || neighbour === undefined) return rows
  moved[to] = mover
  moved[from] = neighbour
  return moved
}

/**
 * The list without the line the `×` was pressed on.
 *
 * An id the list does not hold removes nothing, rather than throwing: the pane
 * renders from a read that a concurrent save could have moved on from, and a
 * stale `×` should be a no-op and not a 500.
 * @param rows - The highlights as they stand.
 * @param id - The row to drop.
 * @returns The shorter list.
 * @example
 * removeHighlight(rows, 'b') // a, c
 */
export const removeHighlight = (rows: readonly Highlight[], id: string): readonly Highlight[] =>
  rows.filter((row) => row.id !== id)
