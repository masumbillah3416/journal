/**
 * rederive-media.integration.test.ts — what re-deriving an existing row must
 * and must not do.
 *
 * Integration test (CLAUDE.md §2), against a real Payload, a real Postgres and
 * the real files on disk. A mock would prove nothing here: the whole of what
 * this script does is read an original back out of the store through the
 * Storage port and hand it to Payload so PAYLOAD re-runs its own derivative
 * generation. Both halves are somebody else's code, and the only honest way to
 * know they meet is to run them.
 *
 * WHAT A "ROW WITHOUT THE GRID TIER" IS, AND WHERE ITS SHAPE COMES FROM. The
 * fixture does not hand-write a `sizes` object it imagines a pre-migration row
 * to have. It NULLs the six `sizes_grid_*` columns with SQL, because that is
 * literally the state `20260913_201520_add_media_grid_tier`'s `up()` leaves
 * every existing row in - the columns are added with no default and no
 * backfill, since a derivative has to exist before there is a filename to
 * record. The shape is the migration's, not this file's.
 *
 * ONE NOTE FOR WHOEVER MUTATES THE MODULE UNDER TEST, because it cost a run
 * here. Swapping `payload.update` for `payload.create` - the mutation that
 * proves the update-in-place rule - writes `media` rows with no `alt`, which
 * this file's `afterAll` sweep cannot see, and they take `state`'s
 * `processing` default. `apps/web/scripts/seed.integration.test.ts` counts the
 * state of EVERY row in the shared test database, so it fails on the next full
 * run and names a state nothing in this file wrote. Restore the mutation and
 * remove them (`DELETE FROM media WHERE alt IS NULL` against `diary_test`)
 * before re-running. Not defended against by widening the sweep: an
 * `alt IS NULL` delete in one file's `afterAll` would quietly remove another
 * file's debris too, and debris is worth seeing.
 * Depends on: pg, sharp, vitest, ../lib/env, ../lib/testPayload,
 * ../lib/adapters/local-storage, ../collections/media, ./rederive-media.
 */
import { Client } from 'pg'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MEDIA_DIR } from '../collections/media'
import { createLocalStorage } from '../lib/adapters/local-storage'
import { env } from '../lib/env'
import { getTestPayload } from '../lib/testPayload'
import { rederiveMedia } from './rederive-media'

/**
 * How long a case that re-derives is given. The first `rederiveMedia` call in
 * this file re-encodes every incomplete row in the shared test database - the
 * whole seeded corpus, once - which is minutes rather than seconds and is the
 * work the script exists to do, not an accident of the fixture.
 */
const REDERIVE_BUDGET_MS = 600_000

/** The `alt` every row this file uploads carries, so `afterAll` removes them all. */
const FIXTURE_ALT = 'test-rederive'

/** The six columns `20260913_201520_add_media_grid_tier` adds, as its own `up()` names them. */
const GRID_COLUMNS = [
  'sizes_grid_url',
  'sizes_grid_width',
  'sizes_grid_height',
  'sizes_grid_mime_type',
  'sizes_grid_filesize',
  'sizes_grid_filename',
]

