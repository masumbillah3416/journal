/**
 * configCitations.test.ts — every number and flag the documentation quotes out
 * of a configuration file is read back out of that file and required to still
 * be the number the documentation quotes.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * A budget written in two places drifts, and the copy a reader trusts is the
 * one in prose. Three findings of the ninth whole-branch review are the same
 * defect wearing three hats:
 *
 *   - `docs/testing.md` said `npm run test:visual:container:update` passes
 *     `--update-snapshots=all` "not the `changed` default". It passes `changed`;
 *     `all` is the OTHER script. A reader regenerates baselines believing every
 *     one was rewritten and ships a stale baseline that can never fail again
 *     (F9-2) — the exact silent-green failure the `-win32.png` refusal exists
 *     to prevent.
 *   - The same document enumerated five of the `unit` project's seven include
 *     globs, omitting the one collecting `apps/web/collections/**` entirely. An
 *     auditor checking CLAUDE.md §2.1's "no file is in neither config's
 *     include" against that list audits a smaller set than the real one (F9-8).
 *   - It said in bold and in the present tense that `npm run test:perf` runs TWO
 *     Lighthouse configurations. It has run three since Task 11 (F9-9).
 *
 * Nobody re-reads a config to check a sentence. This does, on every commit.
 *
 * ═══ THE SHAPE, AND WHY IT IS NOT A TABLE OF EXPECTED NUMBERS ═══
 *
 * Each entry names the config, an extractor that READS THE VALUE OUT OF IT, and
 * the document that must quote it. Nothing here holds a copy of a budget.
 * Writing `expect(184320)` would be a third place for the number to drift, and
 * the drift would then be invisible in exactly the way it already was: change
 * the gate, and this file must be edited too, so the check would be trained to
 * follow the mistake. Reading the config means changing the gate fails the
 * document that describes it, which is the only ordering that helps.
 *
 * A citation is satisfied by CONTAINMENT rather than by position: the document
 * has to contain the value, formatted the way this repository's prose formats
 * numbers. That is deliberately weak about where the sentence is and strong
 * about the number existing at all — a budget quoted nowhere fails, and a
 * budget quoted with the wrong digits fails, which is the whole population of
 * this defect class.
 *
 * The one citation that containment cannot settle is the flag pair, because the
 * document quotes BOTH modes and one sentence had them swapped. That one is
 * checked by proximity: the script named nearest before a `--update-snapshots=`
 * is the one that sentence describes, and the mode has to be the one that
 * script's own compose service passes. See
 * {@link contradictedSnapshotPairings}.
 *
 * ═══ WHAT IT CANNOT DO, STATED RATHER THAN IMPLIED ═══
 *
 * The pairing check cannot tell a QUOTATION from a claim. A document that
 * reproduces the defective sentence in order to explain it is reported exactly
 * as the defect was, so `docs/testing.md` describes that sentence instead of
 * quoting it. That is a cost, and it is the fail-closed direction: the check
 * would rather refuse a correct document than pass a wrong one.
 *
 * Containment is also blind to WHERE a value is quoted. A budget moved in the
 * config and quoted correctly in some unrelated paragraph satisfies its
 * citation. What it catches is the whole population of this defect class: a
 * value quoted with the wrong digits, and a value quoted nowhere at all.
 *
 * ═══ HOW IT AVOIDS BEING VACUOUS ═══
 *
 *   1. Every extractor's result must be non-empty. An extractor whose regex
 *      stopped matching would otherwise return `''`, which every document
 *      contains.
 *   2. A deliberately wrong value must NOT be found, so containment is proved
 *      able to answer "no".
 *   3. The include-glob and Lighthouse-config lists are read off the config and
 *      off the filesystem, never enumerated here, and their counts are floored.
 *
 * PATTERNS (CLAUDE.md §3.3): none of the seven. Reads and string comparisons.
 *
 * Depends on: vitest, node:fs, ./markdownCorpus.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPOSITORY_ROOT } from './markdownCorpus'

/** Read a repository file as text. */
const text = (file: string): string => readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8')

/** Read a repository file as JSON. */
const asJson = (file: string): unknown => JSON.parse(text(file))

/** How this repository's prose writes a byte or millisecond count: grouped by thousands. */
const grouped = (value: number): string => value.toLocaleString('en-US')

/** A floor on the citations checked, so an empty table fails here rather than passing. */
const AT_LEAST_THIS_MANY_CITATIONS = 12

/** A floor on the `unit` project's include globs, so an extractor that stopped matching fails here. */
const AT_LEAST_THIS_MANY_UNIT_GLOBS = 5

