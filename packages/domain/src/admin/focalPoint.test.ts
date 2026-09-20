/**
 * focalPoint.test.ts — SCREENS.md §2.3's focal point: the formula, the pill it
 * prints, and the key each point is held under.
 *
 * WHAT PRODUCED EACH SIDE. The rects below are what
 * `Element.getBoundingClientRect()` returns — `left`/`top` in viewport
 * coordinates and `width`/`height` in CSS pixels — and the clicks are
 * `MouseEvent.clientX`/`clientY`, in the same coordinate space. The zero-size
 * rect is not invented either: an element behind `display: none` measures
 * `0x0`, which is what a slot in an unselected pane measures as.
 *
 * Depends on: vitest, @travel-diary/domain/ids, ./focalPoint.
 */
import { describe, expect, it } from 'vitest'
import { pageId, slotKey, type PageId } from '../ids'
import {
  FOCAL_NUDGE,
  focalPointFrom,
  focalPointLabel,
  isCentred,
  nudgeFocalPoint,
  sameFocalPoint,
  slotKeyFor,
} from './focalPoint'

/**
 * A branded page id.
 * @param raw - The id as Postgres would spell it.
 * @returns The branded id.
 */
const aPage = (raw: string): PageId => {
  const built = pageId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

describe('focalPointFrom', () => {
  it('turns a click at the middle of a box into 50, 50', () => {
    expect(focalPointFrom({ clientX: 150, clientY: 100 }, { left: 100, top: 50, width: 100, height: 100 })).toEqual({
      x: 50,
      y: 50,
    })
  })

  it('turns a click at the top-left corner into 0, 0 rather than into a negative', () => {
    expect(focalPointFrom({ clientX: 100, clientY: 50 }, { left: 100, top: 50, width: 100, height: 100 })).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('clamps a drag that left the box, in both directions', () => {
    const rect = { left: 100, top: 50, width: 100, height: 100 }

    expect(focalPointFrom({ clientX: -400, clientY: -400 }, rect)).toEqual({ x: 0, y: 0 })
    expect(focalPointFrom({ clientX: 9000, clientY: 9000 }, rect)).toEqual({ x: 100, y: 100 })
  })

  it('does not divide by a zero-width box, which is what a hidden slot measures as', () => {
    // An element behind `display: none` measures 0x0. Without this the value is
    // NaN, and NaN reaches `background-position` as an invalid declaration the
    // browser silently drops — a focal point that appears to save and does
    // nothing, which is the class of defect this screen exists to avoid.
    expect(focalPointFrom({ clientX: 10, clientY: 10 }, { left: 0, top: 0, width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('does not divide by a zero-HEIGHT box either, which a collapsed row measures as', () => {
    // THE OTHER HALF OF THE GUARD, and it is here because a guard written as
    // one `width === 0` check passes the case above while leaving `y` as NaN.
    // A slot in a `height: 0` row has a real width and no height.
    expect(focalPointFrom({ clientX: 60, clientY: 10 }, { left: 0, top: 0, width: 100, height: 0 })).toEqual({
      x: 60,
      y: 0,
    })
  })
})

describe('focalPointLabel', () => {
  it('says what SCREENS.md says when nothing is set', () => {
    expect(focalPointLabel(null)).toBe('centred — click to focus')
  })

  it('reads back the point, rounded, in the form SCREENS.md prints', () => {
    expect(focalPointLabel({ x: 25.4, y: 29.6 })).toBe('focus 25% 30%')
  })
})

describe('nudgeFocalPoint', () => {
  it('moves the point by what it is given, which is how a keyboard aims', () => {
    // WHY IT EXISTS AT ALL. The focal control is a `<button>`, so it is in the
    // tab order — and a click synthesised by Enter carries no pointer position.
    // The arrows are the keyboard's way to a real value
    // (docs/deviations.md §65).
    expect(nudgeFocalPoint({ x: 22, y: 78 }, { x: FOCAL_NUDGE, y: -FOCAL_NUDGE })).toEqual({ x: 23, y: 77 })
  })

  it('stops at the frame’s far edge rather than walking past it', () => {
    expect(nudgeFocalPoint({ x: 100, y: 100 }, { x: FOCAL_NUDGE, y: FOCAL_NUDGE })).toEqual({ x: 100, y: 100 })
  })

  it('stops at the frame’s near edge, which is the other side of the same gate', () => {
    expect(nudgeFocalPoint({ x: 0, y: 0 }, { x: -FOCAL_NUDGE, y: -FOCAL_NUDGE })).toEqual({ x: 0, y: 0 })
  })

  it('reaches each edge exactly from one step inside it', () => {
    // THE PERMITTED SIDE. A clamp that refused the last step would leave the
    // edges unreachable by keyboard, which is the defect one move along.
    expect(nudgeFocalPoint({ x: 100 - FOCAL_NUDGE, y: FOCAL_NUDGE }, { x: FOCAL_NUDGE, y: -FOCAL_NUDGE })).toEqual({
      x: 100,
      y: 0,
    })
  })

  it('shares the click’s own clamp, so the two cannot disagree about the frame', () => {
    // Both sides are computed: the left by the nudge, the right by the formula
    // §2.3 states, asked for a point far outside the box.
    const rect = { left: 0, top: 0, width: 100, height: 100 }

    expect(nudgeFocalPoint({ x: 100, y: 0 }, { x: 40, y: -40 })).toEqual(
      focalPointFrom({ clientX: 9000, clientY: -9000 }, rect),
    )
  })
})

describe('isCentred', () => {
  it('calls the schema default centred, so an untouched slot reads as unset', () => {
    // 50/50 IS THE COLUMN'S `defaultValue` (apps/web/collections/pages.ts), so
    // every slot the author has never clicked arrives here as 50/50 rather than
    // as null — which is why the pill needs this question answered at all.
    expect(isCentred({ x: 50, y: 50 })).toBe(true)
  })

  it('calls a point one percent off centre not centred', () => {
    expect(isCentred({ x: 50, y: 51 })).toBe(false)
    expect(isCentred({ x: 49, y: 50 })).toBe(false)
  })
})

describe('sameFocalPoint', () => {
  it('calls two readings of one stored point the same', () => {
    // WHY IT EXISTS. `SlotPanel` holds a pending edit against the value it was
    // made over, and drops it once the server's value for that cell has moved
    // — so "has it moved?" has to be asked of a pair, not of an identity: two
    // renders never hand over the same object.
    expect(sameFocalPoint({ x: 22, y: 78 }, { x: 22, y: 78 })).toBe(true)
  })

  it('notices a move in either component, not just the first', () => {
    expect(sameFocalPoint({ x: 22, y: 78 }, { x: 23, y: 78 })).toBe(false)
    expect(sameFocalPoint({ x: 22, y: 78 }, { x: 22, y: 79 })).toBe(false)
  })
})

describe('slotKeyFor', () => {
  it('keys a slot by its page and its cell, which is what keeps two pages apart', () => {
    // SCREENS.md §2.3: "Tokyo/Frames I must not share Tokyo/Frames II."
    expect(slotKeyFor(aPage('12'), 0)).not.toBe(slotKeyFor(aPage('13'), 0))
  })

  it('keys two cells of one page apart', () => {
    expect(slotKeyFor(aPage('12'), 0)).not.toBe(slotKeyFor(aPage('12'), 1))
  })

  it('spells the key the way SlotKey is documented, so a form field round-trips', () => {
    const built = slotKey('12:3')
    if (!built.ok) throw new Error(built.error)

    expect(slotKeyFor(aPage('12'), 3)).toBe(built.value)
  })
})
