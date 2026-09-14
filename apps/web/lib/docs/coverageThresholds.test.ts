/**
 * coverageThresholds.test.ts — no file either coverage pass measures is gated
 * by nothing, and no gate either pass sets below 95% is missing from the
 * register CLAUDE.md §1.2 makes the place for it.
 *
 * Written by the Phase 3 standards review as finding F1's fix, for
 * `vitest.config.ts` alone. The whole-branch review extended it: F5 found the
 * integration config had no equivalent — its `include` is a hand-enumerated
 * list of exact paths, so a path added there without a threshold key is
 * measured and gated by nothing, which is Phase 2's finding 36 — and F1 found
 * that four sub-95 gates had landed in it while `docs/deviations.md` §46 still
 * said "Six". Both are properties that can only go stale ACROSS tasks, which is
 * exactly the kind a task-scoped reviewer cannot see and a check can.
 *
 * Pattern (CLAUDE.md §3.3): none of the seven. Extractions and set comparisons.
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
 *   - The include, exclude and threshold lists are READ FROM THE CONFIGS, never
 *     restated here. A copy of them would be the drift this guards against, and
 *     so would a copy of §46's file list.
 *   - Matching uses picomatch, which is what Vitest's own `resolveThresholds`
 *     uses, so this agrees with the gate rather than approximating it.
 *   - The file list is git's, so a file added and not yet committed is still
 *     judged.
 *   - §46 is located by its heading NUMBER, not its title. The title changed in
 *     this same round (it used to begin "Six per-file branch gates"), which is
 *     the drift the number-only lookup survives.
 *
 * Depends on: vitest, picomatch, node:fs, ../../../../vitest.config,
 * ../../../../vitest.integration.config, ./markdownCorpus.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import picomatch from 'picomatch'
import { describe, expect, it } from 'vitest'
import unitConfig from '../../../../vitest.config'
import integrationConfig from '../../../../vitest.integration.config'
import { REPOSITORY_ROOT, repositoryFiles } from './markdownCorpus'

/** One coverage pass's own lists, as Vitest will read them. */
interface CoverageBlock {
  readonly include: readonly string[]
  readonly exclude: readonly string[]
  readonly thresholds: Record<string, unknown>
}

/**
 * The coverage block of one Vitest config, read rather than restated.
 * @param config - The imported config module's default export.
 * @param named - How to name the config in a failure message.
 * @returns Its `include`, `exclude` and `thresholds`.
 * @throws If the config declares no test block, no coverage block, or a
 *   coverage block missing any of the three — each of which would otherwise
 *   make this file's set comparisons pass over nothing.
 */
const coverageOf = (config: unknown, named: string): CoverageBlock => {
  const test = (config as { test?: unknown }).test
  if (typeof test !== 'object' || test === null) throw new Error(`${named} declares no test block`)
  const block = (test as { coverage?: unknown }).coverage
  if (typeof block !== 'object' || block === null) throw new Error(`${named} declares no coverage block`)
  const { include, exclude, thresholds } = block as {
    include?: readonly string[]
    exclude?: readonly string[]
    thresholds?: Record<string, unknown>
  }
  if (!include || !exclude || !thresholds)
    throw new Error(`${named}'s coverage block is missing include, exclude or thresholds`)
  return { include, exclude, thresholds }
}

/** The Docker-free pass's coverage block. */
const coverage = (): CoverageBlock => coverageOf(unitConfig, 'vitest.config.ts')

/** The Postgres-backed pass's coverage block. */
const integrationCoverage = (): CoverageBlock => coverageOf(integrationConfig, 'vitest.integration.config.ts')

/** A floor on the files measured, so a config that stopped resolving fails here. */
const AT_LEAST_THIS_MANY_MEASURED_FILES = 100

/**
 * A floor on the files the integration pass measures.
 *
 * Lower than the unit pass's because this `include` is a hand-enumerated list
 * of exact paths rather than a set of directory globs — it is a count of the
 * files somebody chose, not of a tree.
 */
const AT_LEAST_THIS_MANY_MEASURED_INTEGRATION_FILES = 30

/** A path deliberately outside every include, so the matcher is proved able to answer "no". */
const A_FILE_THE_UNIT_PASS_DOES_NOT_MEASURE = 'docs/testing.md'

/** The axis floor CLAUDE.md §2.1 sets for `apps/web/lib/**`. */
const STANDARD_COVERAGE_FLOOR = 95

/**
 * The threshold entries of one pass that sit below §2.1's floor on any axis.
 * @param thresholds - A coverage block's `thresholds`, keys and all.
 * @returns One path per entry with a lines, branches or functions figure under
 *   95, sorted — the set §46 is the register of.
 */
const gatesBelowTheStandardFloor = (thresholds: Record<string, unknown>): readonly string[] =>
  Object.entries(thresholds)
    .filter(([, gate]) => {
      if (typeof gate !== 'object' || gate === null) return false
      return Object.entries(gate).some(
        ([axis, value]) =>
          ['lines', 'branches', 'functions', 'statements'].includes(axis) &&
          typeof value === 'number' &&
          value < STANDARD_COVERAGE_FLOOR,
      )
    })
    .map(([file]) => file)
    .sort()

