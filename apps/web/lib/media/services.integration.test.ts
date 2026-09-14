/**
 * services.integration.test.ts — the smallest honest proof that
 * `MEDIA_PIPELINE` is wired to something rather than merely declared.
 *
 * ═══ WHY THE TWO MODES ARE NOT BOTH DRIVEN THROUGH `mediaProcessor()` ═══
 *
 * `env` is parsed once, at import, from the real `process.env` - that is the
 * whole point of `apps/web/lib/env.ts` - so making `mediaProcessor()` answer
 * for the other mode would mean stubbing our own module, which CLAUDE.md §2.3
 * forbids. What can be asserted without a mock is stronger than it looks, and
 * it is asserted here in two halves:
 *
 *   1. the configured processor's `acceptedTypes` EQUALS what the domain's
 *      `acceptedIngestTypes` answers for the configured mode - so the adapter
 *      a caller is handed agrees with the policy, rather than the agreement
 *      stopping at a Zod schema;
 *   2. the two modes' lists DIFFER - so the equality in (1) is a real
 *      constraint and not one that would hold whichever adapter was bound.
 *
 * Either half alone is vacuous. (1) with identical lists would pass for the
 * wrong adapter; (2) alone says nothing about what `mediaProcessor()` did.
 *
 * ═══ WHY (1) NO LONGER SAYS "THE FLAG REACHES THE ADAPTER", AND WHAT DOES ═══
 *
 * It used to, and the sentence stopped being true without anybody editing it.
 * Task 6 wrote that case while `MEDIA_PIPELINE` had TWO reachable values;
 * Task 8's `.refine` in `../env.ts` then made `'worker'` refuse at boot, so
 * `env.MEDIA_PIPELINE` is `'inline'` in every process that successfully
 * imports `env` - this one included. Both sides of (1) therefore evaluate
 * through the same single literal, and deleting the flag read outright -
 * `mediaProcessor = () => mediaProcessorFor('inline')` - leaves every case
 * here green. The whole-branch review's F3 proved that, 6/6.
 *
 * Neither task was wrong. The combination hollowed the claim out, which is why
 * no task-scoped reviewer had both halves in view. The case keeps its
 * assertion and loses the claim, and the property it used to make is now
 * asserted where it CAN fail: "reads MEDIA_PIPELINE rather than a literal"
 * below reads `services.ts` as SOURCE. That is the same instrument
 * `./tierRegistration.test.ts` uses, and for the same reason - the thing being
 * guarded is a shape of the code that no run of the code can distinguish.
 *
 * WHAT WOULD RESTORE A RUNTIME ASSERTION: the commit that deletes `env.ts`'s
 * `worker` refusal, because a worker exists. On that day `MEDIA_PIPELINE` has
 * two reachable values again, this file can drive both through
 * `mediaProcessor()` without stubbing anything, and the source-reading case
 * below is superseded rather than kept alongside.
 *
 * An `*.integration.test.ts` because `services.ts` transitively imports both
 * adapters and therefore `sharp`, which is native; the unit project is
 * Docker-free and pure by design. It needs no database.
 * Depends on: vitest, node:fs, node:path, node:url, ./services, `env`
 * (../env), the domain's ingest policy.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { acceptedIngestTypes } from '@travel-diary/domain/media/ingestPolicy'
import { anIsoBmffHeader } from '@travel-diary/domain/testing/bytes'
import { env } from '../env'
import { mediaProcessor, mediaProcessorFor } from './services'

/** The composition root, read as text rather than imported, for the case below. */
const SERVICES_SOURCE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'services.ts')

describe('the MediaProcessor the configured mode binds', () => {
  it('accepts exactly the types the configured mode names, and not another mode’s', () => {
    expect(mediaProcessor().acceptedTypes).toEqual(acceptedIngestTypes(env.MEDIA_PIPELINE))
  })

  it('reads MEDIA_PIPELINE rather than a literal, which is the half no run of this code can observe', () => {
    const source = readFileSync(SERVICES_SOURCE, 'utf8')

    const composition = /export const mediaProcessor = \(\): MediaProcessor =>([^\n]*)/.exec(source)

    expect(composition?.[1], 'services.ts no longer exports mediaProcessor in the shape this case reads').toBeDefined()
    expect(
      composition?.[1],
      'mediaProcessor() must delegate env.MEDIA_PIPELINE. Hard-coding the mode passes every other case in this file while the worker refusal stands, and silently ignores MEDIA_PIPELINE the day it is lifted',
    ).toContain('env.MEDIA_PIPELINE')
  })

  it('accepts different types in the two modes, without which the assertion above would hold either way', () => {
    expect(acceptedIngestTypes('inline')).not.toEqual(acceptedIngestTypes('worker'))
  })

  it('returns a fresh adapter per call rather than one shared instance', () => {
    // CLAUDE.md §3.3 rejects singletons holding mutable state. This is the
    // cheap check that the composition root did not become one.
    expect(mediaProcessor()).not.toBe(mediaProcessor())
  })
})

describe('the MediaProcessor each mode names', () => {
  // `mediaProcessorFor` takes the mode as an argument precisely so BOTH
  // answers are reachable without stubbing `env`, which CLAUDE.md §2.3
  // forbids - see ./services.ts's header.
  it('binds the stills-only adapter under inline, which is what defers video', () => {
    expect(mediaProcessorFor('inline').acceptedTypes).toEqual(['image/jpeg', 'image/png'])
  })

  it('binds the clip-accepting adapter under worker, which is the whole config switch', () => {
    expect(mediaProcessorFor('worker').acceptedTypes).toEqual([
      'image/jpeg',
      'image/png',
      'video/mp4',
      'video/quicktime',
    ])
  })

  it('refuses a clip under inline and not under worker, so the flag changes behaviour and not just a list', async () => {
    const clip = anIsoBmffHeader({ brand: 'isom' })
    const upload = { bytes: clip, declaredType: 'video/mp4', filename: 'harbour.mp4' }

    // The `worker` side here is handed the REAL ffmpeg toolchain by the
    // composition root, so on a machine without the binaries it refuses too -
    // but with `'unreadable'` from a failed subprocess, never
    // `'video-deferred'`, which is the refusal only `inline` can produce.
    expect(await mediaProcessorFor('inline').process(upload)).toEqual({ ok: false, error: 'video-deferred' })
    expect(await mediaProcessorFor('worker').process(upload)).not.toEqual({ ok: false, error: 'video-deferred' })
  })
})