describe('rederiveMedia', () => {
  let payload: Awaited<ReturnType<typeof getTestPayload>>

  /** The store the `media` collection writes originals and derivatives to. */
  const aStore = () => createLocalStorage(MEDIA_DIR)

  /**
   * Puts one row back into the state the migration left it in: carrying every
   * other tier, and nothing at all under `grid`.
   * @param id - The row to strip.
   */
  const stripTheGridTier = async (id: number): Promise<void> => {
    const client = new Client({ connectionString: env.DATABASE_URL })
    await client.connect()
    try {
      await client.query(
        `UPDATE "media" SET ${GRID_COLUMNS.map((column) => `"${column}" = NULL`).join(', ')}
         WHERE id = $1`,
        [id],
      )
    } finally {
      await client.end()
    }
  }

  /**
   * Uploads a 900px square and then strips its `grid` tier.
   * @param label - The upload's filename stem, unique within this file.
   * @returns The created row, as Payload reports it.
   */
  const aRowWithoutTheGridTier = async (label: string) => {
    const png = await sharp({ create: { width: 900, height: 900, channels: 3, background: '#2f5d62' } })
      .png()
      .toBuffer()
    const created = await payload.create({
      collection: 'media',
      data: { kind: 'still', alt: FIXTURE_ALT, caption: label, state: 'ready' },
      file: { data: png, mimetype: 'image/png', name: `${label}.png`, size: png.length },
    })
    await stripTheGridTier(created.id)
    return created
  }

  /**
   * A row that needs re-deriving and whose original is no longer in the store.
   * @returns The created row, as Payload reports it.
   */
  const aRowWhoseFileWasDeleted = async () => {
    const row = await aRowWithoutTheGridTier('rederive-orphan')
    const removed = await aStore().delete(row.filename ?? '')
    if (!removed.ok) throw new Error(`the fixture could not remove ${String(row.filename)}: ${removed.error}`)
    return row
  }

  /**
   * Every media row's derivative filenames, keyed by id.
   *
   * Filenames rather than the whole `sizes` object: a `url` carries no
   * information a filename does not, and `filesize` is the one field that
   * could differ between two byte-identical re-encodes of the same source.
   * @returns A row-id-to-tier-to-filename map of the whole collection.
   */
  const sizesSnapshot = async (): Promise<Record<string, Record<string, string>>> => {
    const rows = await payload.find({
      collection: 'media',
      depth: 0,
      pagination: false,
      limit: 20_000,
      select: { sizes: true },
    })
    return Object.fromEntries(
      rows.docs.map((row) => [
        String(row.id),
        Object.fromEntries(
          Object.entries(row.sizes ?? {}).flatMap(([tier, size]) =>
            typeof size.filename === 'string' ? [[tier, size.filename]] : [],
          ),
        ),
      ]),
    )
  }

  beforeAll(async () => {
    payload = await getTestPayload()
  })

  afterAll(async () => {
    await payload.delete({ collection: 'media', where: { alt: { equals: FIXTURE_ALT } } })
  })

  it(
    'gives an existing row the new tier without changing its id or its caption',
    async () => {
      // Re-deriving must not be a re-upload: the diary addresses media by id
      // (CLAUDE.md §7), so a script that created new rows would break every
      // `pages.slots[].media` reference in the book.
      const before = await aRowWithoutTheGridTier('rederive-plain')

      const summary = await rederiveMedia({ payload, storage: aStore() })

      const after = await payload.findByID({
        collection: 'media',
        id: before.id,
        depth: 0,
        select: { sizes: true, caption: true },
      })
      expect(summary.rederived).toBeGreaterThan(0)
      expect(after.sizes?.grid?.filename).toBeTypeOf('string')
      expect(after.caption).toBe(before.caption)
    },
    REDERIVE_BUDGET_MS,
  )

  it(
    'leaves the row’s pipeline state alone, so a re-derivation does not take the diary dark',
    async () => {
      // `media.state` defaults to `processing`, and BOTH `collections/media.ts`'s
      // reader rule and `lib/galleryFrames.ts` withhold a row that is not
      // `ready` from a signed-out reader - the file route, the grid, the census
      // and the download handler. A re-derivation that reset the field would
      // turn every photograph in the diary dark, which is a worse outcome than
      // the missing tier it was run to fix.
      const before = await aRowWithoutTheGridTier('rederive-state')

      await rederiveMedia({ payload, storage: aStore() })

      const after = await payload.findByID({
        collection: 'media',
        id: before.id,
        depth: 0,
        select: { state: true },
      })
      expect({ before: before.state, after: after.state }).toEqual({ before: 'ready', after: 'ready' })
    },
    REDERIVE_BUDGET_MS,
  )

  it(
    'reports rather than throws for a row whose original is missing from the store',
    async () => {
      // A store missing a file is a real state (the 500 that Phase 1 Task 10
      // found). The script must name the row and carry on, not abort the run
      // halfway through the collection.
      const orphan = await aRowWhoseFileWasDeleted()

      const summary = await rederiveMedia({ payload, storage: aStore() })

      expect(summary.skipped).toContain(String(orphan.id))
    },
    REDERIVE_BUDGET_MS,
  )

  it(
    'is idempotent, so a second run changes nothing',
    async () => {
      await rederiveMedia({ payload, storage: aStore() })
      const first = await sizesSnapshot()

      await rederiveMedia({ payload, storage: aStore() })

      expect(await sizesSnapshot()).toEqual(first)
    },
    REDERIVE_BUDGET_MS,
  )

  it(
    'does no work at all on a second run, so a deploy step is not a re-encode of the library',
    async () => {
      // The assertion above would also pass if every row were re-uploaded and
      // happened to land on the same filenames. This one says the rows were
      // not touched: `rederived` counts the `payload.update` calls made, and a
      // complete corpus needs none.
      await rederiveMedia({ payload, storage: aStore() })

      const second = await rederiveMedia({ payload, storage: aStore() })

      expect(second.rederived).toBe(0)
    },
    REDERIVE_BUDGET_MS,
  )
})
