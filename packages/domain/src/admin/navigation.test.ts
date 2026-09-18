/**
 * navigation.test.ts — behaviour spec for the admin rail's table and its two
 * lookups.
 *
 * Every case asserts a PROPERTY of the table rather than its contents: that no
 * entry escapes `/admin`, that ids and addresses are unique, that six sections
 * take six distinct colours, and that an address under an entry belongs to that
 * entry. A case naming a label would be a second spelling of the table and
 * would pass for any table at all.
 */
import { describe, expect, it } from 'vitest'
import { ADMIN_NAV, activeNavId, sectionColour } from './navigation'

describe('ADMIN_NAV', () => {
  it('addresses every screen under /admin, so no entry can point off the panel', () => {
    expect(ADMIN_NAV.every((entry) => entry.href === '/admin' || entry.href.startsWith('/admin/'))).toBe(true)
  })

  it('gives every entry a distinct id and a distinct address', () => {
    expect(new Set(ADMIN_NAV.map((entry) => entry.id)).size).toBe(ADMIN_NAV.length)
    expect(new Set(ADMIN_NAV.map((entry) => entry.href)).size).toBe(ADMIN_NAV.length)
  })
})

describe('sectionColour', () => {
  it('paints the book and cover screens the same blue, because SCREENS.md groups them', () => {
    expect(sectionColour('book')).toBe('#5a72a8')
  })

  it('paints trash in the muted brown it is given, not in a section colour reused from elsewhere', () => {
    expect(sectionColour('trash')).toBe('#736247')
    expect(
      new Set(['overview', 'journeys', 'media', 'book', 'settings', 'trash'].map((s) => sectionColour(s as never)))
        .size,
    ).toBe(6)
  })
})

describe('activeNavId', () => {
  it('marks the journeys entry active while the editor is open, because the editor is a journeys screen', () => {
    expect(activeNavId('/admin/journeys/7')).toBe(activeNavId('/admin/journeys'))
  })

  it('does not mark the overview active on every address just because its href is a prefix of them', () => {
    // `/admin` is a prefix of every other entry. A naive `startsWith` makes the
    // rail light two buttons at once, which is the defect this case exists for.
    expect(activeNavId('/admin/media')).not.toBe(activeNavId('/admin'))
  })

  it('returns undefined for an address no entry owns', () => {
    expect(activeNavId('/admin/nothing-here')).toBeUndefined()
  })
})
