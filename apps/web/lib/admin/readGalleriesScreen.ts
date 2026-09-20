/**
 * readGalleriesScreen — everything SCREENS.md §2.5 draws, in three queries.
 *
 * ═══ THE ARRANGEMENT COMES FROM THE DIARY'S OWN RULE, NOT FROM A SECOND ONE ═══
 *
 * `apps/web/lib/galleryFrames.ts` is the one definition of which of a
 * journey's `media` rows are frames of its gallery, and {@link
 * GALLERY_FRAME_SORT} is the order the public gallery draws them in. This
 * screen asks that module rather than writing its own `where` and its own
 * sort, so "first" means the same thing on the admin's grid as it does under
 * `/gallery/<slug>` — which is the whole point of a screen whose §2.5 line
 * reads "The first frame is the gallery cover."
 *
 * IT ASKS FOR ONE CLAUSE LESS. §2.5 draws a "Hidden" chip on a withheld frame
 * and the toggle that puts it back, so the screen that can unhide a frame has
 * to list one: the read passes `includeHidden` (`GalleryFrameScope`). The
 * other two exclusions still apply — a decorative scrap is not a gallery frame
 * for anybody, and a row the pipeline has not finished has no derivative to
 * draw.
 *
 * ═══ THREE QUERIES, WHATEVER THE SIZE OF THE LIBRARY ═══
 *
 * The journeys the select offers, the pages that name the decorative scraps,
 * and every gallery frame in the diary. The obvious spelling of "and how many
 * frames does each journey have" is a `count` per journey — which is the N+1
 * CLAUDE.md §6 forbids, and which a ten-journey seed would never make visible.
 * The tally is folded over the one `media` read instead, and
 * `readGalleriesScreen.integration.test.ts` pins the collections asked about,
 * in order, and takes the reading again with another journey in the diary.
 *
 * ═══ WHY THE MEDIA READ IS NOT SCOPED TO THE SELECTED JOURNEY ═══
 *
 * Because the select above the grid prints "{name} — {n} frames" for EVERY
 * journey, so every journey's frames have to be counted on every render. One
 * read of the whole set and a fold is one query; a scoped read plus a count
 * per option is eleven. `readMediaScreen.ts` reads the library unscoped for a
 * different reason and gives the same bound: design spec §12 puts the corpus
 * at ~100 assets per journey and the handoff at ten journeys, so this is a
 * thousand narrow rows at the top of the range, with `depth: 0` and a `select`
 * naming exactly the columns §2.5 draws.
 *
 * ═══ THE CLIP HALF OF THIS SHAPE CANNOT BE PRODUCED ON THIS MACHINE ═══
 *
 * `durationSec` and `posterAt` are filled by the worker pipeline, and design
 * spec §9.3 puts clips behind `MEDIA_PIPELINE=worker`, which is refused at
 * boot here because `ffmpeg`/`ffprobe` are absent. So no case below creates a
 * clip through the upload path; the clip fields are read the same way every
 * other column is, and what draws them is covered in jsdom by handing
 * `SelectedFrame` a clip row directly. Under CLAUDE.md §7.1 that half is
 * UNRESOLVED in a browser, and said so rather than implied.
 *
 * PATTERNS (CLAUDE.md §3.3): Repository — one module owns how this screen's
 * data is fetched and shaped, and no component sees a Payload document. DTO:
 * {@link GalleriesView} is the screen's shape, not three collections'.
 *
 * INVARIANT — every row in {@link GalleriesView.frames} belongs to
 * {@link GalleriesView.journey}, and {@link GalleriesView.journeys} counts the
 * same rows the same rule admitted. So the "{n} frames" beside a journey's
 * name is the number of tiles that journey's grid will draw, rather than a
 * count of its `media` rows — which would include the scrap and everything the
 * pipeline has not finished.
 * Depends on: `Frame` (@travel-diary/domain/admin/frameOrder), the id brands
 * (@travel-diary/domain/ids), `ephemeraMediaIds`/`galleryFrameWhere`/
 * `GALLERY_FRAME_SORT` (../galleryFrames), `payload` (types), `AdminScope`
 * (./adminScope).
 */
