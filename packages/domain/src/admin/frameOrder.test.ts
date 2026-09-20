/**
 * frameOrder.test.ts — behaviour spec for SCREENS.md §2.5's three arrangement
 * rules: the drag, the date sort, and which frame the gallery leads with.
 *
 * Unit test (CLAUDE.md §2) — these are pure functions over a list, so every
 * case here is a list in and a list out, with no Payload and no DOM. Run by
 * `vitest.config.ts`'s `unit` project (`packages/*∕src/**∕*.test.ts`), which
 * `npm run verify` executes; it is NOT matched by
 * `vitest.integration.config.ts`, so naming that config for this file would
 * collect nothing and pass silently.
 *
 * ═══ EVERY CASE NAMES ITS FRAMES BY ID ═══
 *
 * §2.5's invariant is "select frames by id, not index", and it is stated about
 * the SCREEN. The pure functions below cannot hold that defect — they take
 * ids as parameters — so what they are asked here is the half that belongs to
 * them: that a move resolves its target against the list the move has already
 * left, and that the date sort's cover is whatever sorts first. The screen's
 * half is `FrameGrid.test.tsx`'s re-sort case.
 *
 * WHAT PRODUCED THE FIXTURE SHAPE: `capturedAt` is `media.capturedAt`, a
 * Payload `date` column filled from EXIF before stripping, so it is an ISO
 * string on a photograph that had one and `null` on everything else —
 * including every frame of a journey whose photographs were exported without
 * metadata. The garbage case below is the same column's other real state: EXIF
 * carries whatever the camera wrote, and `readGalleriesScreen` hands the
 * column over without re-deciding what a date is.
 * Depends on: vitest, ../ids, ./frameOrder.
 */
import { describe, expect, it } from 'vitest'
import { mediaId, type MediaId } from '../ids'
import { coverFrame, reorderFrames, sortFramesByDate, type Frame } from './frameOrder'

/**
 * A branded media id, unwrapped.
 * @param raw - The id as Postgres would spell it.
 * @returns The branded id.
 */