/** A value shaped exactly like a budget and quoted by no document, so containment can answer "no". */
const A_BUDGET_NO_DOCUMENT_QUOTES = '184,321'

/**
 * One assertion inside a Lighthouse config's assert matrix.
 * @param config - The parsed `lighthouserc*.json`.
 * @param urlPattern - The `matchingUrlPattern` of the matrix entry.
 * @param audit - The audit key.
 * @returns The `maxNumericValue` the config sets.
 * @throws If the matrix entry or the audit is not there, rather than returning
 *   a fallback that would make the citation trivially satisfiable.
 */
const budget = (config: unknown, urlPattern: string, audit: string): number => {
  const matrix = (config as { ci: { assert: { assertMatrix: readonly Record<string, unknown>[] } } }).ci.assert
    .assertMatrix
  const entry = matrix.find((candidate) => candidate['matchingUrlPattern'] === urlPattern)
  if (entry === undefined) throw new Error(`no assert-matrix entry for ${urlPattern}`)
  const assertions = entry['assertions'] as Record<string, unknown>
  const found = assertions[audit]
  const options = (Array.isArray(found) ? found[1] : found) as { maxNumericValue?: number } | undefined
  const value = options?.maxNumericValue
  if (typeof value !== 'number') throw new Error(`no maxNumericValue for ${audit} at ${urlPattern}`)
  return value
}

/** A Lighthouse config's collect settings. */
const collect = (config: unknown): { numberOfRuns: number; settings: { screenEmulation: Record<string, number> } } =>
  (config as { ci: { collect: { numberOfRuns: number; settings: { screenEmulation: Record<string, number> } } } }).ci
    .collect

/** The `WIDTHxHEIGHT` a Lighthouse config emulates. */
const viewport = (config: unknown): string => {
  const emulation = collect(config).settings.screenEmulation
  return `${String(emulation['width'])}x${String(emulation['height'])}`
}

/** The root `package.json`'s scripts. */
const rootScripts = (): Record<string, string> =>
  (asJson('package.json') as { scripts: Record<string, string> }).scripts

/** One documented value: what it is, where the value is configured, and which document must quote it. */
interface ConfigCitation {
  readonly what: string
  readonly value: () => string
  readonly document: string
}

/**
 * Every value the documentation quotes out of a config.
 *
 * Each `value` READS the config. None of them holds a copy of the number — see
 * the module header for why a table of expected numbers would be a third place
 * for the same value to drift.
 */
const CONFIG_CITATIONS: readonly ConfigCitation[] = [
  {
    what: 'the diary route JS budget, from lighthouserc.json',
    value: () => grouped(budget(asJson('lighthouserc.json'), '.*/p/1$', 'resource-summary:script:size')),
    document: 'docs/testing.md',
  },
  {
    what: 'the diary route JS budget, from lighthouserc.book.json',
    value: () => grouped(budget(asJson('lighthouserc.book.json'), '.*/p/1$', 'resource-summary:script:size')),
    document: 'docs/testing.md',
  },
  {
    what: 'the admin route JS budget, from lighthouserc.admin.json',
    value: () => grouped(budget(asJson('lighthouserc.admin.json'), '.*/admin/.*', 'resource-summary:script:size')),
    document: 'docs/testing.md',
  },
  {
    what: 'the gallery image budget, from lighthouserc.json',
    value: () => grouped(budget(asJson('lighthouserc.json'), '.*/gallery/.*', 'resource-summary:image:size')),
    document: 'docs/testing.md',
  },
  {
    what: 'the /p/1 LCP gate, from lighthouserc.book.json',
    value: () => grouped(budget(asJson('lighthouserc.book.json'), '.*/p/1$', 'largest-contentful-paint')),
    document: 'docs/testing.md',
  },
  {
    what: 'the /p/1 LCP gate, from lighthouserc.json',
    value: () => grouped(budget(asJson('lighthouserc.json'), '.*/p/1$', 'largest-contentful-paint')),
    document: 'docs/testing.md',
  },
  {
    what: 'the admin LCP gate, from lighthouserc.admin.json',
    value: () => grouped(budget(asJson('lighthouserc.admin.json'), '.*/admin/.*', 'largest-contentful-paint')),
    document: 'docs/testing.md',
  },
  {
    what: 'the runs each Lighthouse median is taken over',
    value: () => `numberOfRuns: ${String(collect(asJson('lighthouserc.json')).numberOfRuns)}`,
    document: 'docs/testing.md',
  },
  {
    what: "the book surface's measured viewport, quoted by CLAUDE.md §6",
    value: () => viewport(asJson('lighthouserc.book.json')),
    document: 'CLAUDE.md',
  },
  {
    what: "the mobile surface's measured viewport, quoted by CLAUDE.md §6",
    value: () => viewport(asJson('lighthouserc.json')),
    document: 'CLAUDE.md',
  },
  {
    what: "the mobile surface's device pixel ratio, quoted by CLAUDE.md §6",
    value: () => String(collect(asJson('lighthouserc.json')).settings.screenEmulation['deviceScaleFactor']),
    document: 'CLAUDE.md',
  },
  {
    what: "the admin surface's measured viewport",
    value: () => viewport(asJson('lighthouserc.admin.json')),
    document: 'docs/testing.md',
  },
  {
    what: 'the host port docker-compose publishes Postgres on',
    value: () => (text('docker-compose.yml').match(/ports:\s*\['(\d+):5432'\]/u) ?? [])[1] ?? '',
    // `docs/deviations.md` §45, not README.md: the port is a departure from the
    // brief's own example and is recorded where departures are recorded. The
    // README points a reader at `.env.example`, which carries the connection
    // string rather than the number in prose.
    document: 'docs/deviations.md',
  },
  {
    what: 'the pure-domain coverage threshold, from vitest.config.ts',
    value: () => {
      const block = text('vitest.config.ts')
      const start = block.indexOf("'packages/domain/src/**/*.ts': {")
      return (block.slice(start).match(/lines:\s*(\d+)/u) ?? [])[1] ?? ''
    },
    document: 'docs/testing.md',
  },
]

