/**
 * lighthouseJudged.test.js — every URL a Lighthouse configuration collects is
 * judged by at least one of its assertions.
 *
 * `docs/testing.md` records the defect this pins: a URL added to a
 * `lighthouserc*.json` whose `assertMatrix` has no entry matching it is
 * "collected and never judged, which is the shape of green this branch has
 * spent four reviews removing". `/admin` was exactly that until this task
 * added a second matrix entry — and the only thing that proved the new entry
 * matches was a human reading `lhci assert --includePassedAssertions` once.
 *
 * This asserts it instead, over every configuration in the repository, from
 * the files themselves: each collected URL must be matched by at least one
 * `matchingUrlPattern`, and every pattern must match at least one URL, so a
 * pattern left behind by a URL that moved fails here too.
 *
 * IT RUNS IN THE PRE-COMMIT GATE, not in the performance job, which is the
 * point: it reads JSON off disk and needs no browser, no build and no lhci, so
 * the commit that adds an unjudged URL fails before it is made rather than
 * twenty Lighthouse runs later. Same reasoning as `e2e/ciRegistration.test.ts`,
 * which is a browser-suite guard that deliberately runs in `unit`.
 *
 * Depends on: node:fs, node:path, node:url, vitest.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** The repository root, from this file's own location. */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Every Lighthouse configuration this repository ships. */
const CONFIGS = readdirSync(ROOT).filter((name) => /^lighthouserc.*\.json$/.test(name))

/**
 * One configuration's collected URLs and the patterns that judge them.
 * @param {string} name - The configuration file's name.
 * @returns {{urls: string[], patterns: string[]}} Both lists.
 */
const readConfig = (name) => {
  const parsed = JSON.parse(readFileSync(path.join(ROOT, name), 'utf8'))
  const urls = parsed?.ci?.collect?.url ?? []
  const matrix = parsed?.ci?.assert?.assertMatrix ?? []
  const patterns = matrix.map((entry) => entry.matchingUrlPattern)
  return { urls, patterns }
}

describe('every Lighthouse configuration', () => {
  it('ships at least one configuration to judge, so the cases below are not vacuous', () => {
    expect(CONFIGS.length).toBeGreaterThan(0)
  })

  it.each(CONFIGS)('judges every URL %s collects, rather than merely collecting it', (name) => {
    const { urls, patterns } = readConfig(name)

    const unjudged = urls.filter((url) => !patterns.some((pattern) => new RegExp(pattern).test(url)))

    expect(unjudged).toEqual([])
  })

  it.each(CONFIGS)('has no assertion pattern in %s that matches nothing it collects', (name) => {
    const { urls, patterns } = readConfig(name)

    const idle = patterns.filter((pattern) => !urls.some((url) => new RegExp(pattern).test(url)))

    expect(idle).toEqual([])
  })
})