import type { Frame } from '@travel-diary/domain/admin/frameOrder'
import { isRowId, journeyId, mediaId, type JourneyId } from '@travel-diary/domain/ids'
import type { Payload } from 'payload'
import { GALLERY_FRAME_SORT, ephemeraMediaIds, galleryFrameWhere } from '../galleryFrames'
import type { AdminScope } from './adminScope'

/**
 * One tile of SCREENS.md §2.5's grid, and everything its panel draws.
 *
 * EXTENDS THE DOMAIN'S {@link Frame} rather than repeating it: `id`, `order`
 * and `capturedAt` are what the arrangement rules read, and they read them
 * from this row without a re-join.
 */
export interface FrameRow extends Frame {
  /** The name in the bulk panel's 112px cell and the panel's file line. */
  readonly filename: string
  /**
   * The `thumb` derivative's URL, or `null` for an upload too small for the
   * tier. NEVER THE ORIGINAL (CLAUDE.md §6) — `thumb` is 400px square, which
   * serves the 136px grid tile, the 150px panel preview and the bulk panel's
   * 38px row alike.
   */
  readonly thumbSrc: string | null
  /**
   * The UNCROPPED derivative §2.5's 150px panel preview draws, or `null`.
   *
   * NOT `thumb`. The panel is where an author writes this frame's caption and
   * its alt text, so the preview has to be the whole photograph — a 400x400
   * centre crop would have them describing a picture the gallery does not
   * print. `readJourneyEditor.ts`'s `PREVIEW_TIERS` is the same argument for
   * the slot preview, and `apps/web/lib/media/derivativeGeometry.test.ts`'s
   * census is what keeps both honest.
   */
  readonly previewSrc: string | null
  /** What the tile's image says it is, for a reader who cannot see it. */
  readonly alt: string
  /** The caption the gallery prints beneath the frame. `''` when there is none. */
  readonly caption: string
  /** Whether this frame is a photograph or a clip — §2.5's two file lines. */
  readonly kind: 'still' | 'clip'
  /** The original's pixel width, or `null` for a row Payload never measured. */
  readonly width: number | null
  /** As {@link FrameRow.width}. */
  readonly height: number | null
  /** The stored original's size in bytes, or `null`. The panel prints "6.1 MB". */
  readonly filesize: number | null
  /** A clip's length in seconds, `null` for a still. Drives the filmstrip's grabs. */
  readonly durationSec: number | null
  /**
   * A clip's chosen poster timestamp in seconds, or `null` for "first frame".
   *
   * WRITTEN BY NOTHING ELSE IN THIS REPOSITORY. §2.5's Poster frame block is
   * the column's first writer and its first reader.
   */
  readonly posterAt: number | null
  /** Whether an editor has taken this frame out of the public gallery. */
  readonly hidden: boolean
  /** The `media.inBook` column — §2.5's "Also place in the book" toggle. */
  readonly inBook: boolean
}

/** One option in §2.5's journey select, with the count its label prints. */
export interface GalleryChoice {
  /** The journey, branded. The select is bound to this. */
  readonly id: JourneyId
  /** What the option prints before the dash. */
  readonly name: string
  /** How many frames that journey's grid draws — the "{n} frames" half. */
  readonly frames: number
}

/** Everything SCREENS.md §2.5 draws. */
export interface GalleriesView {
  /**
   * The journey whose grid is on screen, or `null` when the diary has no
   * journeys at all. This is the RESOLVED selection: an address naming a
   * journey that is not there falls back to the first offered rather than
   * drawing an empty screen the author cannot get out of.
   */
  readonly journey: JourneyId | null
  /** Every journey the select offers, by name, with its frame count. */
  readonly journeys: readonly GalleryChoice[]
  /** The selected journey's frames, in the order the public gallery reads them. */
  readonly frames: readonly FrameRow[]
}

/**
 * The `thumb` derivative's URL, or `null`.
 *
 * `readMediaScreen.ts`'s `thumbOf`, one module along and for the same reason:
 * a grid of a thousand 4000px uploads is the whole library on the wire.
 * @param sizes - The derivative map as Payload returned it.
 * @returns The URL, or `null` when there is no such derivative.
 */
