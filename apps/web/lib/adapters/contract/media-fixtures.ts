/**
 * media-fixtures — factories for the MediaProcessor contract suite.
 *
 * REAL FILES, PRODUCED BY A REAL ENCODER, and that is the point rather than
 * convenience. `packages/domain/src/testing/bytes.ts`'s `anExifJpeg()` is
 * hand-assembled bytes, which is right for unit-testing a parser and wrong
 * here: a hand-built fixture read by a hand-built parser proves only that the
 * two authors agreed. {@link aPhotographWithExif} asks `sharp` to write the
 * EXIF, so the fixture's layout is a real encoder's and the parser is checked
 * against it (see `media-fixtures.integration.test.ts`'s `readExifFacts`
 * case).
 *
 * EVERY ABSENCE ASSERTION IN THIS PHASE IS PAIRED WITH A POSITIVE CONTROL over
 * one of these factories. A fixture that never carried EXIF would satisfy
 * "EXIF is absent" while proving nothing, which is the shape of defect two
 * Phase 2 blockers had (fixtures sending a request no browser produces).
 *
 * ═══ THE IFD NUMBERING, MEASURED RATHER THAN ASSUMED ═══
 *
 * `withExif` takes a map keyed by numbered TIFF directory and writes each tag
 * into the directory NAMED. The numbers are libvips' own `ExifIfd` ordinals:
 * **`IFD0` is the main image directory, `IFD2` the Exif sub-IFD, `IFD3` the
 * GPS directory** - so `DateTimeOriginal` (0x9003) goes under `IFD2`, which
 * is where the specification puts it and where `readExifFacts` looks. That
 * closes the gap `exifFixtureCertification.test.ts`'s header records: naming
 * `IFD0` puts 0x9003 in IFD0, where nothing reads it, and a key named `Exif`
 * is accepted and written nowhere. `IFD2` is the name that works, and this
 * module's positive control is what proves it - a build whose numbering
 * differs fails THERE, by name, before any absence assertion can pass
 * vacuously.
 *
 * ═══ ORIENTATION IS NOT WRITTEN THROUGH withExif, AND THAT IS MEASURED ═══
 *
 * `withExif({ IFD0: { Orientation: '6' } })` is accepted and then SILENTLY
 * OVERWRITTEN: libvips writes the image's own `orientation` property into
 * the tag on output, and for a raw-pixel input that property is 1. Measured
 * on this machine's `sharp` 0.35.4 - four variants encoded and read back,
 * `withExif` alone reported `orientation: 1` while its EXIF block was
 * otherwise complete (304 bytes, canary present, GPS pointer present), and
 * `withExif(...).withMetadata({ orientation })` reported 6 with the same
 * 304-byte block. So the two calls are BOTH needed and neither is redundant:
 * `withExif` carries the canary, the capture time and the coordinates, and
 * `withMetadata` carries the orientation. This module's two orientation
 * cases are what keep that pair honest - drop `withMetadata` and the fixture
 * quietly says "upright", which would make the pipeline's rotation case
 * assert nothing.
 *
 * ═══ WHICH OF aClip()'s TWO OPTIONS THIS MACHINE PRODUCED ═══
 *
 * A real MP4 cannot be produced without an encoder, so {@link aClip} has two
 * options and reports which it used:
 *
 *   1. `ffmpeg` present: the clip is GENERATED at test time from `lavfi`'s
 *      `testsrc`, in the container asked for - `.mp4` or `.mov`. Generated,
 *      never committed, so no binary blob enters the repository. This is what
 *      CI gets, and it is the only option a REAL `ffprobe` accepts.
 *   2. `ffmpeg` absent: `anIsoBmffHeader()` with that container's brand -
 *      enough for the sniff, and therefore enough for the INLINE side of the
 *      clip cases, which is the side the phase's exit criterion names. It is
 *      NOT a video: `ffprobe` refuses it, and only the recorded stand-in -
 *      more permissive than `ffprobe` by construction - calls it a clip. So
 *      no case may assert that these bytes ARE a clip anywhere the real
 *      toolchain could be the one answering.
 *
 * **`ffmpeg` is not installed on the authoring machine, so option 2 is what
 * this machine got, and the UNRESOLVED notice comes from
 * `apps/web/lib/media/clipToolchain.ts`.** Neither option sends anything
 * anywhere: no sample video is downloaded and no bytes are uploaded to be
 * transcoded (CLAUDE.md §7.1).
 *
 * PATTERN (CLAUDE.md §2.3): Factory - overridable defaults, no shared mutable
 * state, a fresh `Uint8Array` per call.
 * Depends on: sharp, node's temp-file and subprocess modules for option 1,
 * `clipToolchainAvailable` from ../../media/clipToolchain, and the domain's
 * byte-level fixtures for option 2.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
// EXIF_CANARY IS NOT REDECLARED HERE. `packages/domain/src/testing/bytes.ts`
// defines it; this module imports it for the fixture below and re-exports it
// for the suite, so the domain's unit fixture and this adapter fixture cannot
// drift to two different strings - which they would, silently, since every
// absence assertion would still pass against whichever one it was given.
import { anIsoBmffHeader, EXIF_CANARY } from '@travel-diary/domain/testing/bytes'
import { clipEncoderCase } from '../../media/clipToolchain'

export { EXIF_CANARY }

/** The capture time the EXIF fixtures write, in EXIF's own colon form. */
export const FIXTURE_CAPTURED_AT_EXIF = '2025:03:14 09:26:53'

