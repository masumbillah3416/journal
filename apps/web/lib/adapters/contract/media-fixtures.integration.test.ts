/**
 * media-fixtures.integration.test.ts — the fixtures' own positive controls.
 *
 * ═══ WHY THIS FILE COMES BEFORE THE CONTRACT SUITE ═══
 *
 * Every absence assertion in this phase — "the stored bytes carry no EXIF
 * marker", "the canary is gone" — is trivially true of a fixture that never
 * carried EXIF, of zero bytes, and of a file that failed to encode. So the
 * fixtures are checked FIRST, and by mechanisms other than the one that wrote
 * them:
 *
 *   - that a photograph is a DECODABLE JPEG of the dimensions asked for, read
 *     back through libvips' own metadata reader rather than assumed from the
 *     `sharp` call that produced it;
 *   - that the EXIF fixture carries the marker, the canary and the GPS
 *     coordinates — the last of them certified by RE-SERIALISATION, because
 *     `metadata().exif` comes back at full length even for a block libvips
 *     could not parse (see `apps/web/lib/media/exifFixtureCertification.test.ts`
 *     for the measurement), while a tag that survives `keepExif()` is a tag
 *     exiv2 actually parsed;
 *   - that `readExifFacts` — a hand-written parser — reads a real encoder's
 *     EXIF block correctly. Task 3 measured that agreement in a throwaway
 *     harness and wrote the numbers into a docstring; its own review flagged
 *     that a docstring is not a gate. This is the gate, on the sub-IFD side
 *     `exifFixtureCertification.test.ts` could not reach through `withExif`;
 *   - that the pixels are NOT FLAT. `dHash` compares each pixel with its
 *     right neighbour, so a solid-colour photograph hashes to all zeroes and
 *     the contract suite's duplicate cases would be comparing two identical
 *     constants. `perceptualHash.test.ts` asserts that all-zeroes behaviour
 *     for a flat grid, which is what makes this a fixture REQUIREMENT.
 *
 * It is an `*.integration.test.ts` rather than a unit test because it calls
 * `sharp`, which is native and does real I/O-shaped work; the unit project is
 * Docker-free and pure by design.
 *
 * PATTERN (CLAUDE.md §3.3): none of the seven. Fixtures put through a second
 * reader and checked.
 * Depends on: vitest, sharp, ./media-fixtures, and the domain's EXIF probe
 * and perceptual hash.
 */
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { metadataMarkersIn, readExifFacts } from '@travel-diary/domain/media/exif'
import {
  dHash,
  DHASH_HEIGHT,
  DHASH_WIDTH,
  DUPLICATE_MAX_DISTANCE,
  hammingDistance,
} from '@travel-diary/domain/media/perceptualHash'
import { sniffMediaType } from '@travel-diary/domain/media/sniff'
import { clipToolchainAvailable } from '../../media/clipToolchain'
import {
  aClip,
  aDifferentPhotograph,
  aPhotograph,
  aPhotographWithExif,
  aReencodedPhotograph,
  EXIF_CANARY,
  FIXTURE_CAPTURED_AT_ISO,
} from './media-fixtures'

/** The GPS latitude-reference tag, which the fixture writes as `'N'`. */
const TAG_GPS_LATITUDE_REF = 0x0001

/** The tag IFD0 reaches the GPS directory through. */
const TAG_GPS_INFO_IFD = 0x8825

/**
 * Whether a re-serialised EXIF block carries a tag id, in either byte order.
 *
 * A tag id is two bytes and the block's byte order is libvips' choice, so both
 * spellings are searched. This reads the block exiv2 RE-EMITTED, never the one
 * it was handed: a tag present there is one exiv2 parsed out of our bytes.
 * @param block - The EXIF payload from `sharp(...).keepExif()`'s output.
 * @param tag - The TIFF tag id to look for.
 * @returns True when either byte order's spelling of the id is present.
 */
const carriesTag = (block: Buffer, tag: number): boolean => {
  const high = (tag >> 8) & 0xff
  const low = tag & 0xff
  return block.includes(Buffer.from([high, low])) || block.includes(Buffer.from([low, high]))
}

/**
 * The EXIF block libvips re-emits after parsing a file's metadata.
 * @param bytes - A decodable JPEG carrying EXIF.
 * @returns The re-serialised block, or an empty buffer when there is none.
 */
const reSerialisedExif = async (bytes: Uint8Array): Promise<Buffer> => {
  const kept = await sharp(Buffer.from(bytes)).keepExif().jpeg().toBuffer()
  return (await sharp(kept).metadata()).exif ?? Buffer.alloc(0)
}

/**
 * The grayscale grid `dHash` is taken from, for a fixture's own bytes.
 * @param bytes - An encoded still.
 * @returns Every sample of the grid, row-major.
 */
