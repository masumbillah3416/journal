/**
 * media-processor-contract — the MediaProcessor contract suite (Ports &
 * Adapters). Written once, run against `inline` and against `worker`.
 *
 * ADR 0004 makes running it against BOTH non-negotiable, even though only
 * `inline` ever deploys before video is turned on: "A deferred code path with
 * no test rots invisibly, and 'flip one config' silently becomes 'flip one
 * config, then debug for three days.'" The still cases below need no `ffmpeg`
 * and are the ones the phase's exit criterion names; the clip case is
 * parameterised on `expectation.mode`, because whether video is accepted IS
 * what the flag switches - so one suite asserts both sides of it rather than
 * two suites drifting apart.
 *
 * ═══ WHY ONE SUITE CAN HONESTLY CLAIM "THE SAME PIPELINE" ═══
 *
 * The suite proves both adapters BEHAVE the same on stills. What makes that
 * true by construction rather than by two implementations happening to agree
 * is `apps/web/lib/media/stillPipeline.ts`: steps 1 to 6 live there ONCE and
 * both adapters compose it, and the `worker` adapter adds step 7 and nothing
 * else. If a reviewer asks whether the two still pipelines are the same, the
 * answer is that there is one.
 *
 * ═══ EVERY ABSENCE ASSERTION CARRIES ITS OWN POSITIVE CONTROL ═══
 *
 * In the same test, not a neighbouring one. "The stored bytes carry no EXIF
 * marker" is trivially true of zero bytes and of a file that failed to
 * encode, so each such case first asserts that the INPUT had the marker and
 * that the OUTPUT is a real result. That is the shape of defect two Phase 2
 * blockers had.
 * Depends on: vitest, the MediaProcessor port, ./media-fixtures, and the
 * domain's EXIF probe, SVG factory and duplicate predicate.
 */
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { metadataMarkersIn, readExifFacts } from '@travel-diary/domain/media/exif'
import type { PipelineMode } from '@travel-diary/domain/media/ingestPolicy'
import { isPerceptualDuplicate } from '@travel-diary/domain/media/perceptualHash'
import { anIsoBmffHeader, anSvgDocument } from '@travel-diary/domain/testing/bytes'
import type { MediaProcessor } from '../../ports/mediaProcessor'
import {
  aClip,
  aDifferentPhotograph,
  aPhotograph,
  aPhotographWithExif,
  aReencodedPhotograph,
  EXIF_CANARY,
  FIXTURE_CAPTURED_AT_ISO,
} from './media-fixtures'

/** The shape `dHash` renders and the `contentHash` column stores. */
const CONTENT_HASH_SHAPE = /^[0-9a-f]{16}$/

/**
 * The most of its input a stored still may weigh.
 *
 * Four fifths, and the measurements it sits between are in the case that
 * reads it. It is a CEILING on a re-encode rather than a derivative-tier
 * budget: CLAUDE.md §6's image budget belongs with the tiers (Phase 3 Task
 * 8), and this is the bound that keeps `mozjpeg` and `JPEG_QUALITY` from
 * being dropped without a test noticing.
 */
const SIZE_CEILING_OF_INPUT = 0.8

/**
 * Registers the shared MediaProcessor contract as a `describe` block.
 * @param name - Which adapter is under test, in the suite's title.
 * @param makeAdapter - Builds a fresh processor for one test.
 * @param expectation - `mode` says which side of the video switch this
 *   adapter is on. An options object rather than a bare string, so the call
 *   site says what the value means (CLAUDE.md §3.2).
 */