const thumbOf = (sizes: { readonly thumb?: { readonly url?: string | null } } | undefined): string | null => {
  const url = sizes?.thumb?.url
  return typeof url === 'string' ? url : null
}

/**
 * Which derivative tiers §2.5's PANEL PREVIEW walks, in preference order.
 *
 * ═══ UNCROPPED, AND THE CAPTION IS THE WHOLE REASON ═══
 *
 * `readJourneyEditor.ts`'s `PREVIEW_TIERS` gives the editor's half of this
 * argument and this is the galleries screen's: the panel is where an author
 * writes what a frame IS — its caption and the alt text a reader who cannot
 * see it hears — so a preview drawn from `thumb`, a 400x400 CENTRE CROP, would
 * have them describing a photograph the gallery does not print. That is
 * MED-001's shape with the caption on the other side of it.
 *
 * `frame` first: it is the one uncropped rung every original yields
 * (`withoutEnlargement: true`), and it is the SAME FILE the lightbox and the
 * book already serve, so a preview is usually a cache hit rather than a
 * download. The GRID's tiles keep `thumb` — they are 136px squares carrying an
 * index badge, a grip and two chips, and there is nothing to read in them.
 */
const PREVIEW_TIERS = ['frame', 'hero'] as const

/**
 * The 150px preview one frame draws, or `null`.
 *
 * `null` for a row with no derivative of any tier, which the panel draws as an
 * empty box rather than reaching for the original — a 4000px upload behind a
 * 150px box is the whole library on the wire (CLAUDE.md §6).
 * @param sizes - The derivative map as Payload returned it.
 * @returns The first available tier's URL, or `null`.
 */
const previewOf = (
  sizes: Readonly<Partial<Record<(typeof PREVIEW_TIERS)[number], { readonly url?: string | null }>>> | undefined,
): string | null => {
  for (const tier of PREVIEW_TIERS) {
    const url = sizes?.[tier]?.url
    if (typeof url === 'string') return url
  }
  return null
}

/**
 * A number column as this screen reads it.
 *
 * Payload's generated types make every optional column `number | null |
 * undefined`, and the three mean the same thing here — nobody measured it.
 * @param value - The column as Payload returned it.
 * @returns The number, or `null`.
 */
const orNull = (value: number | null | undefined): number | null => (typeof value === 'number' ? value : null)

/**
 * Everything SCREENS.md §2.5's screen draws.
 *
 * @param payload - The Local API instance. A parameter so the query count is
 *   observable; `readJourneysScreen.ts` gives the reason at length.
 * @param scope - The hoisted {@link AdminScope}, spread into every query.
 * @param journey - The journey the address names, or `null` for the first.
 * @returns The select's options, the resolved journey and its frames.
 * @throws From Payload, when a read is refused by the access rules the scope
 *   switches on — a bug in the guard that admitted the session, not a state a
 *   screen can draw.
 * @example
 * const view = await readGalleriesScreen(await getPayload(), scope, journeyId('7').value)
 */
