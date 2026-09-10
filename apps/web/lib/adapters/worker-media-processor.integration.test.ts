/**
 * worker-media-processor.integration.test.ts — the same shared MediaProcessor
 * contract, run against the adapter nothing deploys.
 *
 * ADR 0004's non-negotiable: "both adapters run the same contract suite in CI
 * from day one ... A deferred code path with no test rots invisibly." Its
 * still cases need no `ffmpeg` at all - they ARE `stillPipeline`, which both
 * adapters compose - so that half of the phase's exit criterion is green with
 * or without the binaries. Only the clip case needs them, and
 * `apps/web/lib/media/clipToolchain.ts`'s header says what happens when they
 * are missing and why that is a failure in CI rather than a skip.
 * The one block of assertions below that is NOT the shared contract carries
 * its own reason: the clip arm's three failure paths have no `inline`
 * equivalent, so there is nowhere in the contract for them to live.
 * Depends on: vitest, ./worker-media-processor,
 * ./contract/media-processor-contract, `clipToolchainForTests` and
 * `ClipToolchain` from ../media/clipToolchain, and the domain's Result and
 * byte-level fixtures.
 */
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { err, ok } from '@travel-diary/domain/result'
import type { Result } from '@travel-diary/domain/result'
import { anIsoBmffHeader } from '@travel-diary/domain/testing/bytes'
import type { ClipToolchain } from '../media/clipToolchain'
import { clipToolchainForTests } from '../media/clipToolchain'
import { mediaProcessorContract } from './contract/media-processor-contract'
import { createWorkerMediaProcessor } from './worker-media-processor'

mediaProcessorContract(
  'worker',
  () => Promise.resolve(createWorkerMediaProcessor({ toolchain: clipToolchainForTests() })),
  { mode: 'worker' },
)

/**
 * The clip arm's failure paths, which are the ONLY assertions in this file
 * that are not the shared contract - because they are the only behaviour
 * `inline` has no equivalent of. Each drives the real adapter with a
 * toolchain that fails at one step, which is legitimate where a stand-in for
 * `stillPipeline` would not be: a subprocess to an external binary is the
 * PROCESS BOUNDARY, which CLAUDE.md §2.3 names as mockable.
 *
 * They exist because the port's contract is that `process` NEVER THROWS, and
 * a toolchain that returns an error is how a real `ffmpeg` failure arrives.
 * Without these, every one of those three guards is an untested branch on the
 * path a production transcode failure takes.
 */
const aFailingToolchainAfter = (succeedingSteps: number): ClipToolchain => {
  let reached = 0
  const step = <T>(value: T): Promise<Result<T, string>> => {
    reached += 1
    return Promise.resolve(reached <= succeedingSteps ? ok(value) : err('the toolchain failed at this step'))
  }

  return {
    probe: () => step({ durationSec: 2 }),
    transcode: (bytes) => step(bytes),
    poster: () => step(new Uint8Array([0xff, 0xd8, 0xff, 0xdb])),
  }
}

describe('the worker adapter when the toolchain fails', () => {
  it.each([
    { failingStep: 'probe', succeedingSteps: 0 },
    { failingStep: 'transcode', succeedingSteps: 1 },
    { failingStep: 'poster extraction', succeedingSteps: 2 },
  ])('answers unreadable rather than throwing when $failingStep fails', async ({ succeedingSteps }) => {
    const processor = createWorkerMediaProcessor({ toolchain: aFailingToolchainAfter(succeedingSteps) })

    const processed = await processor.process({
      bytes: anIsoBmffHeader({ brand: 'isom' }),
      declaredType: 'video/mp4',
      filename: 'harbour.mp4',
    })

    expect(processed).toEqual({ ok: false, error: 'unreadable' })
  })

  it('propagates the still pipelines own refusal when the poster frame will not decode', async () => {
    // Three successful steps, but the "poster" is four bytes of JPEG header
    // with no image behind it - so the SHARED still pipeline refuses it, and
    // that refusal is what the clip must carry rather than a clip with a
    // poster nothing can render.
    const processor = createWorkerMediaProcessor({ toolchain: aFailingToolchainAfter(3) })

    const processed = await processor.process({
      bytes: anIsoBmffHeader({ brand: 'isom' }),
      declaredType: 'video/mp4',
      filename: 'harbour.mp4',
    })

    expect(processed).toEqual({ ok: false, error: 'unreadable' })
  })

  it('builds its own real ffmpeg toolchain when no stand-in is supplied, which is what production gets', () => {
    // The composition root always passes one, so this is the documented
    // default's only exercise. It asserts construction rather than a
    // transcode: the binaries are absent on the authoring machine, and a
    // transcode assertion here would pass in CI and fail locally for no
    // defect.
    expect(createWorkerMediaProcessor().acceptedTypes).toEqual([
      'image/jpeg',
      'image/png',
      'video/mp4',
      'video/quicktime',
    ])
  })

  it('refuses a clip whose declared type disagrees with its bytes before the toolchain runs', async () => {
    // The toolchain here would succeed at every step. The refusal has to come
    // from the ingest decision, which is the invariant that keeps
    // attacker-controlled bytes away from a decoder.
    const processor = createWorkerMediaProcessor({ toolchain: aFailingToolchainAfter(3) })

    const processed = await processor.process({
      bytes: anIsoBmffHeader({ brand: 'isom' }),
      declaredType: 'image/jpeg',
      filename: 'harbour.mp4',
    })

    expect(processed).toEqual({ ok: false, error: 'declared-mismatch' })
  })
})

