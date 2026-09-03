/**
 * gallery — a journey's full gallery, as the reader's own model of it.
 *
 * Data Transfer Object plus pure selection logic (CLAUDE.md §3.3): the shape
 * `apps/web/lib/readGalleryBundle.ts` serializes a journey's media into, and
 * the handful of decisions the grid and the lightbox make over it. It holds no
 * React, no DOM and no Payload, so every rule below is testable without a
 * browser — which is the point, because the two rules that matter most here
 * are the ones the handoff records as having been got wrong.
 *
 * THE OPEN FRAME IS ADDRESSED BY ID, NEVER BY POSITION, and that is this
 * module's reason for existing rather than a note on it. The handoff says so
 * twice — README's State section and DATA_MODEL's notes — about the same
 * defect: "`picked` was a positional index into the gallery; once 'sort by
 * date' reordered the list, the selected-frame panel showed a different photo
 * than the grid highlighted." {@link openFrameById} and {@link stepFrame} take
 * a {@link MediaId} and hand one back; the INDEX is derived from the
 * collection's current order, only ever to print `003 / 061` and `frame 007`.
 * That is the direction CLAUDE.md §7 requires ("Address rows by id, never by
 * array position"), and it means a sort applied under an open lightbox moves
 * the counter without moving the photograph.
 *
 * THE GRID IS WINDOWED PAST A HUNDRED TILES, not at every size (CLAUDE.md §6:
 * "virtualize the gallery grid past 100 tiles"). {@link tileWindow} returns
 * the whole collection below that ceiling and a scrolled window above it. The
 * threshold is the design's own: the handoff tops out near a hundred assets
 * per journey, which is exactly where a naive grid starts to hurt, and
 * windowing a gallery of sixty-one would cost a scroll handler and a
 * remount-on-scroll for nothing.
 *
 * FRAME NUMBERS PAD TO THREE DIGITS, unlike the book's page counter.
 * `pageCounter` in ./bookBundle pads to the width of the total (`03 / 33` for
 * a 33-page book); SCREENS.md §1.9 prints `003 / 061` for a 61-frame gallery,
 * so this module has its own padding rule rather than reusing that one. The
 * two are deliberately separate functions: they are different designs that
 * happen to look alike at three digits.
 * Depends on: MediaId and JourneyId, from ./ids.
 */
import type { JourneyId, MediaId } from './ids'

/** Whether a frame is a photograph or a clip. Set by the media pipeline, never by an author. */
export type GalleryFrameKind = 'still' | 'clip'

/**
 * One frame of a journey's gallery, resolved and ready to render.
 *
 * `tileSrc` and `fullSrc` are both DERIVATIVE urls, never an original
 * (CLAUDE.md §6, "Always a derivative tier, never an original"), and
 * `downloadHref` is a path to a handler of ours rather than to the store —
 * see ./galleryDownload for why that distinction is a security requirement
 * and not a preference.
 */
export interface GalleryFrame {
  /** The media row's own id. The lightbox's whole identity model - see this module's header. */
  readonly id: MediaId
  /** The square-tile derivative the grid draws. */
  readonly tileSrc: string
  /** The largest derivative available, which the lightbox draws at `object-fit: contain`. */
  readonly fullSrc: string
  /** The path our own download handler serves this frame's derivative from. */
  readonly downloadHref: string
  /** The media item's alt text, or `''` for a frame nobody has described yet. */
  readonly alt: string
  /** The media item's caption, or `''` for an uncaptioned frame. */
  readonly caption: string
  /** Whether this frame is a photograph or a clip. */
  readonly kind: GalleryFrameKind
  /** A clip's length in seconds, for the duration chip. `undefined` for every still. */
  readonly durationSec: number | undefined
  /** The media item's own focal point, as `object-position` percentages - see {@link GalleryFrame}. */
  readonly focalX: number
  /** As {@link focalX}. */
  readonly focalY: number
  /** Whether the editor allows this frame to be downloaded at all (`media.allowDownload`). */
  readonly downloadable: boolean
}

