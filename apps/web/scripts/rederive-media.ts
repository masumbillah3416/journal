/**
 * rederive-media — gives every stored `media` row the derivative tiers today's
 * `imageSizes` configures, without creating a single new row.
 *
 * ADR 0013 deferred its Option 3 - the ~700px gallery rung - to Phase 3, and
 * said the gallery's byte budget moves "once every `media` row carries it". A
 * migration cannot carry it: `20260913_201520_add_media_grid_tier` adds six
 * columns describing a FILE, and a derivative has to be generated from the
 * original before there is a filename to record. This script is what generates
 * them, and `npm run media:rederive` is the operational step a deploy runs
 * between the migration and serving the gallery (docs/runbook.md).
 *
 * MED-001's FIX NEEDS IT TOO, AND THAT ONE HAS NO MIGRATION AT ALL. Giving
 * `frame` `withoutEnlargement: true` changes no column - `sizes_frame_*` has
 * existed since the first migration - so the ONLY thing that gives an existing
 * row the uncropped derivative its lightbox, download and page slots now ask
 * for is a run of this script. A deploy that ships that change without running
 * it serves rows whose `frame` is still absent, and those rows drop out of the
 * gallery rather than degrading.
 *
 * IT UPDATES IN PLACE, AND THAT IS THE WHOLE DESIGN CONSTRAINT. The diary
 * addresses media by id (CLAUDE.md §7) - `pages.slots[].media` is a
 * relationship - so a script that re-uploaded each original as a NEW row would
 * leave every page in the book pointing at the old one. Each row's own
 * original is read back through the Storage port and handed to
 * `payload.update` as `file`, which is what makes Payload re-run its own
 * derivative generation against a row that already exists. The `file` shape is
 * the one `./seed.ts` already uses.
 *
 * WHAT MAKES A SECOND RUN A NO-OP. A row is re-derived only when the ladder
 * asks for a tier the row does not carry AND Payload would actually produce
 * that tier from the row's own original - which `../lib/media/derivativeGeometry.ts`
 * answers, because "would Payload produce it" has three different answers for
 * the three tier shapes the ladder now holds. Without that half, "missing"
 * alone would mark every 500px placeholder incomplete forever and make this
 * script a full re-encode of the library on every deploy. The predicate is
 * written against the CONFIGURED ladder rather than against `grid` or `frame`
 * by name, because the next tier to be added will need exactly this script and
 * naming one tier here would hide that.
 *
 * A MISSING ORIGINAL IS REPORTED, NEVER THROWN. A store with no file for a row
 * is a real state - it is the 500 Phase 1 Task 10 found - and aborting the run
 * halfway through the collection would leave the corpus in a state neither the
 * old gate nor the new one describes. The row's id goes into `skipped` and the
 * run continues.
 *
 * ONE NOTE BEFORE MUTATING THE `payload.update` BELOW, because it has already
 * cost a `verify:full` run: swapping it for `payload.create` - the mutation
 * that proves the update-in-place rule - writes rows with no `alt`, which
 * `./rederive-media.integration.test.ts`'s cleanup cannot see, and they take
 * `state`'s `processing` default. That file's header carries the exact
 * `DELETE` that clears them; this pointer is here because this is the line
 * somebody edits.
 *
 * PATTERN (CLAUDE.md §3.3): Ports & Adapters on the read side - the bytes come
 * through a {@link StoragePort}, never through `fs`, so this script works
 * unchanged against the R2 adapter. Its dependencies are parameters rather
 * than module-scope singletons, so its test drives it against the test Payload
 * (`./rederive-media.integration.test.ts`) and the CLI entry point
 * (`./run-rederive.ts`) supplies the real ones.
 * Depends on: `payload`'s `Payload` type, `configuredDerivatives`/`isDerivable`
 * (../lib/media/derivativeGeometry) for the configured ladder and Payload's own
 * omit rule over it, `StoragePort` (../lib/ports/storage), and the generated
 * `Media` document type.
 */
import type { Payload } from 'payload'
import type { ConfiguredDerivative } from '../lib/media/derivativeGeometry'
import { configuredDerivatives, isDerivable } from '../lib/media/derivativeGeometry'
import type { StoragePort } from '../lib/ports/storage'
import type { Media as PayloadMedia } from '../payload-types'

/** What {@link rederiveMedia} needs to do its work. */
export interface RederiveMediaDeps {
  /** The Payload instance whose `media` collection is re-derived. */
  readonly payload: Payload
  /** Where the originals are read back from. Never `fs` directly. */
  readonly storage: StoragePort
}

