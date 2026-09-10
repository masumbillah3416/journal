/**
 * exifFixtureCertification.test.ts — the committed proof that
 * `packages/domain`'s hand-built EXIF fixture carries EXIF a parser other
 * than ours can read, and that our reader can read EXIF it did not build.
 *
 * ═══ WHY THIS FILE EXISTS, AND WHY IT IS NOT IN packages/domain ═══
 *
 * `anExifJpeg()` builds an APP1 segment byte by byte and `readExifFacts`
 * reads it back. On their own those two agree with each other and with
 * nothing else: a wrong offset written into the fixture and read out of it
 * again passes every case in `packages/domain/src/media/exif.test.ts` while a
 * real camera's file reads as carrying no metadata at all. Task 3 measured the
 * agreement against an independent parser in a throwaway harness and wrote the
 * numbers into a docstring, which its own review flagged: a docstring is not a
 * gate, and the layout was one silent edit away from agreeing only with our
 * own reader.
 *
 * This is that gate. It lives here rather than beside the fixture because the
 * independent parser is `sharp`/libvips/exiv2, and `packages/domain` must
 * depend on no encoder — it is pure, runs in Node with no native module, and
 * is gated at 100%.
 *
 * ═══ WHY THE CERTIFICATION IS A RE-SERIALISATION AND NOT A BYTE SEARCH ═══
 *
 * Asking libvips for the EXIF block and searching it for the two values does
 * NOT prove libvips parsed anything: `metadata().exif` is the APP1 payload
 * libvips extracted, and it comes back at its full length even when the
 * block's byte-order mark and TIFF magic number are corrupted — measured, by
 * mutating both in the fixture and watching this file's size assertion stay
 * green. A byte search over that buffer therefore certifies only that libvips
 * found the segment.
 *
 * So the fixture is instead put THROUGH libvips: `keepExif()` makes exiv2
 * re-emit the metadata from its own parsed model, and what comes back is a
 * block libvips laid out — different entry counts, different value offsets,
 * a Copyright value where exiv2 chose to put it and a sub-IFD exiv2 built.
 * Every value still in it is a value exiv2 successfully READ out of our
 * bytes, and every value our reader then finds in it is one it found at an
 * offset it did not write. The two directions certify each other, which is
 * what neither a byte search nor a self-round-trip can do.
 *
 * ═══ WHAT IS CERTIFIABLE IN WHICH DIRECTION, AND WHY THEY DIFFER ═══
 *
 * **Orientation certifies in both directions.** libvips reads the orientation
 * out of our fixture, in either byte order, and our reader reads the
 * orientation out of a JPEG libvips wrote — whose TIFF block is little-endian
 * (`II`), the opposite of the fixture's default, so a real file exercises both.
 *
 * **`DateTimeOriginal` certifies in one direction only, and the other is
 * impossible rather than untried.** The EXIF specification puts
 * `DateTimeOriginal` (tag `0x9003`) in the Exif sub-IFD, which IFD0 reaches
 * through tag `0x8769`, and that is where `readExifFacts` looks. `sharp`'s
 * public `withExif` takes a map keyed by numbered TIFF directory and writes
 * each tag into the directory named — so
 * `withExif({ IFD0: { DateTimeOriginal } })` puts `0x9003` in IFD0, where the
 * specification does not put it and our reader does not look, and a key named
 * `Exif` is accepted and silently written nowhere. Hand-decoding the block
 * libvips produced shows it: IFD0's seven entries end `69 87 04 00` (the
 * sub-IFD pointer) and `03 90 02 00` (`DateTimeOriginal`, in IFD0), and the
 * sub-IFD it points at holds six tags — `0x9000`, `0x9101` and
 * `0xa000`–`0xa003` — none of them `0x9003`. So there is no way to ask `sharp`
 * to write the tag where the tag belongs, and `readExifFacts` on a
 * `sharp`-written JPEG returns `{ orientation: 1 }` with no `capturedAt`. The
 * last case below pins exactly that, so the next reader to try the round trip
 * finds the answer here instead of concluding the reader is broken.
 *
 * ═══ PATTERN (CLAUDE.md §3.3) ═══
 *
 * None of the seven. It is a fixture put through a second parser and read
 * back; naming a pattern for that would be cargo cult.
 *
 * Depends on: vitest, sharp (the independent parser), `@travel-diary/domain`'s
 * EXIF reader and its byte-level fixtures.
 */
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { readExifFacts } from '@travel-diary/domain/media/exif'
import { anExifJpeg, EXIF_CANARY } from '@travel-diary/domain/testing/factories'

/**
 * The EXIF block libvips extracts from the default fixture: the six
 * `Exif\0\0` identifier bytes plus that fixture's 113-byte TIFF block.
 *
 * A LITERAL, NOT A DERIVATION. Recomputing it from the fixture's own length
 * would assert that libvips handed back as many bytes as it was given, which
 * is true of a block libvips could not parse either. Pinned, a change to the
 * hand-built layout has to be acknowledged here.
 */
const DEFAULT_FIXTURE_EXIF_BYTES = 119

/** The capture time the fixture stores, in EXIF's own `YYYY:MM:DD HH:MM:SS`. */
const FIXTURE_CAPTURED_AT = '2025:03:14 09:26:53'

