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
import { STAGING_PREFIX } from '@travel-diary/domain/media/uploadSlot'
import { aTempStore, removeIngestFixtures, stagePhotographThroughReceiver } from '../lib/media/testing/ingestProbes'
import type { StoragePort } from '../lib/ports/storage'
import { sweepStaged } from './sweep-staged'

/** Past the window, so an object staged "now" is abandoned by the command's clock. */
const PAST_THE_WINDOW = STAGED_UPLOAD_TTL_MS + 1

/**
 * The clock reading that makes a staged object exactly one millisecond too old.
 *
 * ═══ IT COMES OFF THE OBJECT, NOT OFF `Date.now()`, AND THAT IS THE FIX ═══
 *
 * `staleStagedObjects` compares `now - object.modifiedAt > ttlMs`, and
 * `modifiedAt` is the FILE'S OWN `mtimeMs`. Reading `now` from `Date.now()`
 * therefore compared two different clocks: on Windows the filesystem
 * timestamp is fractional, comes from a different source, and can LEAD
 * `Date.now()` — at which point `PAST_THE_WINDOW`'s one-millisecond margin is
 * spent and the sweep answers zero. Measured at 1 failure in 20 isolated runs,
 * and at three of four `verify:full` runs once a longer suite moved the
 * timing (Task 11 review, F2). Widening the margin only moves the race;
 * reading `now` off the same value the comparison uses removes it.
 *
 * IT ALSO FAILS LOUDLY. An empty listing used to arrive as "Swept 0", which
 * reads exactly like a sweep that decided not to delete — so a fixture that
 * staged nothing and a command that swept nothing were the same sentence.
 * @param storage - The store the object was staged into.
 * @returns A clock reading one millisecond past the object's own window.
 * @throws {Error} When the fixture staged nothing, which is the fixture
 *   failing rather than the command.
 */
const justPastTheWindowOf = async (storage: StoragePort): Promise<number> => {
  const listed = await storage.list(STAGING_PREFIX)
  if (!listed.ok) throw new Error(`the fixture's own store could not be listed: ${listed.error}`)
  const staged = listed.value[0]
  if (staged === undefined) throw new Error('the fixture staged no object, so there is nothing for the sweep to find')
  return staged.modifiedAt + PAST_THE_WINDOW
}

afterAll(async () => {
  await removeIngestFixtures()
})

describe('sweepStaged', () => {
  it('reports what it removed and exits 0', async () => {
    const staged = await stagePhotographThroughReceiver({ bytes: await aPhotographWithExif() })

    const report = await sweepStaged({ storage: staged.storage }, await justPastTheWindowOf(staged.storage))

    expect(report).toEqual({ message: 'Swept 1 abandoned staged upload(s).', exitCode: 0 })
  })

  it('names no storage key in what it prints', async () => {
    // A scheduler's log is not a place to publish the store's own naming.
    const staged = await stagePhotographThroughReceiver({ bytes: await aPhotographWithExif() })

    const report = await sweepStaged({ storage: staged.storage }, await justPastTheWindowOf(staged.storage))

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
