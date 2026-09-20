/**
 * admin/frameOrder — SCREENS.md §2.5's three arrangement rules: the drag, the
 * date sort, and which frame the gallery leads with.
 *
 * ═══ PATTERN (CLAUDE.md §3.3) ═══
 *
 * None of the seven. Three total functions over a list.
 *
 * ═══ EVERY FRAME IS NAMED BY ITS ID, NEVER BY ITS POSITION ═══
 *
 * CLAUDE.md §0.9, and §2.5 states it in bold for this screen in particular.
 * {@link reorderFrames} takes the moved frame and the frame it is to sit
 * before as ids — so it cannot hold the positional defect §2.5 names, and it
 * is not where that defect would live. The defect lives in the caller that
 * REMEMBERS a selection across a re-sort, which is `FrameGrid.tsx`; this
 * module is what makes the re-sort happen, and `FrameGrid.test.tsx` is what
 * proves the selection survives it.
 *
 * ═══ `order` IS RENUMBERED DENSELY ON EVERY MOVE ═══
 *
 * The diary reads `media.order` and sorts by it (`apps/web/lib/galleryFrames.ts`'s
 * `GALLERY_FRAME_SORT`), so a position on this screen means nothing until it
 * is written to that column. Renumbering from zero on every move keeps the
 * index badge §2.5 draws and the column the gallery sorts by the same number,
 * and keeps a gallery that has been rearranged for a year from drifting into
 * sparse integers nobody can reason about.
 *
 * ═══ AN UNREADABLE CAPTURE TIME IS NO CAPTURE TIME ═══
 *
 * `media.capturedAt` is filled from EXIF before stripping, so its contents are
 * whatever the camera wrote. `Date.parse` answers `NaN` for a string it cannot
 * read, and `NaN` in a comparator is taken as zero — which would leave the
 * arrangement depending on the order the rows happened to arrive in. Such a
 * frame sorts with the undated ones instead, which is the same answer the
 * author already gets for a photograph whose metadata was stripped.
 *
 * ═══ INVARIANT A FUTURE EDIT COULD BREAK ═══
 *
 * {@link reorderFrames} always hands back every frame it was given, exactly
 * once. The moved frame is removed and re-inserted, so an edit that forgot the
 * removal would duplicate it and an edit that forgot the re-insertion would
 * lose it — and the write this feeds ({@link Frame.order}, per id) would then
 * silently renumber a gallery around a photograph that is in it twice or not
 * at all.
 * Depends on: MediaId, from ../ids. Pure otherwise.
 */
import type { MediaId } from '../ids'

/**
 * What an arrangement rule needs to know about one frame.
 *
 * NOT EVERYTHING A TILE DRAWS. The thumbnail, the filename and the caption are
 * `apps/web/lib/admin/readGalleriesScreen.ts`'s, which extends this — naming
 * them here would put a URL in the domain package, which is the line
 * `mediaFilters.ts`'s `MediaTile` already draws one module along.
 */
export interface Frame {
  /** The media row's own id. Every rule here names frames by this. */
  readonly id: MediaId
  /** The `media.order` column, which is what the diary sorts a gallery by. */
  readonly order: number
  /**
   * The EXIF capture time as an ISO string, or `null` for a frame that has
   * none — which is every photograph exported without metadata, and every
   * clip.
   */
  readonly capturedAt: string | null
}

/**
 * The capture time as milliseconds, or `null` when there is not one.
 *
 * @param frame - The frame being sorted.
 * @returns The instant, or `null` for an absent or unreadable capture time.
 */
const capturedMillis = (frame: Frame): number | null => {
  if (frame.capturedAt === null) return null
  const parsed = Date.parse(frame.capturedAt)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The same frames, with `order` renumbered densely from zero.
 *
 * @param frames - The arrangement, in the order it is to be written.
 * @returns The frames, each carrying its own index as `order`.
 */
const renumbered = <T extends Frame>(frames: readonly T[]): readonly T[] =>
  frames.map((frame, index) => ({ ...frame, order: index }))

/**
 * Moves one frame to sit immediately before another, or to the end.
 *
 * ═══ GENERIC OVER THE CALLER'S ROW, DELIBERATELY ═══
 *
 * The screen's rows carry a thumbnail, a filename and a caption this module
 * has no business knowing about, and a signature returning bare {@link Frame}s
 * would make every caller re-join its own rows to the answer by id — which is
 * a second place for the arrangement to be decided. `T extends Frame` keeps
 * the rule here and the row shape at the caller.
 *
 * @param frames - The arrangement as it stands.
 * @param moved - The frame being dragged, by id.
 * @param before - The frame it is to sit before, by id, or `null` for the end.
 * @returns The new arrangement, renumbered densely — every frame that came in,
 *   exactly once. A `moved` or `before` naming a frame that is not in the list
 *   is not an error: the grid is live, and a frame can be hidden, re-filed or
 *   deleted between the render a pointer started on and the one it finished
 *   on. An unknown `moved` changes nothing; an unknown `before` means the end.
 * @example
 * reorderFrames(frames, mediaId('9'), mediaId('4')) // 9 now sits before 4
 */
export const reorderFrames = <T extends Frame>(
  frames: readonly T[],
  moved: MediaId,
  before: MediaId | null,
): readonly T[] => {
  const subject = frames.find((frame) => frame.id === moved)
  if (subject === undefined) return renumbered(frames)

  // REMOVED FIRST, THEN THE TARGET IS FOUND. Resolving `before` against the
  // untouched array would be one too far whenever the moved frame sat ahead of
  // the target, which is every forward drag.
  const rest = frames.filter((frame) => frame.id !== moved)
  const found = before === null ? -1 : rest.findIndex((frame) => frame.id === before)
  const at = found === -1 ? rest.length : found

  return renumbered([...rest.slice(0, at), subject, ...rest.slice(at)])
}

/**
 * The same frames, arranged by when they were taken.
 *
 * UNDATED FRAMES GO LAST. Sorting them first would put the least-known
 * photographs at the top of every gallery — see this module's header.
 * @param frames - The arrangement as it stands.
 * @returns The frames, oldest capture time first, then everything undated in
 *   the arrangement it already had.
 * @example
 * sortFramesByDate(frames) // oldest first, undated last
 */
export const sortFramesByDate = <T extends Frame>(frames: readonly T[]): readonly T[] =>
  [...frames].sort((left, right) => {
    const leftAt = capturedMillis(left)
    const rightAt = capturedMillis(right)
    if (leftAt === null) return rightAt === null ? 0 : 1
    if (rightAt === null) return -1
    return leftAt - rightAt
  })

/**
 * The frame the gallery leads with, which is whatever sorts first.
 *
 * A RULE, NOT A COLUMN. §2.5 draws the "Cover" chip on the first tile and says
 * so in one line — "The first frame is the gallery cover" — so the cover
 * follows every rearrangement rather than being a flag an author sets and then
 * has to remember. `media.isCover` still exists and §2.5's panel still offers
 * "Use as gallery cover"; that toggle MOVES the frame to the front rather than
 * setting a flag the first tile would then contradict
 * (`apps/web/lib/admin/galleryMutations.ts`).
 * @param frames - The arrangement, already in the order the gallery reads.
 * @returns The first frame's id, or `undefined` for a journey with no frames.
 * @example
 * coverFrame(sortFramesByDate(frames))
 */
export const coverFrame = (frames: readonly Frame[]): MediaId | undefined => frames[0]?.id
