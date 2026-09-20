/**
 * sweepStagedUploads.integration.test.ts — the sweep removes the un-stripped
 * originals, and leaves everything else in the same store alone.
 *
 * ═══ THE ABSENCE IS ONLY MEANINGFUL BECAUSE THE PRESENCE IS SHOWN FIRST ═══
 *
 * A case that sweeps and then asserts the object is gone passes against an
 * empty store, against a store the fixture never wrote to, and against a sweep
 * that deletes nothing because it listed nothing. So the first case below
 * reads the staged object back OUT of the store and shows it carrying `exif`
 * BEFORE anything is asserted absent — the positive control Phase 3's own
 * EXIF row records a defect for the lack of (`docs/security.md`, "HOW THE
 * FIXTURE IS KNOWN TO CARRY REAL EXIF").
 *
 * ═══ AND THE STAGED OBJECT IS NOT WRITTEN BY THIS FILE ═══
 *
 * `stagePhotographThroughReceiver` asks the real planner for the key and PUTs
 * the bytes through the real receiver under a real capability token. Nothing
 * here spells a staging key; a hand-written one is refused by
 * `isStagingKeyFor` before it reaches the check it was written for, and one
 * that happened to match would be a fixture agreeing with itself.
 *
 * ═══ THE DECOY IS A NAME PAYLOAD CHOSE ═══
 *
 * The production store is rooted at `MEDIA_DIR`, which is where Payload keeps
 * every published photograph AND every derivative — so the listing the sweep
 * walks contains the book. `leaves a photograph Payload stored alone` puts a
 * real stored filename, read off a row Payload had just written, into the same
 * store the sweep is pointed at. Reading it rather than spelling `tokyo-1.jpg`
 * is the point: the case is about what Payload's naming actually is.
 * Depends on: vitest; `metadataMarkersIn` (@travel-diary/domain/media/exif);
 * `STAGED_UPLOAD_TTL_MS` (@travel-diary/domain/media/stagedObjects);
 * `aPhotographWithExif` (../adapters/contract/media-fixtures); the ingest
 * probes; ./sweepStagedUploads.
 */
import { metadataMarkersIn } from '@travel-diary/domain/media/exif'
import { STAGED_UPLOAD_TTL_MS } from '@travel-diary/domain/media/stagedObjects'
import { afterAll, describe, expect, it } from 'vitest'
import { aPhotographWithExif } from '../adapters/contract/media-fixtures'
import { ingestUpload } from './ingestUpload'
import { sweepStagedUploads } from './sweepStagedUploads'
import {
  aTempStore,
  ingestPhotograph,
  inlineDeps,
  removeIngestFixtures,
  stagePhotographThroughReceiver,
  storedFilenamesFor,
} from './testing/ingestProbes'

/** Past the window, so an object staged "now" is abandoned by the sweep's clock. */
const PAST_THE_WINDOW = STAGED_UPLOAD_TTL_MS + 1

afterAll(async () => {
  await removeIngestFixtures()
})

describe('sweepStagedUploads', () => {
  it('removes an abandoned staged original, and the bytes it removed really were unstripped', async () => {
    // 1 · Stage a photograph THROUGH the production path: the planner's key,
    //     a minted token, the real receiver. Nothing here writes a key by hand.
    const staged = await stagePhotographThroughReceiver({ bytes: await aPhotographWithExif() })

    // 2 · POSITIVE CONTROL, before anything is asserted absent: the object
    //     that is about to be swept is read back out of the store and shown to
    //     carry metadata. Without this the case below passes against an empty
    //     store.
    const before = await staged.storage.get(staged.input.stagingKey)
    expect(before.ok).toBe(true)
    expect(metadataMarkersIn(before.ok ? before.value : new Uint8Array())).toContain('exif')

    // 3 · Never finalised. Sweep with a clock past the window.
    const swept = await sweepStagedUploads({ storage: staged.storage }, Date.now() + PAST_THE_WINDOW)

    expect(swept.ok ? swept.value : []).toContain(staged.input.stagingKey)
    expect(await staged.storage.exists(staged.input.stagingKey)).toBe(false)
  })

  it('leaves the same staged original alone while it is still inside the window', async () => {
    // THE OTHER SIDE OF THE ONE CONSTANT THIS COMMAND TURNS ON. The case above
    // and this one differ in the clock and in nothing else, so together they
    // say the window decides — not the key, not the store, not the fixture.
    const staged = await stagePhotographThroughReceiver({ bytes: await aPhotographWithExif() })

    const swept = await sweepStagedUploads({ storage: staged.storage }, Date.now() + STAGED_UPLOAD_TTL_MS - 1_000)

    expect(swept).toEqual({ ok: true, value: [] })
    expect(await staged.storage.exists(staged.input.stagingKey)).toBe(true)
  })

  it('leaves a photograph Payload stored alone, because the store it walks is the one the book lives in', async () => {
    // THE CASE THAT MATTERS MOST. `MEDIA_DIR` holds the staging namespace AND
    // every published file, so a sweep that trusted the prefix it was handed
    // would delete the diary. The decoy's name is READ off a row Payload had
    // just written rather than spelled here.
    const media = await ingestPhotograph({ bytes: await aPhotographWithExif() })
    const stored = await storedFilenamesFor(media)
    const staged = await stagePhotographThroughReceiver({ bytes: await aPhotographWithExif() })
    for (const file of stored) {
      await staged.storage.put(file.filename, new Uint8Array([1]), 'image/jpeg')
    }

    const swept = await sweepStagedUploads({ storage: staged.storage }, Date.now() + PAST_THE_WINDOW)

    // The left side is what the sweep reported; the right side is what Payload
    // named. The sweep removed the staged original in the same run, so this is
    // not a sweep that did nothing.
    expect(swept.ok ? swept.value : []).toEqual([staged.input.stagingKey])
    for (const file of stored) {
      expect(await staged.storage.exists(file.filename)).toBe(true)
    }
  })

  it('reports nothing for an upload that was finalised, because the finalise already removed it', async () => {
    // `ingestUpload` deletes the staged copy in a `finally` on every path
    // (Phase 3 Task 8), so what this guards is that the sweep does not report
    // a key it did not remove — and does not reach past `staging/` to the row
    // the finalise created.
    const staged = await stagePhotographThroughReceiver({ bytes: await aPhotographWithExif() })
    const finalised = await ingestUpload(staged.input, await inlineDeps(staged.storage))
    expect(finalised.ok).toBe(true)

    const swept = await sweepStagedUploads({ storage: staged.storage }, Date.now() + PAST_THE_WINDOW)

    // `['not-ok']` rather than `[]` on the refusal arm, so an `err` fails this
    // case instead of satisfying it.
    expect(swept.ok ? swept.value : ['not-ok']).toEqual([])
    expect(await staged.storage.exists(staged.input.stagingKey)).toBe(false)
  })

  it('answers with nothing on a store that has never staged anything', async () => {
    // The scheduled command's ordinary run, and its very first one.
    const { storage } = await aTempStore()

    const swept = await sweepStagedUploads({ storage }, Date.now())

    expect(swept).toEqual({ ok: true, value: [] })
  })
})
