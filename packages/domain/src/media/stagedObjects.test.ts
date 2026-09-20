/**
 * stagedObjects.test.ts — which staged objects a sweep may delete, and the
 * three refusals that keep it from deleting anything else.
 *
 * THE FUNCTION UNDER TEST DECIDES WHAT GETS DESTROYED, so every case here is
 * written as a refusal with one thing changed: the same object is kept while a
 * row points at it, kept while it is young, kept while its key is not one the
 * planner minted, and removed only when none of those holds.
 * Depends on: vitest, ./stagedObjects.
 */
import { describe, expect, it } from 'vitest'
import type { StagedObject } from './stagedObjects'
import { staleStagedObjects } from './stagedObjects'

/**
 * One line of a store listing.
 *
 * `modifiedAt` is the only field a caller ever overrides, so it is a named
 * parameter rather than a `Partial` — a factory whose defaults nothing reads
 * is a factory that hides which field a case is actually about.
 * @param key - The object's key, exactly as a listing reports it.
 * @param modifiedAt - When it was last written, as epoch milliseconds.
 * @returns The listing line.
 */
const aStagedObject = (key: string, modifiedAt: number): StagedObject => ({ key, modifiedAt })

/** A clock reading well past any fixture's write, so the arithmetic is real. */
const NOW = 10_000_000

/** One hour, the window every case below is measured against. */
const TTL = 3_600_000

describe('staleStagedObjects', () => {
  it('leaves an object alone while a media row still points at it', () => {
    const objects = [aStagedObject('staging/j1/a.jpg', 0)]

    expect(staleStagedObjects(objects, new Set(['staging/j1/a.jpg']), NOW, TTL)).toEqual([])
  })

  it('leaves a young orphan alone, because an upload in flight has no row yet', () => {
    // An upload that is still being PUT has no media row and is not abandoned.
    // Sweeping on orphanhood alone deletes the author's photograph mid-upload.
    const objects = [aStagedObject('staging/j1/b.jpg', NOW - 1_000)]

    expect(staleStagedObjects(objects, new Set(), NOW, TTL)).toEqual([])
  })

  it('sweeps an orphan older than the window', () => {
    const objects = [aStagedObject('staging/j1/c.jpg', 0)]

    expect(staleStagedObjects(objects, new Set(), NOW, TTL)).toEqual(['staging/j1/c.jpg'])
  })

  // ═══ BOTH SIDES OF THE WINDOW, AND THE WINDOW MOVING ═══
  //
  // The window is the one number that decides between "in flight" and
  // "abandoned", and this is a DELETE. So the last age that is kept and the
  // first age that is swept are both written down, and a third case proves the
  // line sits where `ttlMs` puts it rather than where a literal does.

  it('keeps an orphan whose age is exactly the window, so the window is inclusive', () => {
    const objects = [aStagedObject('staging/j1/d.jpg', NOW - TTL)]

    expect(staleStagedObjects(objects, new Set(), NOW, TTL)).toEqual([])
  })

  it('sweeps an orphan one millisecond past the window', () => {
    const objects = [aStagedObject('staging/j1/e.jpg', NOW - TTL - 1)]

    expect(staleStagedObjects(objects, new Set(), NOW, TTL)).toEqual(['staging/j1/e.jpg'])
  })

  it('moves the line with the window it is given, rather than aging on a fixed schedule', () => {
    // The case that kills a hard-coded hour: THE SAME object, kept at one
    // window and swept at a shorter one.
    const objects = [aStagedObject('staging/j1/f.jpg', NOW - TTL)]

    expect(staleStagedObjects(objects, new Set(), NOW, TTL)).toEqual([])
    expect(staleStagedObjects(objects, new Set(), NOW, TTL / 2)).toEqual(['staging/j1/f.jpg'])
  })

  // ═══ DEFAULT-DENY ON THE KEY ═══

  it('never returns a key outside the staging prefix, whatever it is handed', () => {
    // Default-deny: the sweep DELETES, so a bug here destroys a photograph
    // somebody published. The guard is in the pure module, where it is cheap
    // to prove, rather than in the caller, where it is one refactor from gone.
    const objects = [aStagedObject('media/j1/published.jpg', 0)]

    expect(staleStagedObjects(objects, new Set(), NOW, TTL)).toEqual([])
  })

  it('never returns a key from a directory that merely begins with the staging one', () => {
    // `staging-archive` is not `staging`, and a prefix test written as
    // `key.startsWith('staging')` would delete out of it. The same boundary
    // the Storage port's own listing case pins one layer down.
    const objects = [aStagedObject('staging-archive/j1/kept.jpg', 0)]

    expect(staleStagedObjects(objects, new Set(), NOW, TTL)).toEqual([])
  })

  it('never returns a key of the right shape at the wrong depth', () => {
    // `staging/loose.jpg` has no journey segment, so nothing this repository
    // mints produced it — and a sweep that deleted it would be acting on a key
    // it cannot account for. Recognise what to keep, do not enumerate what to
    // remove (CLAUDE.md §3.3's inversion, `eslint-rules/guarded-server-actions.js`).
    const objects = [aStagedObject('staging/loose.jpg', 0)]

    expect(staleStagedObjects(objects, new Set(), NOW, TTL)).toEqual([])
  })

  it('returns every stale orphan it is handed, not the first one it finds', () => {
    const objects = [aStagedObject('staging/j1/one.jpg', 0), aStagedObject('staging/j2/two.jpg', 0)]

    expect(staleStagedObjects(objects, new Set(), NOW, TTL)).toEqual(['staging/j1/one.jpg', 'staging/j2/two.jpg'])
  })
})
