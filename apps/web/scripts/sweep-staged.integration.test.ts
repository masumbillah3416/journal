/**
 * sweep-staged.integration.test.ts — the scheduled command's two exit codes.
 *
 * WHAT A SCHEDULER READS IS THE STATUS, NOT THE LINE. A sweep that could not
 * list the store and exited 0 is a green run in the platform's dashboard with
 * un-stripped originals accumulating underneath it, which is the one failure
 * this command can have that nobody would notice. Both sides are here.
 *
 * THE REFUSING STORE IS A STUB OF THE PORT, WHICH IS THE BOUNDARY. CLAUDE.md
 * §2.3 forbids mocking our own modules; `StoragePort` is the seam, and the
 * shared contract suite is what says the real adapter honours it. The arm
 * under test belongs to the COMMAND — what it does when a store refuses — and
 * the local adapter cannot refuse a listing of a fixed, valid prefix.
 * Depends on: vitest; `aPhotographWithExif` (../lib/adapters/contract/media-fixtures);
 * the ingest probes; `StoragePort` (../lib/ports/storage); ./sweep-staged.
 */
import { err } from '@travel-diary/domain/result'
import { afterAll, describe, expect, it } from 'vitest'
import { aPhotographWithExif } from '../lib/adapters/contract/media-fixtures'
import { STAGED_UPLOAD_TTL_MS } from '@travel-diary/domain/media/stagedObjects'
import { aTempStore, removeIngestFixtures, stagePhotographThroughReceiver } from '../lib/media/testing/ingestProbes'
import type { StoragePort } from '../lib/ports/storage'
import { sweepStaged } from './sweep-staged'

/** Past the window, so an object staged "now" is abandoned by the command's clock. */
const PAST_THE_WINDOW = STAGED_UPLOAD_TTL_MS + 1

afterAll(async () => {
  await removeIngestFixtures()
})

describe('sweepStaged', () => {
  it('reports what it removed and exits 0', async () => {
    const staged = await stagePhotographThroughReceiver({ bytes: await aPhotographWithExif() })

    const report = await sweepStaged({ storage: staged.storage }, Date.now() + PAST_THE_WINDOW)

    expect(report).toEqual({ message: 'Swept 1 abandoned staged upload(s).', exitCode: 0 })
  })

  it('names no storage key in what it prints', async () => {
    // A scheduler's log is not a place to publish the store's own naming.
    const staged = await stagePhotographThroughReceiver({ bytes: await aPhotographWithExif() })

    const report = await sweepStaged({ storage: staged.storage }, Date.now() + PAST_THE_WINDOW)

    // The key is the one the planner minted for THIS object, so this is a
    // comparison against a real key rather than against a shape.
    expect(report.message).not.toContain(staged.input.stagingKey)
  })

  it('exits 1 when the store could not be listed, so a failed sweep is not a green run', async () => {
    // A REAL ADAPTER WITH ONE METHOD REPLACED, not a hand-built object: the
    // other five are the local adapter's own, so nothing here has to assert a
    // shape into existence.
    const { storage } = await aTempStore()
    const refusing: StoragePort = { ...storage, list: () => Promise.resolve(err('the bucket said no')) }

    const report = await sweepStaged({ storage: refusing }, Date.now())

    expect(report.exitCode).toBe(1)
    expect(report.message).toContain('the bucket said no')
  })
})