/** The same instant, as `readExifFacts` returns it. */
export const FIXTURE_CAPTURED_AT_ISO = '2025-03-14T09:26:53'

/** The default size both photograph fixtures encode at. */
const FIXTURE_SIZE = { width: 1200, height: 900 } as const

/** The orientation {@link aPhotographWithExif} writes: a photograph on its side. */
const FIXTURE_ORIENTATION = 6

/** Colour channels in the raw buffers below. No alpha: a photograph has none. */
const RGB_CHANNELS = 3

/** Keeps a computed sample inside a byte. */
const clampToByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)))

/**
 * Deterministic high-frequency detail, in the range 0-63.
 *
 * IT IS WHAT MAKES THE RE-ENCODE MEASUREMENT MEAN ANYTHING. Smooth content
 * survives JPEG quantisation almost perfectly, so a fixture built only from
 * sinusoids would hash IDENTICALLY at every quality and the duplicate
 * threshold would never be tested at all. This term is the part a low-quality
 * encode actually destroys. Deterministic rather than random, so two calls
 * produce the same photograph (CLAUDE.md §2.3: no shared mutable state, and
 * no fixture that differs run to run).
 * @param x - Column.
 * @param y - Row.
 * @param seed - Which photograph this is.
 * @returns An integer in 0-63.
 */
const detailAt = (x: number, y: number, seed: number): number =>
  ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) % 64

/** One spatial frequency component of a photograph's structure. */
interface Wave {
  /** Cycles across the width. */
  readonly across: number
  /** Cycles down the height. */
  readonly down: number
  readonly amplitude: number
  readonly phase: number
}

/**
 * The three waves one seed's photograph is built from.
 *
 * THE SEED CHANGES THE FREQUENCIES, NOT ONLY THE PHASE, and that is the
 * second thing measured about this fixture. With a shared frequency set and a
 * per-seed phase, two photographs differ by a coherent shift - which either
 * flips every comparison at once (the ramp's distance of 64) or almost none
 * of them (a measured 7, one bit outside a threshold of 5). Different
 * frequencies give different STRUCTURE, which is what two photographs of two
 * places actually have.
 * @param seed - Which photograph this is.
 * @returns Three waves, deterministic for a given seed.
 */
const wavesFor = (seed: number): readonly Wave[] => [
  { across: 2.4 + (seed % 5) * 0.9, down: 1.3 + (seed % 3) * 1.1, amplitude: 55, phase: seed * 0.7 },
  { across: 0.7 + (seed % 7) * 0.5, down: 3.1 + (seed % 4) * 0.8, amplitude: 40, phase: seed * 1.9 },
  { across: 5.3 + (seed % 11) * 0.4, down: 4.7 + (seed % 6) * 0.6, amplitude: 26, phase: seed * 3.1 },
]