/**
 * A toolchain that records what it was asked, and answers everything.
 *
 * A RECORDING STAND-IN RATHER THAN A REFUSING ONE, because two of this
 * adapter's invariants are about calls that must NOT happen and about an
 * ARGUMENT rather than a return value - neither of which any assertion about
 * the result can see. Both were verified unobservable without it: moving the
 * ingest decision after the toolchain, and taking the poster frame at second
 * 0 instead of the midpoint, each left the whole suite green.
 *
 * It stands in for the process boundary, which CLAUDE.md §2.3 names as
 * mockable - never for `stillPipeline`, which is ours.
 * @returns The toolchain, and the log it writes.
 */
const aRecordingToolchain = (): {
  readonly toolchain: ClipToolchain
  readonly calls: string[]
  posterAsked: number | undefined
} => {
  const record: { readonly calls: string[]; posterAsked: number | undefined } = { calls: [], posterAsked: undefined }
  const jpeg = sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 5, g: 55, b: 105 } } }).jpeg()

  return {
    calls: record.calls,
    get posterAsked() {
      return record.posterAsked
    },
    toolchain: {
      probe: () => {
        record.calls.push('probe')
        return Promise.resolve(ok({ durationSec: 2 }))
      },
      transcode: (bytes) => {
        record.calls.push('transcode')
        return Promise.resolve(ok(bytes))
      },
      poster: async (_bytes, atSeconds) => {
        record.calls.push('poster')
        record.posterAsked = atSeconds
        return ok(new Uint8Array(await jpeg.toBuffer()))
      },
    },
  }
}

describe('what the worker adapter asks the toolchain, and when', () => {
  it('asks it nothing at all when the declared type disagrees with the bytes', async () => {
    // The invariant: a clip reaches a SUBPROCESS only after the policy has
    // accepted it, for the same reason `stillPipeline` refuses before it
    // decodes. `ffmpeg` is a decoder and these bytes are attacker-controlled.
    const recording = aRecordingToolchain()

    const processed = await createWorkerMediaProcessor({ toolchain: recording.toolchain }).process({
      bytes: anIsoBmffHeader({ brand: 'isom' }),
      declaredType: 'image/jpeg',
      filename: 'harbour.mp4',
    })

    expect(processed).toEqual({ ok: false, error: 'declared-mismatch' })
    expect(recording.calls).toEqual([])
  })

  it('asks for the poster frame at the clips midpoint, not at its first frame', async () => {
    // A poster taken at second 0 is very often black, which is why the
    // fraction exists - and why an assertion about the ARGUMENT is the only
    // thing that can see it.
    const recording = aRecordingToolchain()

    await createWorkerMediaProcessor({ toolchain: recording.toolchain }).process({
      bytes: anIsoBmffHeader({ brand: 'isom' }),
      declaredType: 'video/mp4',
      filename: 'harbour.mp4',
    })

    expect(recording.calls).toEqual(['probe', 'transcode', 'poster'])
    expect(recording.posterAsked).toBe(1)
  })

  it('routes a clip by its bytes even when the part carried no declared type at all', async () => {
    // A browser sends `application/octet-stream` for a file whose extension
    // the operating system does not map, and a multipart part with no header
    // leaves `''`. Either way the ROUTING question is answered from the bytes:
    // routing on `declaredType` instead sent this to the still pipeline,
    // which refused it - and every other case in this file still passed,
    // because a clip declared as a JPEG earns `'declared-mismatch'` from
    // either path.
    const recording = aRecordingToolchain()

    const processed = await createWorkerMediaProcessor({ toolchain: recording.toolchain }).process({
      bytes: anIsoBmffHeader({ brand: 'isom' }),
      declaredType: 'application/octet-stream',
      filename: 'harbour.mp4',
    })

    expect(processed.ok ? processed.value.kind : null).toBe('clip')
    expect(recording.calls).toEqual(['probe', 'transcode', 'poster'])
  })
})
