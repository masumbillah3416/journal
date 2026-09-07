/**
 * otpCells — how the six one-time-code cells (SCREENS.md §3 "2 · One-time
 * code") absorb a paste and move focus.
 *
 * State machine pattern (CLAUDE.md §3.3), applied to {@link nextCell}:
 * "which cell is focused" is a state with one live value, and `nextCell` is
 * its transition function, `(state, event) -> state`, at the same small
 * scale as `flip.ts`'s page-flip machine. {@link distributePaste} is not
 * itself an instance of the pattern — it is a plain pure function that maps
 * a pasted string straight to the six cells' new values with no state of
 * its own — and is co-located here rather than split out because both
 * functions serve the same component (`apps/web/components/auth/OtpCells.tsx`'s
 * `onPaste` and `onKeyDown` handlers) and neither holds any arithmetic of
 * its own: every decision either function makes is stated once, in the one
 * place a test can see every branch of it.
 *
 * WHY PASTE NEEDS ITS OWN HANDLER. Each cell is `maxLength="1"`, and the
 * browser truncates a pasted string to one character *before* the `change`
 * event fires — a reader who copies a six-digit code out of their email and
 * pastes it lands one digit in the focused cell and loses the rest, silently.
 * A reader typing the code digit-by-digit never hits this path; a reader
 * pasting it — the ordinary case for a code copied out of an email client —
 * always does. {@link distributePaste} is what a component's `onPaste`
 * handler calls after `preventDefault()`, so the pasted text reaches this
 * logic before the browser's own truncation can eat it.
 *
 * DISTRIBUTION RULE. A paste containing at least as many digits as there are
 * cells is treated as the whole code and fills from cell 0, regardless of
 * which cell was focused — pasting a code copied whole is the common case,
 * and a reader who clicked cell 4 first before pasting still means "this is
 * the code," not "start at cell 4." A shorter paste (a fragment — e.g. a
 * reader who selected only part of the code) fills from the cell that was
 * focused. Either way, digits that would land past the last cell are dropped
 * rather than wrapping or throwing — see the "ignores overflow" test in
 * `otpCells.test.ts` for both the full-length and the fragment case.
 * Depends on nothing.
 */

/**
 * Splits a pasted string across the OTP cells.
 *
 * @param raw - The pasted text, exactly as the clipboard delivered it —
 *   digits, letters, punctuation, whitespace, whatever a reader's email
 *   client rendered the code as.
 * @param focusedCell - The 0-based index of the cell that had focus when the
 *   paste happened.
 * @param cellCount - How many cells the code has (six, per SCREENS.md §3).
 * @returns One string per cell, `''` where no digit landed. Non-digit
 *   characters are stripped first, so a code copied with spaces or dashes
 *   still lands.
 * @example
 * distributePaste('123456', 3, 6) // ['1','2','3','4','5','6'] — whole code, starts at cell 0
 * distributePaste('45', 3, 6)     // ['','','','4','5',''] — fragment, starts at the focused cell
 */
export const distributePaste = (raw: string, focusedCell: number, cellCount: number): readonly string[] => {
  const digits = raw.replace(/\D/g, '')
  const cells = Array.from({ length: cellCount }, () => '')
  const startIndex = digits.length >= cellCount ? 0 : focusedCell

  for (let i = 0; i < digits.length; i += 1) {
    const cellIndex = startIndex + i
    if (cellIndex >= cellCount) break
    cells[cellIndex] = digits.charAt(i)
  }

  return cells
}

/** A keyboard interaction the OTP cells respond to. */
export type OtpCellEvent = 'digit' | 'backspace' | 'left' | 'right'

/** Options for {@link nextCell}, carrying its one non-obvious parameter by name. */
export interface NextCellOptions {
  /**
   * Whether the current cell holds no digit. Only consulted for
   * `backspace`: on an empty cell it retreats (there is nothing left in this
   * cell to clear); on a filled cell it clears in place and stays, so a
   * second Backspace is what moves focus back.
   */
  readonly cellIsEmpty: boolean
}

/**
 * Decides which cell has focus after one keyboard interaction.
 *
 * State machine pattern (CLAUDE.md §3.3): the six cells' focus is a state
 * with one live value — "which cell" — and this is its transition function,
 * `(state, event) -> state`, over the four events a reader can raise. It
 * takes no ownership of that state; the caller holds `current` and re-calls
 * this on every keystroke, same as `flip.ts`'s page-flip machine does for
 * its own state.
 *
 * The clearing itself — writing `''` into the current cell on a `backspace`
 * over a filled cell — is the caller's job; this function only ever answers
 * "which cell is focused now."
 *
 * @param event - What the reader did: typed a digit, pressed Backspace, or
 *   pressed an arrow key.
 * @param current - The 0-based index of the currently focused cell.
 * @param cellCount - How many cells the code has.
 * @param options - Named rather than a bare boolean (CLAUDE.md §3.2 bans
 *   boolean parameters in public APIs) — `nextCell(i, k, true)` reads as
 *   nothing at a call site, `nextCell(i, k, { cellIsEmpty: true })` does.
 * @returns The 0-based index of the cell that should be focused next. Never
 *   below `0` or at/above `cellCount` — neither end of the row overruns.
 * @example
 * nextCell('digit', 2, 6, { cellIsEmpty: false }) // 3 — typing advances
 * nextCell('backspace', 3, 6, { cellIsEmpty: true }) // 2 — empty cell, Backspace retreats
 * nextCell('backspace', 3, 6, { cellIsEmpty: false }) // 3 — filled cell, Backspace clears in place and stays
 */
export const nextCell = (
  event: OtpCellEvent,
  current: number,
  cellCount: number,
  { cellIsEmpty }: NextCellOptions,
): number => {
  switch (event) {
    case 'digit':
    case 'right':
      return Math.min(current + 1, cellCount - 1)
    case 'left':
      return Math.max(current - 1, 0)
    case 'backspace':
      return cellIsEmpty ? Math.max(current - 1, 0) : current
  }
}