export const mediaProcessorContract = (
  name: string,
  makeAdapter: () => Promise<MediaProcessor>,
  expectation: { readonly mode: PipelineMode },
): void => {
  describe(`MediaProcessor contract: ${name}`, () => {
    it('reports the accepted types its mode allows, which is what the admin picker reads', async () => {
      const processor = await makeAdapter()

      expect(processor.acceptedTypes).toEqual(
        expectation.mode === 'inline'
          ? ['image/jpeg', 'image/png']
          : ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'],
      )
    })

    it('returns a still for a photograph, with the capture time read off its EXIF', async () => {
      const processor = await makeAdapter()

      const processed = await processor.process({
        bytes: await aPhotographWithExif(),
        declaredType: 'image/jpeg',
        filename: 'tokyo.jpg',
      })

      expect(processed.ok).toBe(true)
      expect(processed.ok ? processed.value.kind : null).toBe('still')
      expect(processed.ok ? processed.value.capturedAt : null).toBe(FIXTURE_CAPTURED_AT_ISO)
    })

    it('leaves no metadata marker in the bytes it returns, having first proven the input had one', async () => {
      const processor = await makeAdapter()
      const input = await aPhotographWithExif()

      // POSITIVE CONTROL, in this test rather than a neighbouring one: an
      // absence assertion over a fixture with nothing to remove is a test that
      // can never fail.
      expect(metadataMarkersIn(input)).toContain('exif')
      expect(Buffer.from(input).includes(EXIF_CANARY)).toBe(true)

      const processed = await processor.process({ bytes: input, declaredType: 'image/jpeg', filename: 'home.jpg' })
      const out = processed.ok ? Buffer.from(processed.value.bytes) : Buffer.alloc(0)

      // ... and the second half of the control: the artefact is a real,
      // non-empty result, so `[]` below cannot be the answer for zero bytes.
      expect(processed.ok).toBe(true)
      expect(out.length).toBeGreaterThan(0)
      expect(metadataMarkersIn(new Uint8Array(out))).toEqual([])
      expect(out.includes(EXIF_CANARY)).toBe(false)
    })

    it('applies the orientation it read, so a photograph on its side comes back upright', async () => {
      // Orientation 6 means rotate 90 degrees, so a 1200x900 input comes back
      // 900x1200 - and with the tag gone, so nothing rotates it a second time.
      const processor = await makeAdapter()
      const input = await aPhotographWithExif({ width: 1200, height: 900, orientation: 6 })

      // POSITIVE CONTROL: the input really is on its side. A fixture that
      // stated orientation 1 would make the dimensions below assert nothing.
      expect(readExifFacts(input).orientation).toBe(6)

      const processed = await processor.process({
        bytes: input,
        declaredType: 'image/jpeg',
        filename: 'sideways.jpg',
      })

      const still = processed.ok && processed.value.kind === 'still' ? processed.value : null
      expect(still === null ? null : { w: still.width, h: still.height }).toEqual({ w: 900, h: 1200 })
      // The tag is gone, so nothing downstream rotates it a second time.
      expect(still === null ? 6 : readExifFacts(still.bytes).orientation).toBeUndefined()
    })

    it('refuses an SVG declared as a JPEG, because an SVG is an HTML document', async () => {
      const processor = await makeAdapter()

      const processed = await processor.process({
        bytes: anSvgDocument(),
        declaredType: 'image/jpeg',
        filename: 'innocent.jpg',
      })

      expect(processed).toEqual({ ok: false, error: 'svg-rejected' })
    })

    it('refuses bytes it cannot identify rather than handing them to sharp', async () => {
      const processor = await makeAdapter()

      const processed = await processor.process({
        bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]),
        declaredType: 'image/jpeg',
        filename: 'photos.zip',
      })

      expect(processed).toEqual({ ok: false, error: 'type-not-allowed' })
    })

    it('refuses a photograph whose declared type disagrees with its own bytes', async () => {
      const processor = await makeAdapter()

      const processed = await processor.process({
        bytes: await aPhotograph(),
        declaredType: 'image/png',
        filename: 'mislabelled.png',
      })

      expect(processed).toEqual({ ok: false, error: 'declared-mismatch' })
    })

    it('refuses a truncated JPEG as unreadable rather than throwing', async () => {
      const processor = await makeAdapter()
      const whole = await aPhotograph()

      const processed = await processor.process({
        bytes: whole.slice(0, 64),
        declaredType: 'image/jpeg',
        filename: 'cut-short.jpg',
      })

      expect(processed).toEqual({ ok: false, error: 'unreadable' })
    })

    it('re-encodes a PNG as the one still format it stores, since both are accepted types', async () => {
      const processor = await makeAdapter()
      const png = await sharp({
        create: { width: 300, height: 200, channels: 3, background: { r: 20, g: 90, b: 140 } },
      })
        .png()
        .toBuffer()

      const processed = await processor.process({
        bytes: new Uint8Array(png),
        declaredType: 'image/png',
        filename: 'bergen.png',
      })

      expect(processed.ok ? processed.value.contentType : null).toBe('image/jpeg')
      expect(processed.ok ? processed.value.filename : null).toBe('bergen.jpg')
    })

    it('re-encodes inside BOTH size bounds, so neither the quality nor mozjpeg can be dropped unnoticed', async () => {
      // A FLOOR WITH NO CEILING IS HALF A BOUND, and this case was the fifth
      // instance of that shape in this repository (after `MAX_ATTEMPTS - 1`,
      // `HOURLY_RESEND_CAP - 1`, and Task 4's `!==` weakened to `<`, whose
      // author's diagnosis was "every size case I had written was on the
      // short side"). Every number below is measured on this machine against
      // the 1200x900 fixture, which arrives at 513,582 bytes:
      //
      //   quality 88, mozjpeg on - what the pipeline does    339,603   66.1%
      //   quality 88, mozjpeg OFF                            450,300   87.7%
      //   quality 100, mozjpeg on                            839,387  163.4%
      //   quality 10, mozjpeg on                              23,535    4.6%
      //
      // THE FLOOR catches a thumbnail-grade re-encode: 88 dropped to 10 left
      // every other case in this suite green, because a 9x8 perceptual hash
      // is indifferent to quantisation and nothing else looked at the size.
      // THE CEILING catches the two mutations that survived the floor -
      // `JPEG_QUALITY = 100`, and `mozjpeg: false`, which is a pure size
      // lever: CLAUDE.md §6 budgets images, and a suite with no ceiling
      // cannot see every stored still getting a third larger for no visible
      // gain. Four fifths of the input sits above what the pipeline produces,
      // with 14 points of headroom for an encoder upgrade, and below both
      // mutants.
      //
      // What neither bound can police is whether 88 is the RIGHT number:
      // that is a judgement about how a photograph looks, and a
      // visual-regression run over a rendered gallery tile is what would
      // settle it.
      const processor = await makeAdapter()
      const input = await aPhotograph()

      const processed = await processor.process({ bytes: input, declaredType: 'image/jpeg', filename: 'a.jpg' })

      const stored = processed.ok ? processed.value.bytes.length : 0
      expect(stored).toBeGreaterThan(input.length / 3)
      expect(stored).toBeLessThan(input.length * SIZE_CEILING_OF_INPUT)
    })

    it('hashes to the sixteen lowercase hex characters the contentHash column stores', async () => {
      const processor = await makeAdapter()

      const processed = await processor.process({
        bytes: await aPhotograph(),
        declaredType: 'image/jpeg',
        filename: 'a.jpg',
      })

      expect(processed.ok ? processed.value.contentHash : '').toMatch(CONTENT_HASH_SHAPE)
    })

    it('gives the same photograph the same content hash twice', async () => {
      const processor = await makeAdapter()
      const bytes = await aPhotograph()

      const first = await processor.process({ bytes, declaredType: 'image/jpeg', filename: 'a.jpg' })
      const second = await processor.process({ bytes, declaredType: 'image/jpeg', filename: 'b.jpg' })

      expect(first.ok && second.ok ? first.value.contentHash === second.value.contentHash : false).toBe(true)
    })

    it('gives a photograph the same hash whatever metadata it arrived with, since the hash is taken after the strip', async () => {
      // Two uploads of one photograph, one carrying GPS and one clean. The
      // hash is taken from the SANITISED bytes, so they must agree - and the
      // mutation that hashes the original instead is what this catches.
      const processor = await makeAdapter()

      const withExif = await processor.process({
        bytes: await aPhotographWithExif({ orientation: 1 }),
        declaredType: 'image/jpeg',
        filename: 'a.jpg',
      })
      const clean = await processor.process({
        bytes: await aPhotograph(),
        declaredType: 'image/jpeg',
        filename: 'b.jpg',
      })

      const both = withExif.ok && clean.ok
      expect(both ? isPerceptualDuplicate(withExif.value.contentHash, clean.value.contentHash) : false).toBe(true)
    })

    it('gives its own output the same hash it gave the input, which is what taking the hash after the strip means', async () => {
      // THE MUTATION THIS EXISTS TO CATCH is hashing `upload.bytes` instead of
      // the sanitised buffer. It survived every other case in this suite: the
      // 9x8 greyscale grid is identical for a photograph with EXIF and the
      // same photograph without it, so no pair of fixtures could tell the two
      // apart. This pair can. The input is on its side with an orientation
      // tag; the OUTPUT is already upright with no tag at all. Hashed after
      // the strip, both hash the upright image and agree. Hashed before it,
      // the first hashes a 1200x900 grid and the second a 900x1200 one, and
      // they disagree.
      const processor = await makeAdapter()

      const first = await processor.process({
        bytes: await aPhotographWithExif({ width: 1200, height: 900, orientation: 6 }),
        declaredType: 'image/jpeg',
        filename: 'sideways.jpg',
      })
      const stored = first.ok ? first.value.bytes : new Uint8Array()
      const again = await processor.process({ bytes: stored, declaredType: 'image/jpeg', filename: 'stored.jpg' })

      expect(first.ok).toBe(true)
      expect(again.ok).toBe(true)
      expect(again.ok ? again.value.contentHash : 'the second run failed').toBe(
        first.ok ? first.value.contentHash : 'the first run failed',
      )
    })

    it('gives a re-encoded copy a hash within the duplicate threshold', async () => {
      const processor = await makeAdapter()

      const original = await processor.process({
        bytes: await aPhotograph(),
        declaredType: 'image/jpeg',
        filename: 'a.jpg',
      })
      const reencoded = await processor.process({
        bytes: await aReencodedPhotograph(),
        declaredType: 'image/jpeg',
        filename: 'a-again.jpg',
      })

      const both = original.ok && reencoded.ok
      expect(both ? isPerceptualDuplicate(original.value.contentHash, reencoded.value.contentHash) : false).toBe(true)
    })

    it('gives a different photograph a hash outside the duplicate threshold', async () => {
      const processor = await makeAdapter()

      const one = await processor.process({
        bytes: await aPhotograph(),
        declaredType: 'image/jpeg',
        filename: 'a.jpg',
      })
      const other = await processor.process({
        bytes: await aDifferentPhotograph(),
        declaredType: 'image/jpeg',
        filename: 'b.jpg',
      })

      const both = one.ok && other.ok
      expect(both ? isPerceptualDuplicate(one.value.contentHash, other.value.contentHash) : true).toBe(false)
    })

    it('resolves rather than throwing, whatever the bytes are, which is the ports loudest invariant', async () => {
      // THE PORT'S HEADLINE INVARIANT, AND UNTIL NOW THE ONE THING THIS
      // SUITE DID NOT CHECK: "`process` NEVER THROWS. The bytes are
      // attacker-controlled, so every way of failing is a value." A rejected
      // promise here is a refusal path that crashes the request handler
      // instead of answering it - which is a 500 on an upload rather than a
      // message an author can act on.
      //
      // The four shapes below are the four ROUTES through an adapter: nothing
      // to sniff at all, bytes that reach `sharp` and cannot be decoded, a
      // container header that reaches the clip arm under `worker`, and one
      // whose declared type the policy refuses first. `allSettled` rather than
      // `await`, because a `rejects`-style assertion on one input stops at
      // the first and this case is about all of them settling.
      const processor = await makeAdapter()
      const hostile = [
        { named: 'no bytes at all', bytes: new Uint8Array(), declaredType: 'image/jpeg' },
        {
          named: 'a JPEG magic number and nothing else',
          bytes: new Uint8Array([0xff, 0xd8, 0xff]),
          declaredType: 'image/jpeg',
        },
        {
          named: 'a container header with no container',
          bytes: anIsoBmffHeader({ brand: 'isom' }),
          declaredType: 'video/mp4',
        },
        {
          named: 'a container header declared as a photograph',
          bytes: anIsoBmffHeader({ brand: 'qt' }),
          declaredType: 'image/jpeg',
        },
      ]

      const settled = await Promise.allSettled(
        hostile.map(({ bytes, declaredType }) => processor.process({ bytes, declaredType, filename: 'hostile.bin' })),
      )

      expect(settled.map((outcome, at) => `${hostile[at]?.named ?? 'unnamed'}: ${outcome.status}`)).toEqual(
        hostile.map(({ named }) => `${named}: fulfilled`),
      )
    })

    it('handles video the way its own mode says it should, which is the whole config switch', async () => {
      const processor = await makeAdapter()

      const processed = await processor.process({
        bytes: await aClip({ container: 'mp4' }),
        declaredType: 'video/mp4',
        filename: 'harbour.mp4',
      })

      if (expectation.mode === 'inline') {
        // ADR 0004: refused by the PORT, with the schema untouched, so
        // enabling clips stays one configuration change.
        expect(processed).toEqual({ ok: false, error: 'video-deferred' })
        return
      }

      expect(processed.ok ? processed.value.kind : null).toBe('clip')
      const clip = processed.ok && processed.value.kind === 'clip' ? processed.value : null
      expect(clip === null ? 0 : clip.durationSec).toBeGreaterThan(0)
      expect(clip === null ? null : clip.poster.kind).toBe('still')
    })

    it('handles a quicktime clip the way it handles an mp4, so the mode is about video and not one container', async () => {
      // THE FIXTURE IS `aClip`, NOT A RAW `ftyp` HEADER, and that is the whole
      // correctness of this case. It used to feed the worker adapter sixteen
      // synthetic bytes and assert `kind === 'clip'` - which only the RECORDED
      // STAND-IN can answer, because the stand-in reports a duration for
      // whatever it is handed while a real `ffprobe` refuses a header with no
      // container behind it. `clipToolchain.integration.test.ts`'s
      // toolchain-choice case asserts exactly that refusal for the same
      // fixture shape, so the two assertions could not both hold once
      // `ffmpeg` was installed: this one was asserting the stand-in's
      // permissiveness as though it were the contract. `aClip` generates a
      // real `.mov` wherever the binaries exist, so the accepted side is now
      // about a container in both configurations.
      const processor = await makeAdapter()

      const processed = await processor.process({
        bytes: await aClip({ container: 'quicktime' }),
        declaredType: 'video/quicktime',
        filename: 'harbour.mov',
      })

      if (expectation.mode === 'inline') {
        expect(processed).toEqual({ ok: false, error: 'video-deferred' })
        return
      }

      expect(processed.ok ? processed.value.kind : null).toBe('clip')
      const clip = processed.ok && processed.value.kind === 'clip' ? processed.value : null
      expect(clip === null ? 0 : clip.durationSec).toBeGreaterThan(0)
    })
  })
}
