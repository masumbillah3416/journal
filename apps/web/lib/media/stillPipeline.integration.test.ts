/**
 * stillPipeline.integration.test.ts — the cases the contract suite cannot
 * reach through a MediaProcessor.
 *
 * Everything a caller can observe about the still pipeline is asserted
 * through the port, in
 * `apps/web/lib/adapters/contract/media-processor-contract.ts`, and belongs
 * there: a claim that only this file makes is a claim one adapter is free to
 * get wrong. Three things are left over, and each is here for a reason a
 * reviewer can check.
 *
 *   1. **The two seams `dHash` never had a caller for.** `dHash` requires
 *      exactly `DHASH_WIDTH * DHASH_HEIGHT` samples and answers sixteen hex
 *      characters, and until this task nothing called it - so nobody had
 *      shown that `sharp`'s `.greyscale().resize(9, 8)` returns exactly 72
 *      row-major samples, nor that the value the `contentHash` column
 *      receives is sixteen characters. The first is asserted here against
 *      `sharp` directly, which is the only place it can be; the second is
 *      asserted through the port as well.
 *   2. **The clip guard.** `runStillPipeline` is exported, so a caller can
 *      hand it clip bytes under `worker` mode, where the ingest policy
 *      ACCEPTS them. No MediaProcessor does that - the worker adapter routes
 *      clips to the toolchain - so the guard is unreachable through the
 *      contract and asserted here.
 *   3. **The stored filename.** A PNG comes out of this pipeline as a JPEG,
 *      so the stored name is re-extensioned; the odd names (no extension, a
 *      dotfile) have no upload path a browser produces and are asserted
 *      directly.
 *
 * Depends on: vitest, sharp, ./stillPipeline, the domain's perceptual-hash
 * constants, and the contract suite's own fixtures.
 */
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { DHASH_HEIGHT, DHASH_WIDTH } from '@travel-diary/domain/media/perceptualHash'
import { sniffMediaType } from '@travel-diary/domain/media/sniff'
import { anIsoBmffHeader } from '@travel-diary/domain/testing/bytes'
import { aPhotograph } from '../adapters/contract/media-fixtures'
import { runStillPipeline } from './stillPipeline'

describe('the grid the hash is taken from', () => {
  it('is exactly the sample count dHash requires, which nothing had checked before this caller existed', async () => {
    const grid = await sharp(Buffer.from(await aPhotograph()))
      .resize(DHASH_WIDTH, DHASH_HEIGHT, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer()

    expect(grid.length).toBe(DHASH_WIDTH * DHASH_HEIGHT)
    expect(grid.length).toBe(72)
  })

  it('is one byte per sample, so a greyscale raw buffer needs no channel arithmetic', async () => {
    const greyscale = await sharp(Buffer.from(await aPhotograph()))
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true })

    expect(greyscale.info.channels).toBe(1)
  })
})

describe('a clip handed to the still pipeline', () => {
  it('is refused as unreadable rather than reaching a decoder, even in the mode that accepts clips', async () => {
    // `worker` mode's ingest policy accepts `video/mp4`, so this is the one
    // arrangement where the guard is the only thing stopping clip bytes.
    const processed = await runStillPipeline(
      { bytes: anIsoBmffHeader({ brand: 'isom' }), declaredType: 'video/mp4', filename: 'harbour.mp4' },
      { mode: 'worker' },
    )

    expect(processed).toEqual({ ok: false, error: 'unreadable' })
  })

  it('is refused as video-deferred in the mode that defers clips, by the policy rather than the guard', async () => {
    const processed = await runStillPipeline(
      { bytes: anIsoBmffHeader({ brand: 'isom' }), declaredType: 'video/mp4', filename: 'harbour.mp4' },
      { mode: 'inline' },
    )

    expect(processed).toEqual({ ok: false, error: 'video-deferred' })
  })
})

describe('a file that sniffs as video but decodes as a still', () => {
  it('is refused rather than quietly stored as a jpeg, because video/mp4 means only that ftyp sits at offset 4', async () => {
    // THE INVARIANT THIS PINS is `media/sniff.ts`'s own: a `'video/mp4'`
    // answer rests on four bytes at offset 4 spelling `ftyp` and on nothing
    // else - the box length is never read and the brand's plausibility is
    // never checked - so A REAL AVIF SNIFFS AS `'video/mp4'`, and this build
    // of `sharp` DECODES AVIF.
    //
    // That combination is what makes the still-type guard load-bearing rather
    // than belt-and-braces. Under `worker` mode the ingest policy ACCEPTS
    // `'video/mp4'`, so without the guard these bytes reach the decoder, come
    // back a perfectly valid image, and get stored as a still that nothing
    // ever decided was one. The guard was verified unobservable without this
    // case: dropping it left all 80 tests green, because sharp refuses a
    // 16-byte fake `ftyp` header on its own and answers the same
    // `'unreadable'`.
    const avif = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 9, g: 99, b: 9 } } })
      .avif()
      .toBuffer()

    // POSITIVE CONTROLS, both halves: these bytes really are named video, and
    // they really do decode.
    expect(sniffMediaType(new Uint8Array(avif))).toBe('video/mp4')
    expect((await sharp(avif).metadata()).format).toBe('heif')

    const processed = await runStillPipeline(
      { bytes: new Uint8Array(avif), declaredType: 'video/mp4', filename: 'holiday.mp4' },
      { mode: 'worker' },
    )

    expect(processed).toEqual({ ok: false, error: 'unreadable' })
  })
})

describe('the name a stored still is given', () => {
  it('replaces the extension, since every stored still is a jpeg whatever arrived', async () => {
    const processed = await runStillPipeline(
      { bytes: await aPhotograph(), declaredType: 'image/jpeg', filename: 'tokyo.jpeg' },
      { mode: 'inline' },
    )

    expect(processed.ok ? processed.value.filename : null).toBe('tokyo.jpg')
  })

  it('appends an extension to a name that has none', async () => {
    const processed = await runStillPipeline(
      { bytes: await aPhotograph(), declaredType: 'image/jpeg', filename: 'tokyo' },
      { mode: 'inline' },
    )

    expect(processed.ok ? processed.value.filename : null).toBe('tokyo.jpg')
  })

  it('appends rather than replaces for a leading dot, which is a dotfile and not an extension', async () => {
    const processed = await runStillPipeline(
      { bytes: await aPhotograph(), declaredType: 'image/jpeg', filename: '.tokyo' },
      { mode: 'inline' },
    )

    expect(processed.ok ? processed.value.filename : null).toBe('.tokyo.jpg')
  })
})
