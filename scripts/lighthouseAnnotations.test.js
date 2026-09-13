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
 * EVERY CASE HANDS IN A READER, because that is what the module takes and it is
 * why it takes it. The parse used to live in `run-lighthouse.mjs`, under a
 * whole-file `c8 ignore`, where `catch { parsed = undefined }` decided what an
 * unreadable results file MEANS and no test could reach it. A reader that
 * throws, and a reader that returns text which is not a list, are now two cases
 * with two distinct lines.
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

/**
 * A reader that answers with the JSON text lhci would have written.
 *
 * Text rather than the array itself, because text is what the module is handed
 * and parsing it is what the module owns.
 * @param {unknown[]} entries - The assertion-results entries to serialise.
 */
const reading = (entries) => () => JSON.stringify(entries)

describe('annotationLines', () => {
  it('reports a failed assertion as one error annotation carrying the limit, the median and every run', () => {
    const lines = annotationLines({ config: 'lighthouserc.book.json', readResults: reading([anAssertion()]) })

    expect(lines).toEqual([
      '::error title=largest-contentful-paint lighthouserc.book.json::http://localhost:3000/p/1 expected 3000, measured 3212 (runs: 3100, 3212, 3240, 3180, 3220)',
    ])
  })

  it('gives each failed assertion its own line, and the passing one beside it none', () => {
    const lines = annotationLines({
      config: 'lighthouserc.json',
      readResults: reading([
        anAssertion({ auditId: 'cumulative-layout-shift', expected: 0.1, actual: 0.14, values: [0.14] }),
        anAssertion({ auditId: 'interactive', passed: true, actual: 900 }),
        anAssertion({ auditId: 'total-byte-weight', expected: 180, actual: 191, values: [191] }),
      ]),
    })

    expect(lines).toEqual([
      '::error title=cumulative-layout-shift lighthouserc.json::http://localhost:3000/p/1 expected 0.1, measured 0.14 (runs: 0.14)',
      '::error title=total-byte-weight lighthouserc.json::http://localhost:3000/p/1 expected 180, measured 191 (runs: 191)',
    ])
  })

  it('reports a passing run as one notice naming each gated audit’s median, so its margin is readable', () => {
    const lines = annotationLines({
      config: 'lighthouserc.admin.json',
      readResults: reading([
        anAssertion({ passed: true, actual: 2100 }),
        anAssertion({ auditId: 'cumulative-layout-shift', passed: true, expected: 0.1, actual: 0.02 }),
      ]),
    })

    expect(lines).toEqual([
      '::notice title=lighthouse lighthouserc.admin.json::largest-contentful-paint median 2100 against 3000 (http://localhost:3000/p/1); cumulative-layout-shift median 0.02 against 0.1 (http://localhost:3000/p/1)',
    ])
  })

  it('says nothing was written, rather than throwing, when the results file is not there to read', () => {
    // What a run that died before `lhci` wrote its results looks like — the one
    // failure Ruling F86 exists to make visible without log access. The reader
    // throws exactly as `readFileSync` does on a missing path.
    const lines = annotationLines({
      config: 'lighthouserc.json',
      readResults: () => {
        throw new Error('ENOENT: no such file or directory')
      },
    })

    expect(lines).toEqual([
      '::warning title=lighthouse-annotations lighthouserc.json::no assertion results were written, so no measured number reached this log',
    ])
  })

  it('says the results are not a list it can read, which is a different event from the file being absent', () => {
    // A truncated or half-written file parses to nothing. It must not read as
    // "nothing was gated": that is the annotation this round was written to
    // stop, because an empty gate and a broken annotation pipeline look
    // identical to anybody without log access.
    const lines = annotationLines({ config: 'lighthouserc.json', readResults: () => '[{"auditId": "largest-' })

    expect(lines).toEqual([
      '::warning title=lighthouse-annotations lighthouserc.json::the assertion results are not a list this can read, so no measured number reached this log',
    ])
  })

  it('says the same of text that parses to something other than a list', () => {
    const lines = annotationLines({ config: 'lighthouserc.json', readResults: () => '{"assertions": []}' })

    expect(lines).toEqual([
      '::warning title=lighthouse-annotations lighthouserc.json::the assertion results are not a list this can read, so no measured number reached this log',
    ])
  })

  it('says the run values were not reported rather than printing an empty list', () => {
    // An entry without `values` is what a single-run configuration writes. The
    // line still has to carry the median, so it is not dropped - it says which
    // half is missing.
    const lines = annotationLines({
      config: 'lighthouserc.json',
      readResults: reading([anAssertion({ values: undefined })]),
    })

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
      readResults: reading([
        anAssertion({
          auditId: 'resource-summary',
          auditProperty: 'script.size',
          expected: 184320,
          actual: 191000,
          values: [191000],
        }),
      ]),
    })

    expect(lines).toEqual([
      '::error title=resource-summary.script.size lighthouserc.json::http://localhost:3000/p/1 expected 184320, measured 191000 (runs: 191000)',
    ])
  })

  it('says a configuration gated nothing rather than claiming a median it has no numbers for', () => {
    const lines = annotationLines({ config: 'lighthouserc.json', readResults: reading([]) })

    expect(lines).toEqual([
      '::notice title=lighthouse lighthouserc.json::this configuration asserted nothing, so nothing was gated',
    ])
  })
})