/** The journey a gallery belongs to, as its header prints it. */
export interface GalleryJourney {
  readonly id: JourneyId
  readonly slug: string
  readonly name: string
  /** Where the journey went, e.g. `'Japan'`. May be empty. */
  readonly place: string
  /** The free-text date range printed beside the title, e.g. `'4 - 13 Apr 2024'`. */
  readonly dates: string
}

/** Everything the `/gallery/<slug>` route renders, in one serialization boundary. */
export interface GalleryBundle {
  readonly journey: GalleryJourney
  /** The journey's frames, in the order the grid shows them. */
  readonly frames: readonly GalleryFrame[]
  /** The grid's minimum tile track, from the `book` global - see {@link galleryThumbSize}. */
  readonly thumbSize: number
}

/**
 * The tile-size range the `book` global's `galleryThumbPx` admits, and the
 * size a book that has never set one gets. Transcribed from SCREENS.md §1.8
 * ("`thumbSize` 140-300 (default 200)") and matching `apps/web/globals/book.ts`'s
 * own `min`/`max`/`defaultValue`.
 */
export const GALLERY_THUMB_SIZE = Object.freeze({ min: 140, max: 300, default: 200 } as const)

/**
 * The grid's minimum tile track, in whole pixels.
 *
 * The schema already constrains `galleryThumbPx` to 140-300, so this clamp is
 * a boundary guard rather than a second opinion: the value reaches here from
 * a database row that a migration, a direct write or an older schema could
 * have left outside the range, and a `minmax(40px, 1fr)` track would silently
 * redesign the page.
 * @param configured - The `book` global's `galleryThumbPx`, or `null`/`undefined` when unset.
 * @returns A whole-pixel size inside {@link GALLERY_THUMB_SIZE}.
 * @example
 * galleryThumbSize(undefined) // 200
 */
export const galleryThumbSize = (configured: number | null | undefined): number => {
  if (configured === null || configured === undefined || !Number.isFinite(configured)) {
    return GALLERY_THUMB_SIZE.default
  }
  return Math.min(GALLERY_THUMB_SIZE.max, Math.max(GALLERY_THUMB_SIZE.min, Math.round(configured)))
}

/** The smallest number of digits a frame number is printed with (SCREENS.md §1.9's `003 / 061`). */
const FRAME_DIGITS = 3

/**
 * A frame's 1-based number, zero-padded as SCREENS.md §1.8/§1.9 print it.
 * @param index - The frame's 0-based position in the collection's CURRENT order.
 * @param total - How many frames the gallery holds, so a large gallery widens past three digits.
 * @returns e.g. `frameOrdinal(6, 61)` is `'007'`.
 */
export const frameOrdinal = (index: number, total: number): string =>
  String(index + 1).padStart(Math.max(FRAME_DIGITS, String(total).length), '0')

/**
 * The lightbox's top-bar counter.
 * @param index - The open frame's 0-based position in the current order.
 * @param total - How many frames the gallery holds.
 * @returns e.g. `frameCounter(2, 61)` is `'003 / 061'`.
 */
export const frameCounter = (index: number, total: number): string =>
  `${frameOrdinal(index, total)} / ${frameOrdinal(total - 1, total)}`

/**
 * The lightbox's metadata line, under the caption.
 *
 * A journey with no `place` prints two parts rather than three: `journeys.place`
 * is not `required: true`, and a bare `· ·` would read as a missing word
 * rather than as an empty field - the same policy `Notes.tsx` and `Cover.tsx`
 * apply to every optional line.
 * @param journey - The journey's name and place.
 * @param index - The open frame's 0-based position in the current order.
 * @param total - How many frames the gallery holds.
 * @returns e.g. `'Tokyo · Japan · frame 007'`.
 */
