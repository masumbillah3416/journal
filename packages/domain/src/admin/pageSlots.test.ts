/**
 * pageSlots.test.ts — how many photo slots a page's editing pane draws, what
 * part each one plays, and what the label over it says.
 *
 * WHAT PRODUCED EACH SIDE: the expected counts are SCREENS.md §2.3's own — "two
 * slots (hero 186px, ephemera 124px)" for a Notes page and "four slots at
 * 152px" for a Frames page — and the roles are `pages.slots[].role`'s three
 * schema options (`apps/web/collections/pages.ts`). Nothing here is a number
 * this file invented.
 *
 * Depends on: vitest, ./pageSlots.
 */
import { describe, expect, it } from 'vitest'
import { mediaId, slotKey, type MediaId, type SlotKey } from '../ids'
import { HIGHEST_SLOT_CELL, heldMedia, selectedSlot, slotLabel, slotRolesFor } from './pageSlots'

/**
 * A branded cell key.
 * @param raw - The key as the pane spells it.
 * @returns The branded key.
 */
const aKey = (raw: string): SlotKey => {
  const built = slotKey(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/**
 * A branded media id.
 * @param raw - The id as Postgres would spell it.
 * @returns The branded id.
 */
const aMedia = (raw: string): MediaId => {
  const built = mediaId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

describe('slotRolesFor', () => {
  it('gives a Notes page the hero and the ephemera scrap, in that order', () => {
    // SCREENS.md §2.3: "two slots (hero 186px, ephemera 124px)". The ORDER is
    // load-bearing beyond the pane: `EphemeraSlot.tsx` looks its slot up by
    // `role`, but `FramesI.tsx` reads `page.slots?.[position]` by cell, so the
    // cell a role occupies is what the public book draws.
    expect(slotRolesFor('notes')).toEqual(['hero', 'ephemera'])
  })

  it('gives a Frames page four frames, which is what §2.3 draws', () => {
    expect(slotRolesFor('frames')).toEqual(['frame', 'frame', 'frame', 'frame'])
  })
})

describe('HIGHEST_SLOT_CELL', () => {
  it('is the last cell of the widest pane, so no drawn slot is outside it', () => {
    // BOTH SIDES OF THE GATE, AND IT MOVES WITH THE TABLE. The constant is
    // DERIVED from `slotRolesFor`, so a fifth frame added there widens the
    // refusal `apps/web/lib/admin/slotMutations.ts` applies without anybody
    // editing either. Comparing it against a literal `3` here would pin the
    // number instead of the relationship, and a fifth frame would then be a
    // cell the pane draws and the parse refuses.
    const widest = Math.max(slotRolesFor('notes').length, slotRolesFor('frames').length)

    expect(HIGHEST_SLOT_CELL).toBe(widest - 1)
  })

  it('admits the last cell the widest pane draws, and nothing past it', () => {
    expect(slotRolesFor('frames').length - 1).toBeLessThanOrEqual(HIGHEST_SLOT_CELL)
    expect(slotRolesFor('frames').length).toBeGreaterThan(HIGHEST_SLOT_CELL)
  })
})

describe('slotLabel', () => {
  it('names the hero and the scrap by what they are, not by a number', () => {
    expect(slotLabel('hero', 0)).toBe('Hero')
    expect(slotLabel('ephemera', 1)).toBe('Ephemera')
  })

  it('numbers the frames from one, because the author counts from one', () => {
    expect(slotLabel('frame', 0)).toBe('Frame 1')
    expect(slotLabel('frame', 3)).toBe('Frame 4')
  })
})

describe('selectedSlot', () => {
  it('takes a cell this page really draws', () => {
    expect(selectedSlot([{ key: aKey('7:0') }, { key: aKey('7:1') }], '7:1')).toBe('7:1')
  })

  it('refuses a cell of another page, which is an address anybody can type', () => {
    // THE INVERSION. `?slot=9:0` is a cell of a page this pane is not drawing,
    // so trusting it would point the pool at a frame the author cannot see.
    expect(selectedSlot([{ key: aKey('7:0') }], '9:0')).toBeNull()
  })

  it('chooses nothing when nothing is asked for, rather than the first cell', () => {
    // NO DEFAULT, deliberately: a tick with no frame chosen would put a
    // photograph somewhere nobody pointed at.
    expect(selectedSlot([{ key: aKey('7:0') }], undefined)).toBeNull()
  })

  it('takes the first of a repeated parameter, which is a shape a browser produces', () => {
    expect(selectedSlot([{ key: aKey('7:0') }, { key: aKey('7:1') }], ['7:1', '7:0'])).toBe('7:1')
  })
})

describe('heldMedia', () => {
  it('answers the ids the cells hold, and leaves an empty cell out', () => {
    expect([...heldMedia([{ media: aMedia('11') }, { media: null }, { media: aMedia('14') }])]).toEqual(['11', '14'])
  })

  it('counts one photograph placed in two cells once', () => {
    expect(heldMedia([{ media: aMedia('11') }, { media: aMedia('11') }]).size).toBe(1)
  })
})