/** The same instant in the ISO-like form `readExifFacts` answers with. */
const FIXTURE_CAPTURED_AT_READ_BACK = '2025-03-14T09:26:53'

/**
 * Splices the fixture's APP1 segment into a JPEG libvips just encoded, so the
 * result is a decodable photograph carrying hand-built metadata.
 *
 * The fixture has no pixel data — nothing in `packages/domain` decodes an
 * image — and libvips reads metadata only off a file it can decode, so the
 * segment has to travel inside a real one to be read at all.
 * @param fixture - A whole file from `anExifJpeg`: SOI, its APP1 segment, EOI.
 * @returns The encoded photograph with that segment behind its own SOI.
 */
const aPhotographCarrying = async (fixture: Uint8Array): Promise<Buffer> => {
  const photograph = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 90, g: 120, b: 60 } },
  })
    .jpeg()
    .toBuffer()
  const app1 = fixture.subarray(2, fixture.length - 2)

  return Buffer.concat([photograph.subarray(0, 2), Buffer.from(app1), photograph.subarray(2)])
}

/**
 * Re-encodes a photograph, keeping its metadata, so exiv2 re-emits every tag
 * it managed to parse from a layout of its own choosing.
 * @param photograph - A decodable JPEG carrying EXIF.
 * @returns The re-encoded file's bytes.
 */
const reSerialisedByLibvips = (photograph: Buffer): Promise<Buffer> => sharp(photograph).keepExif().jpeg().toBuffer()

/**
 * Encodes a JPEG with libvips, carrying the orientation it is asked for.
 * @param orientation - The EXIF orientation value to store.
 * @returns The encoded file's bytes.
 */
const aLibvipsJpeg = (orientation: number): Promise<Buffer> =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .withMetadata({ orientation })
    .jpeg()
    .toBuffer()

describe('the hand-built EXIF fixture, read by libvips', () => {
  it('is extracted as an EXIF block of the size its layout predicts', async () => {
    const spliced = await aPhotographCarrying(anExifJpeg())

    const metadata = await sharp(spliced).metadata()

    expect(metadata.format).toBe('jpeg')
    expect(metadata.exif?.length).toBe(DEFAULT_FIXTURE_EXIF_BYTES)
  })

  it('reports to libvips the orientation it was built with', async () => {
    const spliced = await aPhotographCarrying(anExifJpeg({ orientation: 6 }))

    expect((await sharp(spliced).metadata()).orientation).toBe(6)
  })

  it('reports that orientation to libvips from a little-endian TIFF block', async () => {
    const spliced = await aPhotographCarrying(anExifJpeg({ byteOrder: 'little-endian', orientation: 8 }))

    expect((await sharp(spliced).metadata()).orientation).toBe(8)
  })
})

describe('the hand-built EXIF fixture, re-serialised by libvips', () => {
  it('comes back in a block libvips laid out, not the bytes it was handed', async () => {
    const spliced = await aPhotographCarrying(anExifJpeg())
    const supplied = (await sharp(spliced).metadata()).exif

    const emitted = (await sharp(await reSerialisedByLibvips(spliced)).metadata()).exif

    expect(supplied).toBeDefined()
    expect(emitted).toBeDefined()
    expect(emitted?.equals(supplied ?? Buffer.alloc(0))).toBe(false)
  })

  it('still carries the canary, so exiv2 parsed the Copyright tag holding it', async () => {
    const spliced = await aPhotographCarrying(anExifJpeg())

    const emitted = (await sharp(await reSerialisedByLibvips(spliced)).metadata()).exif

    expect(emitted).toBeDefined()
    expect(emitted?.includes(Buffer.from(EXIF_CANARY, 'latin1'))).toBe(true)
  })

  it('still carries the capture time, so exiv2 parsed the sub-IFD holding it', async () => {
    const spliced = await aPhotographCarrying(anExifJpeg({ capturedAt: FIXTURE_CAPTURED_AT }))

    const emitted = await reSerialisedByLibvips(spliced)

    expect(readExifFacts(new Uint8Array(emitted)).capturedAt).toBe(FIXTURE_CAPTURED_AT_READ_BACK)
  })
})

describe('a JPEG libvips wrote, read by our reader', () => {
  it('yields the orientation libvips put in it, out of a little-endian block', async () => {
    const written = await aLibvipsJpeg(6)

    expect(readExifFacts(new Uint8Array(written)).orientation).toBe(6)
  })

  it('yields no capture time, because withExif cannot write the Exif sub-IFD', async () => {
    // Not a defect in the reader, and not an untried direction: see this
    // file's header. `sharp` writes `DateTimeOriginal` into whichever numbered
    // directory the caller names, never into the sub-IFD the specification
    // puts it in, so this round trip cannot be made to succeed from here. If
    // it ever does, `sharp` has gained sub-IFD support and three documents
    // that say it cannot need revisiting.
    const written = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .withExif({ IFD0: { DateTimeOriginal: FIXTURE_CAPTURED_AT } })
      .jpeg()
      .toBuffer()

    expect(readExifFacts(new Uint8Array(written)).capturedAt).toBeUndefined()
  })
})