/**
 * One channel's value at one pixel: {@link wavesFor}'s three sinusoids
 * summed, plus high-frequency detail.
 *
 * ═══ WHY IT IS NOT A LINEAR RAMP, WHICH IS WHAT IT WAS FIRST ═══
 *
 * The first version of this fixture was `(x * 3 + seed) % 256` per channel,
 * and it PASSED the "not flat" test while making both duplicate cases
 * vacuous - MEASURED, not suspected. A monotonic ramp downsampled to a 9x8
 * grid makes every adjacent comparison identical, so `dHash` answered the
 * repeating byte `5555555555555555`; the re-encoded copy came back at
 * distance 0 from a chain of q40/q20/q10 encodes AND from a downsize to
 * 400x300 and back, and the second seed came back at distance 64 - every
 * single bit flipped, because a different phase inverts every comparison at
 * once. A threshold of 5 "survived" a gap between 0 and 64 that no
 * photograph would ever produce. This repository's own planning notes name
 * that species: "a fixture that encodes an assumption", and a flat image
 * hashing to all zeroes is only its most obvious member.
 *
 * So the structure is deliberately NON-MONOTONIC and multi-scale: adjacent
 * samples of the downsampled grid differ in sign irregularly, which is what a
 * photograph does and what makes a Hamming distance mean something.
 * @param at - `across`/`down` are the normalised coordinate; `channel` phases
 *   red, green and blue apart; `x`/`y` feed {@link detailAt}; `seed` chooses
 *   the photograph.
 * @returns A byte.
 */
const sampleAt = (at: {
  readonly across: number
  readonly down: number
  readonly seed: number
  readonly channel: number
  readonly x: number
  readonly y: number
}): number => {
  const waves = wavesFor(at.seed).reduce(
    (total, wave) =>
      total +
      wave.amplitude *
        Math.sin(2 * Math.PI * (wave.across * at.across + wave.down * at.down) + wave.phase + at.channel * 1.1),
    0,
  )

  return clampToByte(120 + waves + detailAt(at.x, at.y, at.seed))
}

/**
 * Raw RGB pixels with real structure in them, as a function of coordinate and
 * `seed`.
 *
 * IT MATTERS THAT IT IS NOT FLAT: `dHash` compares each pixel with its right
 * neighbour, so a solid-colour photograph hashes to all zeroes - and the
 * duplicate cases would then be comparing two identical constants rather than
 * two photographs. `perceptualHash.test.ts`'s own flat-image case asserts
 * exactly that all-zeroes behaviour, which is what makes this a fixture
 * requirement rather than a preference.
 *
 * IT ALSO MATTERS THAT IT IS NOT A RAMP - see {@link sampleAt} for the
 * measurement, and this module's test for the assertions that would now catch
 * either degeneracy: a hash whose eight bytes are all the same value is
 * refused, not just a hash of all zeroes.
 * @param width - Pixels across.
 * @param height - Pixels down.
 * @param seed - Changes the pattern. Two photographs with different seeds must
 *   be far enough apart to sit outside `DUPLICATE_MAX_DISTANCE`, which the
 *   contract suite's negative duplicate case is what checks.
 * @returns `width * height * 3` bytes, row-major, RGB.
 */
const rawGradient = (width: number, height: number, seed: number): Buffer => {
  const pixels = Buffer.alloc(width * height * RGB_CHANNELS)
  for (let y = 0; y < height; y += 1) {
    const down = y / height
    for (let x = 0; x < width; x += 1) {
      const across = x / width
      const at = (y * width + x) * RGB_CHANNELS
      for (let channel = 0; channel < RGB_CHANNELS; channel += 1) {
        pixels[at + channel] = sampleAt({ across, down, seed, channel, x, y })
      }
    }
  }
  return pixels
}

/** The seed {@link aPhotograph} and {@link aPhotographWithExif} both use. */
const FIXTURE_SEED = 11