/** What one run of {@link rederiveMedia} did. */
export interface RederiveMediaSummary {
  /** How many rows were handed back to Payload for re-derivation. */
  readonly rederived: number
  /** The ids of rows left untouched because their original was not in the store. */
  readonly skipped: readonly string[]
}

/**
 * The tiers a row has a stored FILE for.
 *
 * Not `Object.keys(sizes)`: Payload emits a key for every configured size and
 * fills a skipped one with nulls, so the key list is the configuration read
 * back rather than the work done.
 * @param sizes - The row's `sizes`, as Payload reports it.
 * @returns The tier names with a filename.
 */
const derivedTiers = (sizes: PayloadMedia['sizes']): ReadonlySet<string> =>
  new Set(Object.entries(sizes ?? {}).flatMap(([tier, size]) => (typeof size.filename === 'string' ? [tier] : [])))

/** The fields the re-derivation query reads, and nothing else (CLAUDE.md §7). */
type SelectedRow = Pick<PayloadMedia, 'id' | 'filename' | 'mimeType' | 'width' | 'height' | 'sizes'>

/**
 * Whether the ladder asks this row for a tier it does not carry and Payload
 * would actually produce from this row's own original.
 *
 * THE SECOND HALF IS ASKED OF `isDerivable`, NOT OF A WIDTH COMPARISON, and
 * the difference is a repair that would otherwise never run. This predicate
 * used to read `(row.width ?? 0) >= tier.width`, which is right for a plain
 * width-only rung and wrong for the two other shapes the ladder now has: a
 * `cover` tier is omitted only when the original is smaller on BOTH axes, and
 * a tier carrying `withoutEnlargement` is never omitted at all. `frame` is the
 * second of those (MED-001's fix), so under the old comparison every row
 * narrower than 1400px would have read as "legitimately missing `frame`" and
 * this script - the thing that repairs existing rows - would have repaired
 * nothing.
 * @param row - The media row, `depth: 0`.
 * @param tiers - The configured ladder.
 * @returns `true` when re-deriving would add something.
 */
const needsRederivation = (row: SelectedRow, tiers: readonly ConfiguredDerivative[]): boolean => {
  const derived = derivedTiers(row.sizes)
  const source = { width: row.width ?? 0, height: row.height ?? 0 }
  return tiers.some((tier) => isDerivable(tier, source) && !derived.has(tier.name))
}

/**
 * Re-derives every `media` row that is missing a tier the ladder can give it.
 *
 * @param deps - The Payload instance and the store the originals live in.
 * @returns How many rows were re-derived, and the ids of any whose original
 *   the store no longer holds.
 * @example
 * const summary = await rederiveMedia({ payload, storage: createLocalStorage(MEDIA_DIR) })
 * // { rederived: 61, skipped: [] }
 */
export const rederiveMedia = async ({ payload, storage }: RederiveMediaDeps): Promise<RederiveMediaSummary> => {
  const tiers = configuredDerivatives()
  const rows = await payload.find({
    collection: 'media',
    depth: 0,
    pagination: false,
    limit: 20_000,
    select: { filename: true, mimeType: true, width: true, height: true, sizes: true },
  })

  const skipped: string[] = []
  let rederived = 0

  for (const row of rows.docs) {
    if (!needsRederivation(row, tiers)) continue

    // A row with no `filename` needs no branch of its own: an empty key is
    // refused by `validateStorageKey` at the PORT, which is the one place that
    // decides a key is unusable, and the refusal arrives here as the same
    // `err` a missing file does. Both are "the store has no original for this
    // row", and both are reported rather than thrown.
    const storageKey = row.filename ?? ''

    const original = await storage.get(storageKey)
    if (!original.ok) {
      skipped.push(String(row.id))
      continue
    }

    // `data: {}` rather than a field list: everything an author wrote -
    // caption, alt, focal point, `order` - must survive a re-derivation
    // untouched, and the only thing this update changes is what Payload
    // derives from `file`. The `isCover` hook re-runs and is harmless: it
    // clears the flag on the row's SIBLINGS, which is already true.
    await payload.update({
      collection: 'media',
      id: row.id,
      depth: 0,
      data: {},
      file: {
        data: Buffer.from(original.value),
        mimetype: row.mimeType ?? '',
        name: storageKey,
        size: original.value.byteLength,
      },
    })
    rederived += 1
  }

  return { rederived, skipped }
}
