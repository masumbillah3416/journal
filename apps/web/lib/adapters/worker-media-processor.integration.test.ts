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
 * Depends on: vitest, sharp, ./worker-media-processor,
 * ./contract/media-processor-contract and ./contract/media-fixtures,
 * `clipToolchainForTests` and `ClipToolchain` from ../media/clipToolchain, and
 * the domain's ingest policy, Result and byte-level fixtures.
 */
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import type { AcceptedType } from '@travel-diary/domain/media/ingestPolicy'
import { acceptedIngestTypes } from '@travel-diary/domain/media/ingestPolicy'
import { err, ok } from '@travel-diary/domain/result'
import type { Result } from '@travel-diary/domain/result'
import { anIsoBmffHeader } from '@travel-diary/domain/testing/bytes'
import type { ClipToolchain } from '../media/clipToolchain'
import { clipToolchainForTests } from '../media/clipToolchain'
import { aPhotograph } from './contract/media-fixtures'
import { mediaProcessorContract } from './contract/media-processor-contract'
import { createWorkerMediaProcessor } from './worker-media-processor'

/** The mode this file's adapter is, named once for the registration and the routing case. */
const MODE_UNDER_TEST = 'worker' as const

mediaProcessorContract(
  'worker',
  () => Promise.resolve(createWorkerMediaProcessor({ toolchain: clipToolchainForTests() })),
  { mode: MODE_UNDER_TEST },
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

/**
 * A small decodable JPEG, for a step that has to SUCCEED on the way to the
 * one that fails.
 * @returns The frame's bytes.
 */
const aPosterFrame = (): Promise<Buffer> =>
  sharp({ create: { width: 32, height: 24, channels: 3, background: { r: 8, g: 60, b: 100 } } })
    .jpeg()
    .toBuffer()

/**
 * A toolchain that THROWS at one step rather than returning a typed error.
 *
 * Each step throws in a DIFFERENT SHAPE, because a `try`/`catch` around an
 * `await` has to cover all three and a factory that only ever rejected would
 * prove one: `probe` throws synchronously, `transcode` returns a rejected
 * promise, and `poster` throws from inside an `async` function.
 * @param throwingStep - Which of the three fails.
 * @returns A toolchain whose earlier steps succeed and whose named step
 *   throws.
 */
const aToolchainThrowingAt = (throwingStep: 'probe' | 'transcode' | 'poster'): ClipToolchain => {
  const crash = (): never => {
    throw new Error(`the toolchain crashed at ${throwingStep} rather than answering`)
  }

  return {
    probe: () => (throwingStep === 'probe' ? crash() : Promise.resolve(ok({ durationSec: 2 }))),
    transcode: (bytes) =>
      throwingStep === 'transcode'
        ? Promise.reject(new Error('the toolchain rejected at transcode rather than answering'))
        : Promise.resolve(ok(bytes)),
    poster: async () => (throwingStep === 'poster' ? crash() : ok(new Uint8Array(await aPosterFrame()))),
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

  it.each([
    { failingStep: 'probe', throwingStep: 'probe' as const },
    { failingStep: 'transcode', throwingStep: 'transcode' as const },
    { failingStep: 'poster extraction', throwingStep: 'poster' as const },
  ])(
    'answers unreadable rather than throwing when $failingStep throws instead of returning',
    async ({ throwingStep }) => {
      // A TOOLCHAIN THAT RETURNS AN ERROR IS NOT THE ONLY WAY ONE FAILS, and
      // the port's headline invariant is about the other way: "`process` NEVER
      // THROWS". In production the throwing paths are `withClipOnDisk`'s
      // `mkdtemp`/`writeFile` on a full or read-only disk, and
      // `createFfmpegToolchain`'s `readFile(output)` after an ffmpeg that
      // exited zero and wrote nothing. In the test suite it is
      // `MEDIA_REQUIRE_CLIP_TOOLCHAIN=1` on a runner with no binaries, which
      // is where this was first observed arriving as a rejected `process()`
      // call rather than a refusal.
      const processor = createWorkerMediaProcessor({ toolchain: aToolchainThrowingAt(throwingStep) })

      const processed = await processor.process({
        bytes: anIsoBmffHeader({ brand: 'isom' }),
        declaredType: 'video/mp4',
        filename: 'harbour.mp4',
      })

      expect(processed).toEqual({ ok: false, error: 'unreadable' })
    },
  )

  it('answers unreadable when the poster frame will not decode, rather than a clip with no poster', async () => {
    // THE NAME USED TO SAY "propagates the still pipeline's own refusal",
    // which is behaviour M13 deliberately REMOVED: the adapter flattens every
    // poster refusal to `'unreadable'` because the poster frame is our own
    // artefact (see `processClip`). The assertion could not tell propagation
    // from flattening - the flattened value happens to equal the pipeline's -
    // so the name claimed a distinction nothing here can observe.
    //
    // What it does assert: three successful toolchain steps, a "poster" that
    // is four bytes of JPEG header with no image behind it, and a refusal
    // rather than a clip whose poster nothing can render.
    const processor = createWorkerMediaProcessor({ toolchain: aFailingToolchainAfter(3) })

    const processed = await processor.process({
      bytes: anIsoBmffHeader({ brand: 'isom' }),
      declaredType: 'video/mp4',
      filename: 'harbour.mp4',
    })

    expect(processed).toEqual({ ok: false, error: 'unreadable' })
  })

  it('builds its own real ffmpeg toolchain when no stand-in is supplied, so a synthetic header is refused', async () => {
    // THE NAME CLAIMED A TOOLCHAIN AND THE BODY ASSERTED `acceptedTypes`,
    // which is identical whether or not one was built and is already asserted
    // by the contract's first case. This asserts something only the REAL
    // toolchain answers, and it answers the same on both kinds of machine:
    // sixteen bytes of `ftyp` header reach a spawn that fails where no binary
    // exists, and a real `ffprobe` that refuses them where one does. Either
    // way `'unreadable'`. A default that quietly became the recorded stand-in
    // would return a clip instead, because the stand-in reports a duration
    // for whatever it is handed.
    const processed = await createWorkerMediaProcessor().process({
      bytes: anIsoBmffHeader({ brand: 'isom' }),
      declaredType: 'video/mp4',
      filename: 'harbour.mp4',
    })

    expect(processed).toEqual({ ok: false, error: 'unreadable' })
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

/**
 * One decodable file per type the `worker` mode accepts.
 *
 * TYPED AS A TOTAL `Record` OVER `AcceptedType` ON PURPOSE, and that is what
 * makes the case below a gate rather than a snapshot of today: a type added to
 * `acceptedIngestTypes` fails the TYPECHECK here until it is given bytes, so
 * nobody can widen the policy and leave the routing question unasked.
 */
const BYTES_PER_ACCEPTED_TYPE: Record<AcceptedType, () => Promise<Uint8Array>> = {
  'image/jpeg': aPhotograph,
  'image/png': async () =>
    new Uint8Array(
      await sharp({ create: { width: 24, height: 18, channels: 3, background: { r: 90, g: 30, b: 40 } } })
        .png()
        .toBuffer(),
    ),
  'video/mp4': () => Promise.resolve(anIsoBmffHeader({ brand: 'isom' })),
  'video/quicktime': () => Promise.resolve(anIsoBmffHeader({ brand: 'qt' })),
}

describe('the mode the worker adapter hands the shared still pipeline', () => {
  it('cannot matter, because the toolchain takes exactly the types inline defers', async () => {
    // THE HOLE THIS CLOSES: changing the still delegation from
    // `runStillPipeline(upload, { mode: MODE })` to `{ mode: 'inline' }` left
    // every media test green, so the mode this adapter hands the shared
    // pipeline was unobserved. It cannot be observed DIRECTLY without
    // standing in for `runStillPipeline`, which is ours and therefore not
    // ours to mock (CLAUDE.md §2.3) - so what is asserted is the reason it
    // cannot matter, which is a fact about routing rather than about a
    // constant.
    //
    // The only mode-dependent behaviour in the shared pipeline is
    // `'video-deferred'`, and it needs a sniffed CLIP type. This adapter
    // routes every clip type to the toolchain before the pipeline sees one,
    // so the two lists agreeing is what makes the mode inert - and a third
    // video type added to the policy but not to this adapter's `CLIP_TYPES`
    // would reach the still pipeline, where the mode would decide its
    // refusal. That is the day this fails.
    const askedTheToolchain: AcceptedType[] = []
    for (const accepted of acceptedIngestTypes(MODE_UNDER_TEST)) {
      const recording = aRecordingToolchain()

      await createWorkerMediaProcessor({ toolchain: recording.toolchain }).process({
        bytes: await BYTES_PER_ACCEPTED_TYPE[accepted](),
        declaredType: accepted,
        filename: `routing.${accepted.split('/')[1] ?? 'bin'}`,
      })

      if (recording.calls.length > 0) askedTheToolchain.push(accepted)
    }

    const deferredByInline = acceptedIngestTypes(MODE_UNDER_TEST).filter(
      (accepted) => !acceptedIngestTypes('inline').some((still) => still === accepted),
    )
    expect(askedTheToolchain).toEqual(deferredByInline)
  })
})

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