/** A seed far enough from {@link FIXTURE_SEED} to hash outside the duplicate threshold. */
const DIFFERENT_FIXTURE_SEED = 197

/**
 * A JPEG encoded from {@link rawGradient}'s pixels.
 * @param options - `seed` chooses the pattern; `width`/`height` its size;
 *   `quality` the encoder's setting, which is what a re-encode changes.
 * @returns The encoded file's bytes.
 */
const anEncodedGradient = async (options: {
  readonly seed: number
  readonly width: number
  readonly height: number
  readonly quality: number
}): Promise<Uint8Array> => {
  const buffer = await sharp(rawGradient(options.width, options.height, options.seed), {
    raw: { width: options.width, height: options.height, channels: RGB_CHANNELS },
  })
    .jpeg({ quality: options.quality })
    .toBuffer()

  return new Uint8Array(buffer)
}

/**
 * A JPEG photograph carrying GPS coordinates, a capture time, an orientation
 * and the ASCII canary.
 *
 * The GPS tags are the reason this fixture exists: SECURITY.md's objection is
 * that "Shoot anything at home and you have published your home address".
 * @param overrides - `width`/`height` default to 1200x900, large enough that
 *   Payload can derive `thumb`, `grid` and `tile` from it; `orientation`
 *   defaults to 6, which is a photograph on its side.
 * @returns The encoded file's bytes, fresh per call.
 * @example
 * await aPhotographWithExif({ orientation: 3 }) // upside down
 */
export const aPhotographWithExif = async (
  overrides: {
    readonly width?: number
    readonly height?: number
    readonly orientation?: number
  } = {},
): Promise<Uint8Array> => {
  const width = overrides.width ?? FIXTURE_SIZE.width
  const height = overrides.height ?? FIXTURE_SIZE.height
  const buffer = await sharp(rawGradient(width, height, FIXTURE_SEED), {
    raw: { width, height, channels: RGB_CHANNELS },
  })
    .withExif({
      IFD0: { Copyright: EXIF_CANARY },
      IFD2: { DateTimeOriginal: FIXTURE_CAPTURED_AT_EXIF },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '51/1 30/1 26/1',
        GPSLongitudeRef: 'W',
        GPSLongitude: '0/1 7/1 39/1',
      },
    })
    // Not `withExif`'s `IFD0.Orientation`, which libvips overwrites - see
    // this module's header for the four-variant measurement.
    .withMetadata({ orientation: overrides.orientation ?? FIXTURE_ORIENTATION })
    .jpeg({ quality: 92 })
    .toBuffer()

  return new Uint8Array(buffer)
}

/**
 * A photograph with no metadata at all, for the cases that need a clean input.
 * @param overrides - as {@link aPhotographWithExif}.
 * @returns The encoded file's bytes, fresh per call.
 */
export const aPhotograph = async (
  overrides: { readonly width?: number; readonly height?: number } = {},
): Promise<Uint8Array> =>
  anEncodedGradient({
    seed: FIXTURE_SEED,
    width: overrides.width ?? FIXTURE_SIZE.width,
    height: overrides.height ?? FIXTURE_SIZE.height,
    quality: 92,
  })

/**
 * The same pixels as {@link aPhotograph}, encoded at a lower quality - the
 * case perceptual hashing exists for, since the bytes differ and the
 * photograph does not.
 *
 * ENCODED FROM THE PIXELS, NOT RE-ENCODED FROM THE JPEG, and that is the
 * stricter of the two: `sharp(aPhotograph()).jpeg({ quality: 55 })` would
 * decode a q92 JPEG and re-encode it, so the result carries q92's own
 * artefacts and lands closer to the original than a second camera's file
 * would. Going back to the source pixels at q55 puts the full quantisation
 * difference between the two, which is what the threshold has to survive.
 * @returns The encoded file's bytes, fresh per call.
 */
export const aReencodedPhotograph = async (): Promise<Uint8Array> =>
  anEncodedGradient({ seed: FIXTURE_SEED, width: FIXTURE_SIZE.width, height: FIXTURE_SIZE.height, quality: 55 })