const anId = (raw: string): MediaId => {
  const built = mediaId(raw)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/**
 * One frame, with every field stated.
 * @param id - The media row's id.
 * @param order - The `media.order` column this frame carries.
 * @param capturedAt - The EXIF capture time, or `null` for a frame with none.
 * @returns A complete {@link Frame}.
 */
const aFrame = (id: string, order = 0, capturedAt: string | null = null): Frame => ({
  id: anId(id),
  order,
  capturedAt,
})

/** The ids of a list, which is what every case below compares. */
const idsOf = (frames: readonly Frame[]): readonly MediaId[] => frames.map((frame) => frame.id)

describe('reorderFrames', () => {
  it('moves a frame to sit before another, naming both by id', () => {
    const frames = [aFrame('a'), aFrame('b'), aFrame('c')]

    expect(idsOf(reorderFrames(frames, anId('c'), anId('a')))).toEqual([anId('c'), anId('a'), anId('b')])
  })

  it('moves a frame forward, resolving the target against the list the move has already left', () => {
    // THE MOVED FRAME IS REMOVED BEFORE THE TARGET IS FOUND. Here `a` sits
    // ahead of `c`, so `c`'s index in the original list (2) is one past its
    // index in the list without `a` (1) — an implementation that resolved the
    // target against the untouched array would drop `a` at the end.
    const frames = [aFrame('a'), aFrame('b'), aFrame('c')]

    expect(idsOf(reorderFrames(frames, anId('a'), anId('c')))).toEqual([anId('b'), anId('a'), anId('c')])
  })

  it('moves a frame to the end when nothing is named to sit before it', () => {
    const frames = [aFrame('a'), aFrame('b')]

    expect(idsOf(reorderFrames(frames, anId('a'), null))).toEqual([anId('b'), anId('a')])
  })

  it('moves a frame to the end when the frame it was to sit before is not in the list', () => {
    // A DROP ONTO SOMETHING THAT HAS SINCE GONE. The grid is a live list: a
    // frame can be hidden, moved to another journey or deleted between the
    // render a pointer started on and the one it finished on.
    const frames = [aFrame('a'), aFrame('b')]

    expect(idsOf(reorderFrames(frames, anId('a'), anId('gone')))).toEqual([anId('b'), anId('a')])
  })

  it('leaves the arrangement alone when the moved frame is not in the list', () => {
    const frames = [aFrame('a'), aFrame('b')]

    expect(idsOf(reorderFrames(frames, anId('gone'), anId('a')))).toEqual([anId('a'), anId('b')])
  })

  it('renumbers order densely, because the diary reads order and not position', () => {
    const reordered = reorderFrames([aFrame('a', 4), aFrame('b', 9)], anId('b'), anId('a'))

    expect(reordered.map((frame) => frame.order)).toEqual([0, 1])
  })

  it('renumbers order densely even when the move named a frame that is not there', () => {
    // The refusal arm still has to hand back a dense arrangement: the grid
    // draws the index badge off `order`, so a no-op that left `4` and `9` in
    // place would print "5" and "10" under two tiles.
    const reordered = reorderFrames([aFrame('a', 4), aFrame('b', 9)], anId('gone'), null)

    expect(reordered.map((frame) => frame.order)).toEqual([0, 1])
  })
})

describe('sortFramesByDate', () => {
  it('orders by capturedAt, and keeps a frame with no capture time last rather than first', () => {
    // `capturedAt` comes from EXIF and is absent on anything that had none
    // stripped from it. Sorting undefined first puts the least-known
    // photographs at the top of every gallery, which is the wrong default and
    // is invisible until real photographs arrive (design spec §14).
    const sorted = sortFramesByDate([aFrame('a', 0, null), aFrame('b', 1, '2025-03-01'), aFrame('c', 2, '2024-01-01')])

    expect(idsOf(sorted)).toEqual([anId('c'), anId('b'), anId('a')])
  })

  it('keeps an undated frame last however the arrangement arrived', () => {
    // THE SAME RULE FROM THE OTHER SIDE, and it is not a duplicate of the case
    // above: V8's sort only ever passes a later element as the comparator's
    // LEFT argument, so with the undated frame at the head of the list the
    // "left has no capture time" arm is never taken at all. An undated frame
    // in the middle is what takes it — and an author's library arrives in
    // whatever order `media.order` happens to hold.
    const sorted = sortFramesByDate([aFrame('b', 0, '2025-03-01'), aFrame('a', 1, null), aFrame('c', 2, '2024-01-01')])

    expect(idsOf(sorted)).toEqual([anId('c'), anId('b'), anId('a')])
  })

  it('treats a capture time it cannot read as no capture time at all', () => {
    // EXIF carries whatever the camera wrote. A string `Date.parse` cannot
    // read is not a date, and sorting on `NaN` would leave the comparator
    // answering `NaN` — which V8 takes as zero and which would leave the
    // arrangement depending on the order the rows arrived in.
    const sorted = sortFramesByDate([aFrame('a', 0, 'not a date'), aFrame('b', 1, '2024-01-01')])

    expect(idsOf(sorted)).toEqual([anId('b'), anId('a')])
  })

  it('keeps two frames with the same capture time in the arrangement they already had', () => {
    const sorted = sortFramesByDate([aFrame('a', 0, '2025-03-01'), aFrame('b', 1, '2025-03-01')])

    expect(idsOf(sorted)).toEqual([anId('a'), anId('b')])
  })

  it('keeps two frames with no capture time in the arrangement they already had', () => {
    const sorted = sortFramesByDate([aFrame('a'), aFrame('b')])

    expect(idsOf(sorted)).toEqual([anId('a'), anId('b')])
  })

  it('keeps the cover rule — the cover is whatever sorts first — so the cover follows the sort', () => {
    // The cover DOES change here, from `a` to `b`, and that is the point: what
    // does not change is the rule. §2.5 draws the "Cover" chip on the first
    // tile, so a sort that left the cover behind would put the chip on a frame
    // the gallery does not lead with.
    const sorted = sortFramesByDate([aFrame('a', 0, '2025-03-01'), aFrame('b', 1, '2024-01-01')])

    expect(coverFrame(sorted)).toBe(anId('b'))
  })
})

describe('coverFrame', () => {
  it('has no cover for a journey with no frames at all', () => {
    expect(coverFrame([])).toBeUndefined()
  })
})
