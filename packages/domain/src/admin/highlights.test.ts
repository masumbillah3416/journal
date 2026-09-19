/**
 * highlights.test.ts — the four-line cap SCREENS.md §2.3 prints as an
 * instruction and `apps/web/collections/journeys.ts` enforces as `maxRows`.
 *
 * ═══ THE CAP IS PINNED FROM BOTH SIDES, AND FROM BOTH ENDS ═══
 *
 * A cap that is only asserted by its refusal is half a cap: the case that
 * watches a fifth row bounce says nothing about whether a FOURTH is admitted,
 * and a function that refused everything would pass it. So the last accepted
 * value and the first refused one each get a case, and neither writes the
 * number down — they read {@link MAX_HIGHLIGHTS}, so raising the constant moves
 * both boundaries and the pair fails together rather than drifting apart.
 *
 * The other half of the agreement — that the SCHEMA caps at the same number —
 * cannot be asserted here, because `packages/domain` must never import from
 * `apps/`. It lives in `apps/web/collections/journeys.schema.test.ts`, which
 * may reach both.
 *
 * Depends on: vitest, ../testing/factories, ./highlights.
 */
import { describe, expect, it } from 'vitest'
import { aHighlight } from '../testing/factories'
import { MAX_HIGHLIGHTS, addHighlight, moveHighlight, removeHighlight } from './highlights'

describe('addHighlight', () => {
  it('refuses a fifth highlight, which the schema also refuses', () => {
    const four = [aHighlight('a'), aHighlight('b'), aHighlight('c'), aHighlight('d')]

    expect(addHighlight(four, aHighlight('e'))).toEqual(four)
  })

  it('accepts a fourth, so the cap is a cap and not a refusal', () => {
    const three = [aHighlight('a'), aHighlight('b'), aHighlight('c')]

    expect(addHighlight(three, aHighlight('d'))).toHaveLength(MAX_HIGHLIGHTS)
  })

  it('hands back the very list it was given when it refuses, never a copy of it', () => {
    const four = [aHighlight('a'), aHighlight('b'), aHighlight('c'), aHighlight('d')]

    expect(addHighlight(four, aHighlight('e'))).toBe(four)
  })

  it('puts the new row last, where the author was typing', () => {
    const added = addHighlight([aHighlight('a')], aHighlight('b'))

    expect(added.map((row) => row.id)).toEqual(['a', 'b'])
  })
})

describe('moveHighlight', () => {
  it('swaps a row with the one above it, addressed by id', () => {
    const rows = [aHighlight('a'), aHighlight('b'), aHighlight('c')]

    expect(moveHighlight(rows, 'b', 'up').map((row) => row.id)).toEqual(['b', 'a', 'c'])
  })

  it('swaps a row with the one below it, addressed by id', () => {
    const rows = [aHighlight('a'), aHighlight('b'), aHighlight('c')]

    expect(moveHighlight(rows, 'b', 'down').map((row) => row.id)).toEqual(['a', 'c', 'b'])
  })

  it('moves the row with the id given and not the row in that position', () => {
    const rows = [aHighlight('c'), aHighlight('a'), aHighlight('b')]

    expect(moveHighlight(rows, 'a', 'up').map((row) => row.id)).toEqual(['a', 'c', 'b'])
  })

  it('answers the list it was given when the first row is asked to go up', () => {
    const rows = [aHighlight('a'), aHighlight('b')]

    expect(moveHighlight(rows, 'a', 'up')).toBe(rows)
  })

  it('answers the list it was given when the last row is asked to go down', () => {
    const rows = [aHighlight('a'), aHighlight('b')]

    expect(moveHighlight(rows, 'b', 'down')).toBe(rows)
  })

  it('answers the list it was given for an id the list does not hold', () => {
    const rows = [aHighlight('a'), aHighlight('b')]

    expect(moveHighlight(rows, 'z', 'up')).toBe(rows)
  })
})

describe('removeHighlight', () => {
  it('drops the row with the id given and keeps the rest in order', () => {
    const rows = [aHighlight('a'), aHighlight('b'), aHighlight('c')]

    expect(removeHighlight(rows, 'b').map((row) => row.id)).toEqual(['a', 'c'])
  })

  it('drops nothing for an id the list does not hold', () => {
    const rows = [aHighlight('a'), aHighlight('b')]

    expect(removeHighlight(rows, 'z').map((row) => row.id)).toEqual(['a', 'b'])
  })

  it('makes room for another, so the cap counts what is left rather than what was added', () => {
    const four = [aHighlight('a'), aHighlight('b'), aHighlight('c'), aHighlight('d')]

    expect(addHighlight(removeHighlight(four, 'b'), aHighlight('e')).map((row) => row.id)).toEqual(['a', 'c', 'd', 'e'])
  })
})