/**
 * Whether a file's whole body is `c8 ignore`d, with a reason at the hint.
 *
 * THIS IS THE OTHER HONEST TREATMENT CLAUDE.md §2.1 NAMES, and it is why an
 * ungated file is not automatically a defect: a measured file must be gated by
 * a threshold OR be wholly ignored for a stated reason. `vitest.integration.globalSetup.ts`
 * is the live case — a `globalSetup` module runs in Vitest's main process, which
 * the v8 provider does not instrument, so it reports a false 0% for code that
 * demonstrably ran.
 * @param file - A repository-relative path.
 * @returns True when the file opens an ignored region with a `--` reason and
 *   closes it.
 */
const isWhollyIgnored = (file: string): boolean => {
  const source = readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8')
  return source.includes('c8 ignore start -- ') && source.includes('c8 ignore stop')
}

/**
 * The files `docs/deviations.md` §46's table lists as carrying a sub-95 gate.
 *
 * THE SECTION IS FOUND BY ITS NUMBER, NOT ITS TITLE, and the paths come out of
 * the section's own table rather than from a list kept here — a copy of the
 * register would be the very drift this guards.
 *
 * IT READS TABLE ROWS, NOT EVERY BACKTICKED PATH, and that distinction is the
 * whole point: §46's prose names files it is NOT registering (the check that
 * holds it to the config, for one), so "every path mentioned in §46" would make
 * the register grow every time somebody wrote a sentence in it. The table is
 * what the entry calls the register, so the table is what is read.
 * @returns One repository-relative path per row of §46's table, sorted.
 * @throws If §46 cannot be located, which would otherwise leave the comparisons
 *   below comparing against an empty set and passing.
 */
const filesRegisteredInDeviation46 = (): readonly string[] => {
  const register = readFileSync(path.join(REPOSITORY_ROOT, 'docs/deviations.md'), 'utf8')
  const section = /^## 46 [\s\S]*?(?=^## 47 )/m.exec(register)
  if (section === null)
    throw new Error('docs/deviations.md has no section 46, so there is no register to compare against')
  const rows = [...section[0].matchAll(/^\| {0,2}`((?:apps|packages)\/[^`]+\.ts)` *\|/gm)].map(
    (match) => match[1] ?? '',
  )
  return [...new Set(rows)].sort()
}

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

describe('the files the integration coverage pass measures', () => {
  it('are each matched by at least one per-file threshold, so none is gated by nothing', () => {
    const { include, exclude, thresholds } = integrationCoverage()
    const isIncluded = picomatch([...include])
    const isExcluded = picomatch([...exclude])
    const isGated = picomatch(Object.keys(thresholds).filter((key) => typeof thresholds[key] === 'object'))

    const measured = repositoryFiles().filter((file) => isIncluded(file) && !isExcluded(file))
    expect(
      measured.length,
      'no files were resolved as measured, so a green result here would mean nothing',
    ).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_MEASURED_INTEGRATION_FILES)

    const ungated = measured.filter((file) => !isGated(file) && !isWhollyIgnored(file)).sort()

    expect(
      ungated,
      'these files are inside the integration coverage include, matched by no threshold key, and not wholly c8-ignored with a reason - so they are measured and gated by nothing, and this config has no repository-wide floor to catch them, deliberately',
    ).toEqual([])
  })

  it('include one the threshold list does not gate, so the ignore arm above is load-bearing rather than decorative', () => {
    const { include, exclude, thresholds } = integrationCoverage()
    const isIncluded = picomatch([...include])
    const isExcluded = picomatch([...exclude])
    const isGated = picomatch(Object.keys(thresholds).filter((key) => typeof thresholds[key] === 'object'))

    const leaningOnTheIgnore = repositoryFiles().filter(
      (file) => isIncluded(file) && !isExcluded(file) && !isGated(file),
    )

    expect(
      leaningOnTheIgnore.length,
      'nothing reaches the c8-ignore arm, so the case above would pass with that arm deleted',
    ).toBeGreaterThan(0)
  })
})

describe('the gates either pass sets below CLAUDE.md §2.1 95%', () => {
  it('are each a row in docs/deviations.md §46, which is where a reader not already looking finds them', () => {
    const registered = filesRegisteredInDeviation46()
    expect(
      registered.length,
      'section 46 named no files, so comparing against it would pass whatever the configs say',
    ).toBeGreaterThan(0)

    const shortfalls = gatesBelowTheStandardFloor(integrationCoverage().thresholds)
    expect(
      shortfalls.length,
      'no sub-95 gate was found in the integration config, so this case would pass with an empty register',
    ).toBeGreaterThan(0)

    const unregistered = shortfalls.filter((file) => !registered.includes(file))

    expect(
      unregistered,
      'these files carry a gate below §2.1’s 95% in vitest.integration.config.ts and no row in docs/deviations.md §46 - stated at the point of exclusion only, which is where somebody already looking will see it',
    ).toEqual([])
  })

  it('are the only files §46 claims, so a gate raised to 95 does not leave a row behind', () => {
    const shortfalls = gatesBelowTheStandardFloor(integrationCoverage().thresholds)

    const stale = filesRegisteredInDeviation46().filter((file) => !shortfalls.includes(file))

    expect(
      stale,
      'docs/deviations.md §46 lists these as carrying a sub-95 gate and vitest.integration.config.ts no longer does - a register that outlives its entries is the same defect as one that misses them',
    ).toEqual([])
  })
})