/**
 * The `unit` project's include globs, read out of `vitest.config.ts` rather
 * than listed here — a list here would be the enumeration this check exists to
 * refuse.
 * @returns Every glob string between the project's name and the next project's.
 */
const unitIncludeGlobs = (): readonly string[] => {
  const config = text('vitest.config.ts')
  const block = config.slice(config.indexOf("name: 'unit'"), config.indexOf("name: 'unit-dom'"))
  return [...block.matchAll(/^\s*'([^']+\*[^']*)',$/gmu)].map((match) => match[1] ?? '')
}

/** Every `lighthouserc*.json` at the repository root, read off disk. */
const lighthouseConfigs = (): readonly string[] =>
  readdirSync(REPOSITORY_ROOT)
    .filter((entry) => entry.startsWith('lighthouserc') && entry.endsWith('.json'))
    .sort()

/**
 * The snapshot mode a `test:visual:container:update*` script really passes, via
 * the docker-compose service it runs.
 * @param script - The npm script name.
 * @returns The `--update-snapshots=` value, or `''` if either link is broken.
 */
const snapshotMode = (script: string): string => {
  const service = ((rootScripts()[script] ?? '').match(/run --rm (\S+)/u) ?? [])[1]
  if (service === undefined) return ''
  const compose = text('docker-compose.yml')
  const block = compose.slice(compose.indexOf(`  ${service}:`))
  return (block.match(/--update-snapshots=(\w+)/u) ?? [])[1] ?? ''
}

/** How much text before a flag counts as "the sentence that introduced it". */
const PAIRING_WINDOW = 240

/**
 * Every place the documentation pairs a baseline-regeneration script with a
 * snapshot mode, reported when the pairing is not the one the compose service
 * makes.
 *
 * CONTAINMENT CANNOT SETTLE THIS ONE, and neither can the paragraph.
 * `docs/testing.md` legitimately quotes both `changed` and `all`, often inside
 * one bullet, and the defect was a single sentence pairing the wrong two. So
 * the unit is PROXIMITY: for each `--update-snapshots=` the document writes,
 * the script named nearest before it is the one that sentence is describing,
 * and the mode has to be that script's.
 * @param document - The document's text.
 * @param modes - The mode each script really passes, keyed by script name.
 * @returns One entry per contradicted pairing; empty when every pairing holds.
 */