export const readGalleriesScreen = async (
  payload: Payload,
  scope: AdminScope,
  journey: JourneyId | null,
): Promise<GalleriesView> => {
  const [journeys, pages] = await Promise.all([
    payload.find({
      collection: 'journeys',
      ...scope,
      depth: 0,
      pagination: false,
      sort: 'name',
      select: { name: true },
      // A trashed journey has no gallery to arrange.
      where: { deletedAt: { exists: false } },
    }),
    payload.find({
      collection: 'pages',
      ...scope,
      depth: 0,
      pagination: false,
      // The ONLY column this read wants: `ephemeraMediaIds` reads the scrap
      // out of it, and every other field of a page is another screen's
      // (CLAUDE.md §7: select narrowly).
      select: { slots: true },
    }),
  ])

  const rows = journeys.docs.filter((row) => isRowId(row.id))
  const media = await payload.find({
    collection: 'media',
    ...scope,
    depth: 0,
    pagination: false,
    // THE DIARY'S OWN SORT (`../galleryFrames`), so the admin's first tile and
    // the gallery's first frame are the same photograph.
    sort: [...GALLERY_FRAME_SORT],
    where: galleryFrameWhere(
      rows.map((row) => row.id),
      ephemeraMediaIds(pages.docs),
      // §2.5 draws a "Hidden" chip and the toggle that clears it, so this is
      // the one reader that has to see a withheld frame. See that module.
      { includeHidden: true },
    ),
    select: {
      journey: true,
      filename: true,
      alt: true,
      caption: true,
      kind: true,
      width: true,
      height: true,
      filesize: true,
      durationSec: true,
      posterAt: true,
      capturedAt: true,
      hidden: true,
      inBook: true,
      order: true,
      sizes: true,
    },
  })

  // ONE PASS OVER THE FRAMES, NOT A COUNT PER JOURNEY. The map is built once
  // and read once per option, so the cost is the number of frames rather than
  // the number of journeys times the size of the library.
  const framesByJourney = new Map<number, FrameRow[]>()
  for (const row of media.docs) {
    // THE RELATIONSHIP IS A BARE ID AT `depth: 0`, but the generated type still
    // allows the whole document — and a guess that went the other way would
    // file every frame under no journey at all. `readMediaScreen.ts` asks the
    // same question of the same column with the same narrowing.
    const owner = row.journey
    /* c8 ignore next -- unreachable: `galleryFrameWhere` filters on `journey`, and `depth: 0` is what makes this a number rather than a document */
    if (!isRowId(owner)) continue
    const branded = mediaId(String(row.id))
    /* c8 ignore next -- Postgres mints positive integer ids, so the brand cannot refuse one */
    if (!branded.ok) continue

    const frames = framesByJourney.get(owner) ?? []
    frames.push({
      id: branded.value,
      // A row Payload stored always has one; the fallbacks below are the type
      // obligations `exactOptionalPropertyTypes` imposes, not states.
      /* c8 ignore next */
      filename: row.filename ?? '',
      thumbSrc: thumbOf(row.sizes),
      previewSrc: previewOf(row.sizes),
      alt: row.alt ?? '',
      caption: row.caption ?? '',
      kind: row.kind === 'clip' ? 'clip' : 'still',
      width: orNull(row.width),
      height: orNull(row.height),
      filesize: orNull(row.filesize),
      durationSec: orNull(row.durationSec),
      posterAt: orNull(row.posterAt),
      capturedAt: typeof row.capturedAt === 'string' ? row.capturedAt : null,
      hidden: row.hidden === true,
      inBook: row.inBook === true,
      // `media.order` is an editor-facing integer nothing enforces, and a row
      // that has never been arranged has none at all. Zero is what the sort
      // already treats it as, since `GALLERY_FRAME_SORT` breaks the tie by id.
      order: row.order ?? 0,
    })
    framesByJourney.set(owner, frames)
  }

  // THE OPTION AND THE ROW IT CAME FROM, TOGETHER. Turning a branded id back
  // into the row it names is `rowId`'s job and it can answer `undefined`; the
  // row is already in hand here, so carrying it costs nothing and removes a
  // conversion that could fail.
  const offered = rows.flatMap((row): readonly { readonly choice: GalleryChoice; readonly source: number }[] => {
    const branded = journeyId(String(row.id))
    /* c8 ignore next -- as above: Postgres cannot mint an id the brand refuses */
    if (!branded.ok) return []
    const frames = framesByJourney.get(row.id) ?? []
    return [{ choice: { id: branded.value, name: row.name, frames: frames.length }, source: row.id }]
  })
  const choices = offered.map((entry) => entry.choice)

  // THE ADDRESS IS NOT TRUSTED TO NAME A JOURNEY THAT EXISTS. `?journey=99` is
  // an address anybody can type, and a trashed journey is one anybody can
  // still have bookmarked — so an unknown id falls back to the first option
  // rather than drawing a grid with nothing in it and no way out.
  const selected = offered.find((entry) => entry.choice.id === journey) ?? offered[0]
  /* c8 ignore next -- a diary with no live journeys at all, which is a fresh install: `diary_test` is shared and seeded, so no integration case can reach this arm without emptying a database other files are reading. The screen still has to draw something, so it is written rather than asserted away. */
  if (selected === undefined) return { journey: null, journeys: choices, frames: [] }

  return { journey: selected.choice.id, journeys: choices, frames: framesByJourney.get(selected.source) ?? [] }
}
