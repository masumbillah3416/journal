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
 * asks for a tier the row does not carry AND the row's own original is wide
 * enough for Payload to have produced it - Payload skips a size whose target
 * exceeds the source, so "missing" alone would mark every 500px placeholder
 * incomplete forever and make this script a full re-encode of the library on
 * every deploy. The predicate is written against the CONFIGURED ladder rather
 * than against `grid` by name, because the next tier to be added will need
 * exactly this script and naming one tier here would hide that.
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
 * Depends on: `payload`'s `Payload` type, `Media` (../collections/media) for
 * the configured ladder, `StoragePort` (../lib/ports/storage), and the
 * generated `Media` document type.
 */
import type { Payload } from 'payload'
import { Media } from '../collections/media'
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

/** One configured derivative tier, reduced to what the predicate below needs. */
interface ConfiguredTier {
  readonly name: string
  readonly width: number
}

/**
 * The derivative ladder `apps/web/collections/media.ts` configures today.
 *
 * A size with no width contributes `0`, which reads as "no source is too small
 * for it" - the right answer for a height-only size, of which the collection
 * configures none today and `ImageSize` permits.
 * @returns One entry per configured tier.
 * @throws When the collection configures no image sizes, which would mean it
 *   had stopped deriving tiers at all and this script had nothing to do.
 */
const configuredTiers = (): readonly ConfiguredTier[] => {
  const upload = Media.upload
  /* c8 ignore next -- no organic trigger: the collection is an upload collection that configures image sizes, and a change removing them would fail `../lib/media/tierRegistration.test.ts` and every derivative case long before this line. The throw stays so the absence is named rather than read as an empty ladder. */
  if (typeof upload !== 'object' || upload.imageSizes === undefined) throw new Error('no image sizes to re-derive')
  return upload.imageSizes.map((size) => ({ name: size.name, width: size.width ?? 0 }))
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
type SelectedRow = Pick<PayloadMedia, 'id' | 'filename' | 'mimeType' | 'width' | 'sizes'>

/**
 * Whether the ladder asks this row for a tier it does not carry and its own
 * original is wide enough to produce.
 * @param row - The media row, `depth: 0`.
 * @param tiers - The configured ladder.
 * @returns `true` when re-deriving would add something.
 */
const needsRederivation = (row: SelectedRow, tiers: readonly ConfiguredTier[]): boolean => {
  const derived = derivedTiers(row.sizes)
  return tiers.some((tier) => (row.width ?? 0) >= tier.width && !derived.has(tier.name))
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
  const tiers = configuredTiers()
  const rows = await payload.find({
    collection: 'media',
    depth: 0,
    pagination: false,
    limit: 20_000,
    select: { filename: true, mimeType: true, width: true, sizes: true },
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