export const frameMetadata = (
  journey: { readonly name: string; readonly place: string },
  index: number,
  total: number,
): string =>
  [journey.name, journey.place, `frame ${frameOrdinal(index, total)}`].filter((part) => part !== '').join(' · ')

/**
 * A clip's length, as the duration chip and the transport bar print it.
 *
 * IT RETURNS `null` RATHER THAN `'0:00'` FOR A STILL, and that is the whole
 * reason it is a function rather than a template literal at the call site: a
 * still carries no `durationSec` at all, and a chip reading `0:00` on a
 * photograph is worse than no chip. `Tile.tsx` renders the chip only when this
 * returns a string.
 *
 * NOTHING IN THIS BOOK CAN REACH THE NON-NULL BRANCH YET. Video is deferred
 * (`docs/adr/0004-media-pipeline-mode.md`, `MEDIA_PIPELINE=inline`), so no
 * `media` row can carry `kind: 'clip'` until the transcode worker lands. This
 * is the seam that is ready for it, tested here rather than in the browser
 * for exactly that reason.
 * @param seconds - `media.durationSec`, or `undefined` for a still.
 * @returns e.g. `'1:05'`, or `null` when there is no length to print.
 */
export const clipDuration = (seconds: number | undefined): string | null => {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return null

  const whole = Math.floor(seconds)
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, '0')}`
}

/** The prefix a shared lightbox address carries before a frame's own id. */
const FRAME_FRAGMENT = '#frame-'

/**
 * The address that opens one frame's lightbox directly.
 *
 * A FRAGMENT RATHER THAN A ROUTE, deliberately. The lightbox is state over
 * the gallery, not a page of its own: giving it a path would mint a crawlable
 * URL per photograph whose document is the same gallery, which is the
 * duplicate-content problem `/p/<n>`'s canonical link already exists to
 * prevent. A fragment is never sent to the server, so it costs no route, no
 * render and no history entry - {@link frameIdFromHash} reads it once, when
 * the gallery mounts.
 *
 * IT IS KEYED BY ID, like everything else here: a shared link that named a
 * position would open a different photograph as soon as the collection was
 * re-sorted, which is the same defect one level out.
 * @param origin - `window.location.origin`.
 * @param pathname - `window.location.pathname`, the gallery's own path.
 * @param frameId - The open frame's media id.
 * @returns An absolute address a reader can paste anywhere.
 */
export const frameShareUrl = (origin: string, pathname: string, frameId: MediaId): string =>
  `${origin}${pathname}${FRAME_FRAGMENT}${encodeURIComponent(frameId)}`

/**
 * The frame a shared address names, if this gallery still holds it.
 * @param hash - `window.location.hash`, exactly as the browser reports it.
 * @param frames - The gallery's frames.
 * @returns The named frame's id, or `null` when the address names none of them.
 */
export const frameIdFromHash = (hash: string, frames: readonly GalleryFrame[]): MediaId | null => {
  if (!hash.startsWith(FRAME_FRAGMENT)) return null

  const named = decodeURIComponent(hash.slice(FRAME_FRAGMENT.length))
  return frames.find((frame) => frame.id === named)?.id ?? null
}

/** Which frame the lightbox has open, and where that frame currently sits. */
export interface OpenFrame {
  readonly frame: GalleryFrame
  /** The frame's 0-based position in the collection's CURRENT order - derived for display only. */
  readonly index: number
}

/**
 * Resolves the id the lightbox holds to the frame it names, and to that
 * frame's position in the collection as it stands right now.
 *
 * THE ARGUMENT IS AN ID, NOT AN INDEX, and the index comes back rather than
 * going in. See this module's header for the defect that distinction exists
 * to prevent.
 * @param frames - The gallery's frames, in their current order.
 * @param openId - The media id the lightbox has open, or `null` when it is closed.
 * @returns The open frame and its current position, or `null` when the lightbox is
 *   closed or the gallery no longer holds that frame.
 */
export const openFrameById = (frames: readonly GalleryFrame[], openId: MediaId | null): OpenFrame | null => {
  if (openId === null) return null

  const index = frames.findIndex((frame) => frame.id === openId)
  const frame = index === -1 ? undefined : frames[index]
  if (frame === undefined) return null

  return { frame, index }
}

/**
 * The id of the frame one step either side of the open one, in the
 * collection's current order.
 *
 * It returns an ID rather than an index for the same reason
 * {@link openFrameById} takes one: the caller stores what comes back, and a
 * stored index is a stored position.
 *
 * Stepping past either end returns `null` rather than wrapping - SCREENS.md
 * §1.9 gives the lightbox a prev and a next control, and a control that
 * wrapped would make `001 / 061` reachable by pressing "previous" on the
 * first frame, which reads as a bug rather than as a feature.
 * @param frames - The gallery's frames, in their current order.
 * @param openId - The media id the lightbox has open, or `null` when it is closed.
 * @param step - `-1` for the previous frame, `1` for the next.
 * @returns The neighbour's id, or `null` when there is none.
 */
export const stepFrame = (frames: readonly GalleryFrame[], openId: MediaId | null, step: -1 | 1): MediaId | null => {
  const open = openFrameById(frames, openId)
  if (open === null) return null

  return frames[open.index + step]?.id ?? null
}

/**
 * The tile count past which the grid renders a window rather than the whole
 * collection (CLAUDE.md §6). The design tops out near a hundred assets per
 * journey; below that, windowing costs a scroll handler and buys nothing.
 */
export const VIRTUALIZE_ABOVE = 100

/** How many rows of tiles are rendered above and below the ones on screen. */
const OVERSCAN_ROWS = 2

/** The half-open range `[from, to)` of tiles the grid renders. */
export interface TileWindow {
  readonly from: number
  readonly to: number
}

/** What {@link tileWindow} needs to decide which tiles to render. */
export interface TileWindowInput {
  /** How many frames the gallery holds. */
  readonly total: number
  /** How many tiles the grid currently fits across, as measured from the laid-out grid. */
  readonly columns: number
  /** One row's height in pixels, tile plus caption plus row gap. */
  readonly rowHeight: number
  /** How far the reader has scrolled the grid's own scroller. */
  readonly scrollTop: number
  /** The scroller's visible height. */
  readonly viewportHeight: number
}

/**
 * Which tiles the grid renders right now.
 *
 * Below {@link VIRTUALIZE_ABOVE} this is the whole collection, and so is a
 * grid whose geometry has not been measured yet (no columns, or no row
 * height): rendering everything is the correct answer to "I do not know how
 * much fits", where dividing by an unmeasured zero would render nothing at
 * all. That is the failure mode this guard exists for - a blank gallery on
 * first paint, before the `ResizeObserver` has reported.
 * @param input - The collection's size and the grid's measured geometry.
 * @returns The half-open range of tile indices to render.
 * @example
 * tileWindow({ total: 61, columns: 4, rowHeight: 218, scrollTop: 0, viewportHeight: 900 })
 * // { from: 0, to: 61 } - a gallery this size is never windowed
 */
export const tileWindow = ({ total, columns, rowHeight, scrollTop, viewportHeight }: TileWindowInput): TileWindow => {
  if (total <= VIRTUALIZE_ABOVE || columns < 1 || rowHeight <= 0) return { from: 0, to: total }

  const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS)
  const rowsRendered = Math.ceil(viewportHeight / rowHeight) + OVERSCAN_ROWS * 2

  return {
    // Clamped to a whole row before the end, so a reader who scrolls past the
    // bottom (elastic scrolling, a shrinking viewport) still sees tiles
    // rather than an empty window opening beyond the collection.
    from: Math.min(firstRow * columns, Math.max(0, (Math.ceil(total / columns) - 1) * columns)),
    to: Math.min(total, (firstRow + rowsRendered) * columns),
  }
}