/**
 * A visibly different photograph, so the duplicate assertion has a negative
 * case.
 * @returns The encoded file's bytes, fresh per call.
 */
export const aDifferentPhotograph = async (): Promise<Uint8Array> =>
  anEncodedGradient({
    seed: DIFFERENT_FIXTURE_SEED,
    width: FIXTURE_SIZE.width,
    height: FIXTURE_SIZE.height,
    quality: 92,
  })

/** How long, and how large, option 1's generated clip is. */
const GENERATED_CLIP = { seconds: 1, size: '320x240', rate: 15 } as const

/**
 * Which container a clip fixture is asked for: the file extension that makes
 * `ffmpeg` write it, and the major brand option 2's header carries.
 *
 * The EXTENSION is what selects the muxer - `.mov` makes `ffmpeg` write a
 * QuickTime file whose major brand is `qt  `, which is what `sniffMediaType`
 * reads to answer `'video/quicktime'`. Pinned by
 * `media-fixtures.integration.test.ts`, so a build whose brand differs fails
 * there, by name, rather than inside the contract suite as a
 * `'declared-mismatch'` that says nothing about the fixture.
 */
const CLIP_CONTAINERS = {
  mp4: { extension: 'mp4', brand: 'isom' },
  quicktime: { extension: 'mov', brand: 'qt' },
} as const

/** Which container {@link aClip} produces. */
export type ClipContainer = keyof typeof CLIP_CONTAINERS

/**
 * Generates a real clip with `ffmpeg`'s own test source.
 * @param container - Which container to write.
 * @returns The file's bytes, or `undefined` when `ffmpeg` produced nothing.
 */
const aGeneratedClip = async (container: ClipContainer): Promise<Uint8Array | undefined> => {
  const directory = await mkdtemp(join(tmpdir(), 'diary-clip-fixture-'))
  const output = join(directory, `fixture.${CLIP_CONTAINERS[container].extension}`)
  try {
    const exitCode = await new Promise<number | null>((resolve) => {
      const child = spawn(
        'ffmpeg',
        [
          '-v',
          'error',
          '-y',
          '-f',
          'lavfi',
          '-i',
          `testsrc=size=${GENERATED_CLIP.size}:rate=${String(GENERATED_CLIP.rate)}`,
          '-t',
          String(GENERATED_CLIP.seconds),
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          output,
        ],
        { windowsHide: true },
      )
      child.on('error', () => {
        resolve(null)
      })
      child.on('close', resolve)
    })

    return exitCode === 0 ? new Uint8Array(await readFile(output)) : undefined
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

/**
 * A clip for the contract's two clip cases: a real container where `ffmpeg`
 * exists, an `ftyp` header otherwise. See this module's header for which this
 * machine produced, and why neither option fetches or uploads anything.
 *
 * THE OPTION IS RESOLVED THROUGH `clipEncoderCase()`, never through a second
 * copy of the availability probe. That is what makes the fixture honour
 * `MEDIA_REQUIRE_CLIP_TOOLCHAIN`: under that variable, with no binaries, this
 * THROWS the message naming both of them rather than quietly handing back
 * sixteen synthetic bytes no real `ffprobe` would accept.
 * @param options - `container` picks the container the `ffmpeg` option writes,
 *   and therefore the type the bytes sniff as. An options object rather than a
 *   bare string so the call site says what the value means (CLAUDE.md §3.2).
 * @returns The clip's bytes, fresh per call.
 * @throws {Error} Case 2 of `clipToolchain.ts`'s three: the binaries are
 *   absent and `MEDIA_REQUIRE_CLIP_TOOLCHAIN=1` forbids a stand-in.
 * @example
 * await aClip({ container: 'quicktime' }) // a real .mov wherever ffmpeg is
 */
export const aClip = async (options: { readonly container?: ClipContainer } = {}): Promise<Uint8Array> => {
  const container = options.container ?? 'mp4'
  if ((await clipEncoderCase()) === 'real') {
    const generated = await aGeneratedClip(container)
    if (generated !== undefined) return generated
  }

  return anIsoBmffHeader({ brand: CLIP_CONTAINERS[container].brand })
}
