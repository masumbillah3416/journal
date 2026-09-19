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
import { HIGHEST_SLOT_CELL, slotLabel, slotRolesFor } from './pageSlots'

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
