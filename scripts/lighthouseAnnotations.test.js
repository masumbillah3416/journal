/**
 * lighthouseAnnotations.test.js — what CI is told about a Lighthouse run.
 *
 * ═══ THE CASES ARE THE THREE THINGS THAT HAVE ACTUALLY HAPPENED ═══
 *
 * A gate went red and the number was unreadable; a gate went green and nobody
 * could tell how much margin it had; and, once, a configuration ran and the
 * step failed with no assertion output at all. Each is a case here, and each
 * asserts the LINE a reader would see rather than an internal shape — the
 * whole point of this module is what appears on a run page.
 *
 * The fixtures are factories with overrides (CLAUDE.md §2.3): an assertion
 * result is a real lhci entry shape, and each case overrides the one or two
 * fields it is about.
 *
 * IT IS PLAIN JAVASCRIPT, matching the module it drives and the script that
 * module serves. Nothing typechecks this directory, which is why the shapes
 * are asserted here.
 * Depends on: vitest; the module under test.
 */
import { describe, expect, it } from 'vitest'
import { annotationLines } from './lighthouseAnnotations.mjs'

/**
 * One entry of `.lighthouseci/assertion-results.json`.
 * @param {Record<string, unknown>} overrides - What this case is about.
 */
const anAssertion = (overrides = {}) => ({
  auditId: 'largest-contentful-paint',
  url: 'http://localhost:3000/p/1',
  expected: 3000,
  actual: 3212,
  values: [3100, 3212, 3240, 3180, 3220],
  passed: false,
  ...overrides,
})

describe('annotationLines', () => {
  it('reports a failed assertion as one error annotation carrying the limit, the median and every run', () => {
    const lines = annotationLines({ config: 'lighthouserc.book.json', results: [anAssertion()] })

    expect(lines).toEqual([
      '::error title=largest-contentful-paint lighthouserc.book.json::http://localhost:3000/p/1 expected 3000, measured 3212 (runs: 3100, 3212, 3240, 3180, 3220)',
    ])
  })

  it('gives each failed assertion its own line, and the passing one beside it none', () => {
    const lines = annotationLines({
      config: 'lighthouserc.json',
      results: [
        anAssertion({ auditId: 'cumulative-layout-shift', expected: 0.1, actual: 0.14, values: [0.14] }),
        anAssertion({ auditId: 'interactive', passed: true, actual: 900 }),
        anAssertion({ auditId: 'total-byte-weight', expected: 180, actual: 191, values: [191] }),
      ],
    })

    expect(lines).toEqual([
      '::error title=cumulative-layout-shift lighthouserc.json::http://localhost:3000/p/1 expected 0.1, measured 0.14 (runs: 0.14)',
      '::error title=total-byte-weight lighthouserc.json::http://localhost:3000/p/1 expected 180, measured 191 (runs: 191)',
    ])
  })

  it('reports a passing run as one notice naming each gated audit’s median, so its margin is readable', () => {
    const lines = annotationLines({
      config: 'lighthouserc.admin.json',
      results: [
        anAssertion({ passed: true, actual: 2100 }),
        anAssertion({ auditId: 'cumulative-layout-shift', passed: true, expected: 0.1, actual: 0.02 }),
      ],
    })

    expect(lines).toEqual([
      '::notice title=lighthouse lighthouserc.admin.json::largest-contentful-paint median 2100 against 3000 (http://localhost:3000/p/1); cumulative-layout-shift median 0.02 against 0.1 (http://localhost:3000/p/1)',
    ])
  })

  it('says the results could not be read rather than throwing, when the file was missing or malformed', () => {
    const lines = annotationLines({ config: 'lighthouserc.json', results: undefined })

    expect(lines).toEqual([
      '::warning title=lighthouse-annotations lighthouserc.json::assertion results could not be read, so no measured number reached this log',
    ])
  })

  it('says the run values were not reported rather than printing an empty list', () => {
    // An entry without `values` is what a single-run configuration writes. The
    // line still has to carry the median, so it is not dropped - it says which
    // half is missing.
    const lines = annotationLines({ config: 'lighthouserc.json', results: [anAssertion({ values: undefined })] })

    expect(lines).toEqual([
      '::error title=largest-contentful-paint lighthouserc.json::http://localhost:3000/p/1 expected 3000, measured 3212 (runs: not reported)',
    ])
  })

  it('names the audit PROPERTY as well, so two budgets on one audit are told apart', () => {
    // `resource-summary:script:size` and `resource-summary:image:size` are both
    // the `resource-summary` audit, distinguished only by `auditProperty`
    // (`script.size`, read off a real `.lighthouseci/`). Found by running the
    // script against one, where every such assertion printed under one name.
    const lines = annotationLines({
      config: 'lighthouserc.json',
      results: [
        anAssertion({
          auditId: 'resource-summary',
          auditProperty: 'script.size',
          expected: 184320,
          actual: 191000,
          values: [191000],
        }),
      ],
    })

    expect(lines).toEqual([
      '::error title=resource-summary.script.size lighthouserc.json::http://localhost:3000/p/1 expected 184320, measured 191000 (runs: 191000)',
    ])
  })

  it('says a configuration gated nothing rather than claiming a median it has no numbers for', () => {
    const lines = annotationLines({ config: 'lighthouserc.json', results: [] })

    expect(lines).toEqual([
      '::notice title=lighthouse lighthouserc.json::this configuration asserted nothing, so nothing was gated',
    ])
  })
})