const contradictedSnapshotPairings = (document: string, modes: ReadonlyMap<string, string>): readonly string[] => {
  const wrong: string[] = []
  for (const flag of document.matchAll(/--update-snapshots=(\w+)/gu)) {
    const window = document.slice(Math.max(0, flag.index - PAIRING_WINDOW), flag.index)
    // `:update:all` and `:update` begin at the same offset, so the longer name
    // is looked for first and wins the position the two of them share.
    const allAt = window.lastIndexOf('test:visual:container:update:all')
    const anyAt = window.lastIndexOf('test:visual:container:update')
    const script =
      allAt >= 0 && allAt >= anyAt
        ? 'test:visual:container:update:all'
        : anyAt >= 0
          ? 'test:visual:container:update'
          : undefined
    if (script === undefined) continue
    const expected = modes.get(script)
    if (expected !== undefined && flag[1] !== expected) {
      wrong.push(
        `${script} paired with --update-snapshots=${flag[1] ?? ''}, and its compose service passes ${expected}: …${window.slice(-90).replace(/\n/gu, ' ')}`,
      )
    }
  }
  return wrong
}

describe('the configured values the documentation quotes', () => {
  it('are still the values their configuration files hold', () => {
    expect(CONFIG_CITATIONS.length).toBeGreaterThanOrEqual(AT_LEAST_THIS_MANY_CITATIONS)

    // An extractor that stopped matching returns '', which every document
    // contains - so the emptiness is asserted before the containment.
    const empty = CONFIG_CITATIONS.filter((citation) => citation.value().length === 0).map((c) => c.what)
    expect(empty, 'these extractors read nothing out of their config, so their citations would pass trivially').toEqual(
      [],
    )

    const missing = CONFIG_CITATIONS.filter((citation) => !text(citation.document).includes(citation.value())).map(
      (citation) => `${citation.what} — configured as "${citation.value()}", not quoted in ${citation.document}`,
    )

    expect(missing, 'these configured values are not quoted anywhere by the document that describes them').toEqual([])
  })

  it('are checked by a containment that can actually answer no', () => {
    // Without this, a document read that returned the whole repository, or a
    // value that came back empty, would satisfy every citation above.
    expect(text('docs/testing.md').includes(A_BUDGET_NO_DOCUMENT_QUOTES)).toBe(false)
    expect(text('docs/testing.md').includes('184,320')).toBe(true)
  })

  it('include every glob the pre-commit gate collects tests by', () => {
    // CLAUDE.md §2.1 names the config comment AND docs/testing.md as the two
    // homes an include fact lives in. An enumeration there that is missing a
    // glob is how an auditor checks "no file is in neither include" against a
    // set smaller than the real one.
    const globs = unitIncludeGlobs()
    expect(globs.length, 'no include globs were read out of vitest.config.ts').toBeGreaterThanOrEqual(
      AT_LEAST_THIS_MANY_UNIT_GLOBS,
    )

    const testing = text('docs/testing.md')
    const undocumented = globs.filter((glob) => !testing.includes(`\`${glob}\``))

    expect(
      undocumented,
      "docs/testing.md's enumeration of the `unit` project's include globs is missing these, so a reader auditing it against CLAUDE.md §2.1 audits a smaller set than the config collects",
    ).toEqual([])
  })

  it('include every Lighthouse configuration the documentation claims to describe', () => {
    const configs = lighthouseConfigs()
    expect(configs.length, 'no lighthouserc*.json at the repository root').toBeGreaterThan(1)

    const testing = text('docs/testing.md')
    const undocumented = configs.filter((config) => !testing.includes(config))

    expect(undocumented, 'these Lighthouse configurations gate a route and docs/testing.md never names them').toEqual(
      [],
    )
  })

  it('never pair a baseline-regeneration script with the flag the other one passes', () => {
    const testing = text('docs/testing.md')
    const changed = snapshotMode('test:visual:container:update')
    const all = snapshotMode('test:visual:container:update:all')

    expect(changed, 'no --update-snapshots flag was read for the `changed` service').not.toBe('')
    expect(all, 'no --update-snapshots flag was read for the `all` service').not.toBe('')
    expect(changed, 'the two services pass the same flag, so this case can no longer tell them apart').not.toBe(all)

    const modes = new Map([
      ['test:visual:container:update', changed],
      ['test:visual:container:update:all', all],
    ])

    expect(
      contradictedSnapshotPairings(testing, modes),
      'these sentences pair a baseline-regeneration script with the flag the OTHER one passes; a reader regenerates believing every baseline was rewritten and ships a stale one that can never fail again',
    ).toEqual([])

    // Proved able to answer YES, on the sentence that shipped the defect,
    // rather than only on the document as it stands corrected.
    expect(
      contradictedSnapshotPairings(
        'by `npm run test:visual:container:update`, which is the invocation the Run bullet below documents in full (and which passes `--update-snapshots=all`, not the `changed` default this line used to name).',
        modes,
      ),
    ).toHaveLength(1)
  })
})
