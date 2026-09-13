/**
 * coverageThresholds.test.ts — every file the unit pass measures is matched by
 * at least one per-glob threshold key, so no file is gated by nothing.
 *
 * Written by the Phase 3 standards review as finding F1's fix and landed
 * unchanged; the gap it closes was stated in that task's own report as an open
 * concern, which is not the same as closing it.
 *
 * Pattern (CLAUDE.md §3.3): none of the seven. Two extractions and a set
 * comparison.
 *
 * The standards task removed `vitest.config.ts`'s repository-wide `90` floor.
 * That was safe on the day: the fall-through set was enumerated by hand and
 * held exactly two files, both now named. What it left behind is a property
 * with no guard — the enumeration is a measurement of one afternoon, and
 * `vitest.config.ts`'s own comment says so ("A THIRD FILE LANDING IN
 * apps/web/scripts/ IS NOT GATED BY EITHER ENTRY"). This is that enumeration
 * as a check, so the next file to fall through fails the commit that adds it
 * rather than the review that eventually notices.
 *
 * INVARIANTS a future edit could break:
 *   - The include, exclude and threshold lists are READ FROM THE CONFIG, never
 *     restated here. A copy of them would be the drift this guards against.
 *   - Matching uses picomatch, which is what Vitest's own `resolveThresholds`
 *     uses, so this agrees with the gate rather than approximating it.
 *   - The file list is git's, so a file added and not yet committed is still
 *     judged.
 *
 * Depends on: vitest, picomatch, ../../../../vitest.config, ./markdownCorpus.
 */
import picomatch from 'picomatch'
import { describe, expect, it } from 'vitest'
import unitConfig from '../../../../vitest.config'
import { repositoryFiles } from './markdownCorpus'

/** The coverage block of the Docker-free pass, read rather than restated. */
const coverage = (): {
  include: readonly string[]
  exclude: readonly string[]
  thresholds: Record<string, unknown>
} => {
  const test = (unitConfig as { test?: unknown }).test
  if (typeof test !== 'object' || test === null) throw new Error('vitest.config.ts declares no test block')
  const block = (test as { coverage?: unknown }).coverage
  if (typeof block !== 'object' || block === null) throw new Error('vitest.config.ts declares no coverage block')
  const { include, exclude, thresholds } = block as {
    include?: readonly string[]
    exclude?: readonly string[]
    thresholds?: Record<string, unknown>
  }
  if (!include || !exclude || !thresholds)
    throw new Error('the coverage block is missing include, exclude or thresholds')
  return { include, exclude, thresholds }
}

/** A floor on the files measured, so a config that stopped resolving fails here. */
const AT_LEAST_THIS_MANY_MEASURED_FILES = 100

/** A path deliberately outside every include, so the matcher is proved able to answer "no". */
const A_FILE_THE_UNIT_PASS_DOES_NOT_MEASURE = 'docs/testing.md'

describe('the files the unit coverage pass measures', () => {
  it('are each matched by at least one per-glob threshold, so none is gated by nothing', () => {
    const { include, exclude, thresholds } = coverage()
    const isIncluded = picomatch([...include])
    const isExcluded = picomatch([...exclude])
    const globs = Object.keys(thresholds).filter((key) => typeof thresholds[key] === 'object')
    const isGated = picomatch(globs)

    const measured = repositoryFiles().filter((file) => isIncluded(file) && !isExcluded(file))
    expect(
      measured.length,
      'no files were resolved as measured, so a green result here would mean nothing',
    ).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_MEASURED_FILES)

    const ungated = measured.filter((file) => !isGated(file)).sort()

    expect(
      ungated,
      'these files are inside the unit coverage include and matched by no threshold glob, so they are measured and gated by nothing - the repository-wide floor that used to catch them is gone',
    ).toEqual([])
  })

  it('are selected by a matcher that can actually answer no', () => {
    const { include, exclude } = coverage()
    const isIncluded = picomatch([...include])
    const isExcluded = picomatch([...exclude])

    expect(
      isIncluded(A_FILE_THE_UNIT_PASS_DOES_NOT_MEASURE) && !isExcluded(A_FILE_THE_UNIT_PASS_DOES_NOT_MEASURE),
    ).toBe(false)
    expect(isIncluded('apps/web/lib/result.ts') || isIncluded('apps/web/middleware.ts')).toBe(true)
  })
})