const gridOf = async (bytes: Uint8Array): Promise<number[]> => {
  const raw = await sharp(Buffer.from(bytes))
    .resize(DHASH_WIDTH, DHASH_HEIGHT, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer()
  return [...raw]
}

describe('the photograph fixtures', () => {
  it('is a decodable jpeg of the size it was asked for, so an absence assertion has an artefact', async () => {
    const bytes = await aPhotograph({ width: 640, height: 480 })

    const metadata = await sharp(Buffer.from(bytes)).metadata()

    expect(metadata.format).toBe('jpeg')
    expect({ width: metadata.width, height: metadata.height }).toEqual({ width: 640, height: 480 })
  })

  it('defaults to a size Payload can derive every still tier from', async () => {
    const metadata = await sharp(Buffer.from(await aPhotograph())).metadata()

    expect({ width: metadata.width, height: metadata.height }).toEqual({ width: 1200, height: 900 })
  })

  it('carries no metadata marker at all, so it is a clean input where a case needs one', async () => {
    expect(metadataMarkersIn(await aPhotograph())).toEqual([])
  })

  it('has structure in its pixels rather than one flat colour, without which every duplicate case is vacuous', async () => {
    // A solid-colour photograph hashes to all zeroes, because dHash compares
    // each pixel with its right neighbour and finds no difference anywhere.
    const hashed = dHash(await gridOf(await aPhotograph()))

    expect(hashed.ok ? hashed.value : '').not.toBe('0000000000000000')
  })

  it('hashes to eight different row bytes rather than one repeated, which all-zeroes alone would not catch', async () => {
    // THIS CASE EXISTS BECAUSE THE FIRST VERSION OF THE FIXTURE FAILED IT.
    // A linear ramp is not flat, so it passed the case above - and it hashed
    // to `5555555555555555`, one byte repeated eight times, because a
    // monotonic ramp makes every adjacent comparison identical. Measured
    // through the real pipeline, its re-encoded copy sat at distance 0 from a
    // q40/q20/q10 chain and its second seed at distance 64: a threshold of 5
    // "surviving" a gap no photograph produces. A repeating row byte is the
    // signature of that degeneracy, and this is the assertion that names it.
    const hashed = dHash(await gridOf(await aPhotograph()))
    const rowBytes = (hashed.ok ? hashed.value : '').match(/../gu) ?? []

    expect(rowBytes).toHaveLength(DHASH_HEIGHT)
    expect(new Set(rowBytes).size).toBeGreaterThan(1)
  })

  it('yields exactly the sample count dHash requires, which is the seam dHash never had a caller for', async () => {
    const grid = await gridOf(await aPhotograph())

    expect(grid.length).toBe(72)
  })

  it('hashes to the sixteen characters the contentHash column stores', async () => {
    const hashed = dHash(await gridOf(await aPhotograph()))

    expect(hashed.ok ? hashed.value.length : 0).toBe(16)
    expect(hashed.ok ? hashed.value : '').toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('the exif photograph fixture', () => {
  it('carries the exif marker and the canary, so an absence assertion is not vacuous', async () => {
    const bytes = await aPhotographWithExif()

    expect(metadataMarkersIn(bytes)).toContain('exif')
    expect(Buffer.from(bytes).includes(EXIF_CANARY)).toBe(true)
  })

  it('carries gps coordinates a second parser can read, which is the reason this fixture exists', async () => {
    // SECURITY.md's objection in one line: "Shoot anything at home and you
    // have published your home address." A byte search over the block libvips
    // HANDED BACK would prove only that it found the segment; these tags come
    // out of the block exiv2 re-emitted from its own parsed model.
    const emitted = await reSerialisedExif(await aPhotographWithExif())

    expect(emitted.length).toBeGreaterThan(0)
    expect(carriesTag(emitted, TAG_GPS_INFO_IFD)).toBe(true)
    expect(carriesTag(emitted, TAG_GPS_LATITUDE_REF)).toBe(true)
    expect(emitted.includes(Buffer.from('N', 'latin1'))).toBe(true)
  })

  it('is read correctly by the domains own exif reader, which is what proves the hand-built unit fixture', async () => {
    // A hand-assembled fixture agreeing with a hand-written parser proves only
    // that one author was consistent. This is the case that checks the parser
    // against a real encoder.
    const facts = readExifFacts(await aPhotographWithExif({ orientation: 6 }))

    expect(facts).toEqual({ capturedAt: FIXTURE_CAPTURED_AT_ISO, orientation: 6 })
  })

  it('states the orientation it was asked for rather than the default', async () => {
    expect(readExifFacts(await aPhotographWithExif({ orientation: 3 })).orientation).toBe(3)
  })
})

/**
 * How many of the sixty-four bits two fixtures' hashes disagree on.
 * @param left - One fixture's bytes.
 * @param right - The other's.
 * @returns The distance, or 64 when either hash could not be taken - the
 *   fail-loud direction for a "within the threshold" assertion, and asserted
 *   against explicitly by the two cases below.
 */
const distanceBetween = async (left: Uint8Array, right: Uint8Array): Promise<number> => {
  const one = dHash(await gridOf(left))
  const other = dHash(await gridOf(right))
  const measured = hammingDistance(one.ok ? one.value : '', other.ok ? other.value : '')

  return measured.ok ? measured.value : 64
}

describe('the duplicate-detection fixtures', () => {
  // BOTH SIDES OF THE BOUNDARY ARE PINNED, not just the short one. Task 4's
  // one surviving mutation was `!==` weakened to `<`, diagnosed as "every
  // size case I had written was on the short side" - the fourth instance of
  // that shape in this repository.
  it('makes the re-encoded copy different BYTES from the original, or the duplicate case compares a file with itself', async () => {
    // THE MUTATION THIS EXISTS TO CATCH is encoding the "re-encoded" fixture
    // at the SAME quality as the original. It survived the whole suite: two
    // identical files are trivially within any threshold, and the duplicate
    // case then proves that a hash equals itself.
    const original = await aPhotograph()
    const reencoded = await aReencodedPhotograph()

    expect(Buffer.from(original).equals(Buffer.from(reencoded))).toBe(false)
    // ... and different bytes of the SAME photograph, not a different one:
    // the two must still decode to the same dimensions.
    const [a, b] = await Promise.all([
      sharp(Buffer.from(original)).metadata(),
      sharp(Buffer.from(reencoded)).metadata(),
    ])
    expect({ width: a.width, height: a.height }).toEqual({ width: b.width, height: b.height })
  })

  it('puts a re-encoded copy at or inside the threshold, measured against a real encoder', async () => {
    expect(await distanceBetween(await aPhotograph(), await aReencodedPhotograph())).toBeLessThanOrEqual(
      DUPLICATE_MAX_DISTANCE,
    )
  })

  it('puts a different photograph strictly outside the threshold, so the negative case is not vacuous', async () => {
    expect(await distanceBetween(await aPhotograph(), await aDifferentPhotograph())).toBeGreaterThan(
      DUPLICATE_MAX_DISTANCE,
    )
  })

  it('separates two different photographs by much more than the threshold, so the gap is not one bit wide', async () => {
    // MEASURED: 30 of 64 bits, which is what two photographs of two places
    // look like. The frequency-varying fixture exists for this number - a
    // shared-frequency, phase-shifted pair measured 7, one bit outside a
    // threshold of 5, and a linear ramp measured 64, every bit flipped at
    // once. Neither is a distance a real pair produces, and a negative case
    // sitting one bit outside the threshold is one an encoder upgrade breaks.
    expect(await distanceBetween(await aPhotograph(), await aDifferentPhotograph())).toBeGreaterThan(
      DUPLICATE_MAX_DISTANCE * 2,
    )
  })

  it('gives the identical bytes distance zero, which is the floor the two cases above sit above', async () => {
    const bytes = await aPhotograph()

    expect(await distanceBetween(bytes, bytes)).toBe(0)
  })
})

describe('the clip fixture', () => {
  it('sniffs as a clip type, whichever of its two options this machine produced', async () => {
    expect(sniffMediaType(await aClip())).toBe('video/mp4')
  })

  it('sniffs as quicktime when a quicktime container is asked for, which is what the contracts quicktime case rests on', async () => {
    // THE FAILURE THIS EXISTS TO NAME is a generated `.mov` whose major brand
    // is not QuickTime's. The contract's quicktime case declares
    // `video/quicktime`, so a container that sniffed as `video/mp4` would earn
    // `'declared-mismatch'` and fail that case with a refusal that says
    // nothing about the fixture. Asserted here, on the fixture, so the failure
    // names the fixture instead. UNRESOLVED on the authoring machine, where
    // `ffmpeg` is absent and option 2's `qt  ` header is what this reads; the
    // tool that settles the generated side is `ffmpeg` itself, and CI runs it.
    expect(sniffMediaType(await aClip({ container: 'quicktime' }))).toBe('video/quicktime')
  })

  it('refuses to fall back to a header where MEDIA_REQUIRE_CLIP_TOOLCHAIN forbids a stand-in, and generates a container where it can', async () => {
    // The variable's whole purpose is that a runner without the binaries fails
    // the build rather than testing less. The fixture side used to resolve its
    // own option through the bare availability probe, so it ignored the
    // variable and handed back sixteen synthetic bytes under the very
    // configuration that forbids a stand-in.
    //
    // Both arms are asserted and one is taken per machine, the same shape as
    // `clipToolchain.integration.test.ts`'s toolchain-choice case: pinning
    // either alone would pass here and fail in CI for no defect.
    const previous = process.env['MEDIA_REQUIRE_CLIP_TOOLCHAIN']
    process.env['MEDIA_REQUIRE_CLIP_TOOLCHAIN'] = '1'
    try {
      const asked = aClip()

      if (await clipToolchainAvailable()) {
        expect(sniffMediaType(await asked)).toBe('video/mp4')
        return
      }

      await expect(asked).rejects.toThrow(/ffmpeg/u)
    } finally {
      if (previous === undefined) delete process.env['MEDIA_REQUIRE_CLIP_TOOLCHAIN']
      else process.env['MEDIA_REQUIRE_CLIP_TOOLCHAIN'] = previous
    }
  })
})
