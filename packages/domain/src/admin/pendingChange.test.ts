/**
 * pendingChange.test.ts — what a change waiting to go out is called, and what
 * the two screens that print a count of them say.
 *
 * THE LABEL IS A GATE, NOT DECORATION. SCREENS.md §2.8 gives the primary button
 * two forms and an inert state, and the inert state is reached by the same
 * arithmetic that picks between the forms — so every case below pins one side
 * of `ticked === total`, and the count-of-zero cases pin the two the handoff's
 * own prototype cannot reach with a four-element fixture.
 *
 * THE ID IS A TRUST BOUNDARY. A tick posts it, so `parsedChangeId` is asked
 * what it refuses as well as what it accepts — an inversion rather than an
 * enumeration (standing orders, species 6).
 * Depends on: vitest, ./pendingChange.
 */
import { describe, expect, it } from 'vitest'
import {
  CHANGE_KINDS,
  changeId,
  parsedChangeId,
  publishButtonLabel,
  publishHeadline,
  unpublishedStatusLine,
} from './pendingChange'

describe('publishButtonLabel', () => {
  it('says "Publish all n" when everything is ticked', () => {
    expect(publishButtonLabel(4, 4)).toBe('Publish all 4')
  })

  it('says "Publish n of m" when a subset is ticked', () => {
    expect(publishButtonLabel(4, 2)).toBe('Publish 2 of 4')
  })

  it('still names the total when nothing is ticked, because the button is inert and not blank', () => {
    expect(publishButtonLabel(4, 0)).toBe('Publish 0 of 4')
  })

  it('keeps the "n of m" form when there is nothing waiting at all, so an inert button never reads as an offer', () => {
    // THE ONE PLACE THIS PARTS FROM THE PROTOTYPE'S OWN EXPRESSION, which is
    // `ticked === total ? 'Publish all ' + total : …` and would answer
    // "Publish all 0" here. Its fixture is a four-element literal, so it never
    // reaches the state; this screen does, every time the author has just
    // published. See the module's own note.
    expect(publishButtonLabel(0, 0)).toBe('Publish 0 of 0')
  })

  it('says all of one rather than one of one, because the form does not change with the count', () => {
    expect(publishButtonLabel(1, 1)).toBe('Publish all 1')
  })
})

describe('publishHeadline', () => {
  it('counts what is waiting', () => {
    expect(publishHeadline(4)).toBe('4 changes waiting')
  })

  it('writes one change in the singular, which the handoff template never reaches', () => {
    expect(publishHeadline(1)).toBe('1 change waiting')
  })

  it('stays plural at nothing at all', () => {
    expect(publishHeadline(0)).toBe('0 changes waiting')
  })
})

describe('unpublishedStatusLine', () => {
  it('names the number when there is one', () => {
    expect(unpublishedStatusLine(4)).toBe('4 changes are still unpublished.')
  })

  it('writes one change in the singular', () => {
    expect(unpublishedStatusLine(1)).toBe('1 change is still unpublished.')
  })

  it('says so plainly when nothing is waiting, rather than printing a zero', () => {
    expect(unpublishedStatusLine(0)).toBe('Nothing is waiting to go out.')
  })
})

describe('changeId', () => {
  it('names the collection and the row, so two collections cannot mint the same id', () => {
    expect([changeId('journey', 12), changeId('page', 12)]).toEqual(['journey:12', 'page:12'])
  })

  it('round-trips through the parse for every kind there is', () => {
    // EVERY KIND, FROM THE LIST ITSELF. A seventh kind added without a parse
    // arm fails here rather than being found by the screen that draws it.
    expect(CHANGE_KINDS.map((kind) => parsedChangeId(changeId(kind, 7)))).toEqual(
      CHANGE_KINDS.map((kind) => ({ kind, row: 7 })),
    )
  })
})

describe('parsedChangeId', () => {
  it('reads the kind and the row a tick posted', () => {
    expect(parsedChangeId('journey:12')).toEqual({ kind: 'journey', row: 12 })
  })

  it.each([
    ['media:12', 'a kind no collection here can hold a draft of'],
    ['journey:0', 'a row id Postgres never mints'],
    ['journey:-3', 'a negative row id'],
    ['journey:1.5', 'a row id that is not whole'],
    ['journey:012', 'a row id with a leading zero, which is a second spelling of one row'],
    ['journey:9007199254740993', 'a row id past the point where Number stops telling integers apart'],
    ['journey', 'no row at all'],
    ['journey:12:extra', 'a third part nothing writes'],
    ['', 'an empty body'],
    ['JOURNEY:12', 'a kind in the wrong case'],
  ])('refuses %s — %s', (posted) => {
    expect(parsedChangeId(posted)).toBeNull()
  })
})
