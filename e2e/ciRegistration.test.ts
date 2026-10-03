/**
 * ciRegistration.test.ts — everything this repository asks CI to run is
 * actually named by the command that runs it.
 *
 * TWO SUBJECTS, ONE MECHANISM. The first is spec registration (below); the
 * second, added by the Phase 1 final review, is the pair of Lighthouse
 * configurations. Both are the same defect shape: a list of things to run,
 * held in a file that is not the thing itself, which drifts silently because
 * nothing green ever goes red when an entry is dropped.
 *
 * THIS FILE EXISTS BECAUSE THE SAME OMISSION HAPPENED TWICE, and both times
 * the suite stayed green while a spec gated nothing. `.github/workflows/ci.yml`'s
 * browser job names its spec files ONE BY ONE rather than by directory, on
 * purpose — so that adding a spec without adding it there is visible in a
 * diff. It was not visible enough:
 *
 *   - Task 10 added `e2e/notes.spec.ts` to `npm run test:e2e` and not to the
 *     CI job. Its focal-point and highlight-gap cases had never gated a merge
 *     when Task 12 found them.
 *   - Task 11 added `e2e/frames.spec.ts` and `e2e/about.spec.ts`, and the
 *     server-window work added `e2e/serverWindow.spec.ts`, all three the same
 *     way. `serverWindow.spec.ts` is what asserts that all thirty-three deep
 *     links serve their own page, and for its whole life until Task 12 it
 *     could not fail a build.
 *
 * A convention nobody can enforce is a convention that drifts, so this is the
 * enforcement: a browser test whose subject is the configuration of the
 * browser job. It reads the spec files off the filesystem and the two lists
 * off the files that hold them, and fails naming exactly which spec is
 * missing from which list.
 *
 * IT READS THE `run:` COMMAND, NOT THE WHOLE WORKFLOW FILE. `ci.yml`'s
 * comments name half these specs in prose, so a substring search over the
 * file would pass for a spec that is only ever MENTIONED there — which is
 * precisely the state this file exists to end, dressed as a green test.
 *
 * IT ALSO CHECKS THE npm SCRIPTS, because the drift ran in both directions:
 * a spec named by CI and by no npm script is one a developer cannot run
 * before pushing, and a spec named by `npm run test:e2e` and not by CI is the
 * original defect. Three scripts count as registration — `test:e2e`,
 * `test:visual` and `test:a11y` — because the visual and accessibility suites
 * are deliberately their own commands.
 *
 * THE LIGHTHOUSE CONFIGS ARE THE SAME LESSON, LEARNED A THIRD TIME.
 * `npm run test:perf` names one `lighthouserc*.json` per gate — THREE of them
 * since Phase 2 Task 11 added the admin's — because lhci's collect settings
 * are per-run, not per-URL, so the book surface's 1350x940 desktop viewport
 * cannot share a run with the gallery's phone emulation
 * (`docs/adr/0014-the-viewport-the-diary-lcp-gate-is-measured-at.md`) and
 * neither can the admin's 1440x900 (`docs/adr/0019-the-admin-performance-gate-and-the-css-seam.md`).
 * Nothing enforced that. Collapsing the script to one command — a plausible
 * tidy-up — would have silently stopped gating the book surface, the heavier
 * of the two and the one every LCP ADR measured, while `npm run test:perf`
 * still exited 0 and CI still reported the step green. That is precisely the
 * failure the two spec cases above exist for, so it gets the same treatment:
 * the config files are read off the filesystem, the script is read out of
 * `package.json`, and the case fails naming exactly which config nothing runs.
 *
 * IT NAMES THEM AS ARGUMENTS TO `scripts/run-lighthouse.mjs` RATHER THAN AS A
 * `&&` CHAIN, and the case below is why the runner does not discover them for
 * itself. The chain was replaced in Task 11's fix round because `&&`
 * short-circuits: with the book gate red, the admin gate — third in the
 * chain — never ran at all, so a budget this repository had just started
 * measuring went unmeasured with nothing saying so. The runner runs every
 * config and exits non-zero if any failed. A runner that GLOBBED the configs
 * would satisfy this case by construction and stop guarding anything, which is
 * the shape of vacuous test this phase has found fifteen of; so the names stay
 * in `package.json`, where this case can read them.
 *
 * ═══ WHY IT IS A VITEST TEST IN THE `e2e` DIRECTORY (RULING F57) ═══
 *
 * It was a Playwright spec until the Task 9 review, and being one is why it
 * had never fired. A spec runs in the CI browser job or in a full
 * `npm run test:e2e` - never in `npm run verify`, the gate Husky runs before
 * every commit - so it could only report the drift AFTER a full CI run, which
 * is exactly how `e2e/codeStep.spec.ts` gated nothing for two commits: the
 * detector lived in the job nobody ran. It needs no browser, no server and no
 * `page` fixture; it reads four files off disk. So it is a `*.test.ts`,
 * collected by `vitest.config.ts`'s `unit` project, and a commit that forgets
 * a `run:` line now fails at the moment it is made.
 *
 * IT STAYS IN `e2e/` ON PURPOSE. Its whole subject is this directory's
 * contents, and a guard that lives beside what it guards is one a reader
 * finds when they add a spec. `playwright.config.ts` narrows its own
 * `testMatch` to `*.spec.ts` so Playwright does not try to run this file as a
 * browser test - Playwright's default match includes `*.test.ts`.
 *
 * Adding a spec means adding one name to one `run:` line and one npm script;
 * adding a Lighthouse configuration means adding one argument to `test:perf`;
 * this file is what says so, at the moment either is forgotten.
 * Depends on: vitest, node:fs, node:path, node:url,
 * .github/workflows/ci.yml, package.json, lighthouserc*.json.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

/** This directory, and the repository root one level above it. */
const E2E_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(E2E_DIR, '..')

/**
 * The npm scripts that count as a way to run a spec from a developer's
 * machine.
 *
 * `test:gate` is the fourth, and it is separate for the reason
 * `e2e/bookGate.spec.ts`'s own header gives: its cases toggle SITE-WIDE
 * settings, and everything in `test:e2e` runs in parallel against the same
 * server. Folding it into `test:e2e` — a plausible tidy-up — would 401 every
 * other spec's `/p/<n>` mid-run.
 */
const RUNNER_SCRIPTS = ['test:e2e', 'test:visual', 'test:a11y', 'test:gate'] as const

/** Every `*.spec.ts` in this directory, as the paths a Playwright command names them by. */
const specFiles = (): readonly string[] =>
  readdirSync(E2E_DIR)
    .filter((entry) => entry.endsWith('.spec.ts'))
    .map((entry) => `e2e/${entry}`)
    .sort()

/**
 * The browser job's own `npx playwright test ...` command lines, taken from
 * `run:` steps alone so that a spec named only in a comment does not count.
 */
const ciPlaywrightCommands = (): readonly string[] => {
  const workflow = readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8')

  return workflow
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- run:') && line.includes('playwright test'))
}

/** The `scripts` block of the repository's root `package.json`. */
const rootScripts = (): Record<string, string> => {
  const manifest: unknown = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))
  if (typeof manifest !== 'object' || manifest === null || !('scripts' in manifest)) {
    throw new Error('package.json has no scripts block')
  }

  return manifest.scripts as Record<string, string>
}

test('runs every browser spec in CI’s browser job', () => {
  const commands = ciPlaywrightCommands()
  expect(commands, 'ci.yml has no `- run: npx playwright test` step to check against').not.toHaveLength(0)

  const unregistered = specFiles().filter((spec) => !commands.some((command) => command.includes(spec)))

  expect(
    unregistered,
    'these spec files exist but no `- run:` line in .github/workflows/ci.yml names them, so they gate nothing',
  ).toEqual([])
})

/**
 * Every Lighthouse configuration at the repository root, by filename. Read off
 * disk for the same reason `specFiles` is: a hard-coded pair would still pass
 * on the day a third configuration is added and never run.
 */
const lighthouseConfigs = (): readonly string[] =>
  readdirSync(REPO_ROOT)
    .filter((entry) => entry.startsWith('lighthouserc') && entry.endsWith('.json'))
    .sort()

test('runs every Lighthouse configuration from npm run test:perf', () => {
  const configs = lighthouseConfigs()
  expect(configs.length, 'no lighthouserc*.json at the repository root to check against').toBeGreaterThan(1)

  const testPerf = rootScripts()['test:perf'] ?? ''
  const ungated = configs.filter((config) => !testPerf.includes(config))

  expect(
    ungated,
    `npm run test:perf does not name these lighthouserc files, so the routes they gate are gated by nothing: ${testPerf}`,
  ).toEqual([])
})

/**
 * The specs one `docker compose` service's command names.
 *
 * READ OUT OF THE SERVICE'S OWN BLOCK, not out of the file, because
 * `docker-compose.yml` names specs in three services and in prose about them.
 * The block runs to the next top-level service key.
 * @param service - The service name, as the file spells it.
 * @returns The spec paths that service's command runs, sorted.
 * @example
 * composeSpecs('e2e') // ['e2e/about.spec.ts', …]
 */
const composeSpecs = (service: string): readonly string[] => {
  const compose = readFileSync(path.join(REPO_ROOT, 'docker-compose.yml'), 'utf8')
  const at = compose.indexOf(`\n  ${service}:`)
  if (at < 0) return []

  const rest = compose.slice(at + 1)
  const next = /\n {2}[a-z][a-z-]*:/u.exec(rest)
  const block = next === null ? rest : rest.slice(0, next.index)

  return [...new Set([...block.matchAll(/e2e\/[A-Za-z]+\.spec\.ts/gu)].map((found) => found[0]))].sort()
}

test('runs the same browser specs in the container as npm run test:e2e does', () => {
  // THE CONTAINER IS HOW THE FULL SUITE IS ACTUALLY RUN — it is the only path
  // with Playwright's default worker count, which is the difference between
  // roughly four minutes and roughly four hours — and the service's own
  // comment promises it names the same specs as the script. It did not:
  // `e2e/upload.spec.ts`, `e2e/admin.spec.ts` and `e2e/focalPoint.spec.ts`
  // were added to the script and to `ci.yml` and never here, so "run the whole
  // suite in the container" excluded the admin panel and Phase 4's second exit
  // criterion while a comment said it could not.
  //
  // THE TWO GUARDS ABOVE COULD NOT SEE IT. One holds the spec DIRECTORY to
  // `ci.yml`, the other holds it to the npm scripts; neither reads
  // `docker-compose.yml`, and a list can be complete in both and missing three
  // entries here. This is the third edge of that triangle.
  const script = rootScripts()['test:e2e'] ?? ''
  const named = [...new Set([...script.matchAll(/e2e\/[A-Za-z]+\.spec\.ts/gu)].map((found) => found[0]))].sort()
  expect(named.length, 'no specs were read out of npm run test:e2e, so this comparison checks nothing').toBeGreaterThan(
    1,
  )

  const inContainer = composeSpecs('e2e')
  expect(
    inContainer.length,
    'no specs were read out of docker-compose.yml’s e2e service, so this comparison checks nothing',
  ).toBeGreaterThan(1)

  expect(
    named.filter((spec) => !inContainer.includes(spec)),
    'npm run test:e2e runs these specs and docker-compose.yml’s e2e service does not, so the container run is not the suite it says it is',
  ).toEqual([])
  expect(
    inContainer.filter((spec) => !named.includes(spec)),
    'docker-compose.yml’s e2e service runs these specs and npm run test:e2e does not, so the two measure different things',
  ).toEqual([])
})

test('gives every browser spec an npm script a developer can run it with', () => {
  const scripts = rootScripts()
  const runners = RUNNER_SCRIPTS.map((name) => scripts[name] ?? '')

  const unrunnable = specFiles().filter((spec) => !runners.some((script) => script.includes(spec)))

  expect(
    unrunnable,
    `these spec files are named by none of ${RUNNER_SCRIPTS.join(', ')}, so nobody can run them before pushing`,
  ).toEqual([])
})

/**
 * The `test.afterAll` block of one spec, as written.
 *
 * READ AS A BLOCK rather than searched for a phrase, because the property that
 * matters is where the deletion RUNS: a `removeSignedInFixture` call sitting in
 * a helper nobody invokes reads exactly like one in a cleanup that fires.
 * @param source - The spec's whole source.
 * @returns The block's text, or the empty string when the spec declares none.
 */
const cleanupBlockOf = (source: string): string => CLEANUP_BLOCK.exec(source)?.[0] ?? ''

/** A `test.afterAll(async … })` block, from its opening to its own closer. */
const CLEANUP_BLOCK = /test\.afterAll\(async[\s\S]*?\n\}\)/u

/** A `for (const x of LIST) { … }` inside a cleanup, with its body. */
const CLEANUP_LOOP = /for \(const (\w+) of (\w+)\) \{([\s\S]*?)\n {2,6}\}/u

/** The call that mints a fixture account, named as its call site is written. */
const MINTING_CALL = 'aSignedInSession('

/** A first argument that is a template literal opening with a label segment. */
const A_LITERAL_LABEL = /^`([A-Za-z0-9-]+)\./u

/**
 * A comment of either kind, which is prose ABOUT code and not code.
 *
 * BOTH KINDS, SINCE REVIEW ROUND 1 (F7). Block comments were stripped from the
 * start, because a spec's `@example` line writes a call nobody makes. Line
 * comments were not, and {@link SWALLOWS} read the cleanup's raw text — so the
 * word "try" in an ordinary sentence produced a failure describing a
 * `try`/`catch` that was not in the file. `shellShipsNoClientJs.test.ts` and
 * `visualBaselines.test.ts` already strip both; this now matches them.
 */
const COMMENT = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu

/** A swallowing construct: a deletion inside one is a deletion this guard cannot vouch for. */
const SWALLOWS = /\b(?:try|catch)\b/u

/** One label a cleanup removes by name. */
const REMOVED_LABEL = /removeSignedInFixture\(`([A-Za-z0-9-]+)\./gu

/**
 * How many distinct labels each scanned spec mints, as a floor.
 *
 * `toBeGreaterThan(1)` until review round 1 (F3), which is a floor that eleven
 * of thirteen labels can walk under: move a case's minting into a helper
 * imported from `e2e/support/` and trim the cleanup list to match, and both
 * directions agree about the labels that are left while the spec quietly stops
 * being read. At the measured count, that edit has to lower a number somebody
 * reviews. Twelve and fifteen when this was written; raising them is the
 * ordinary cost of adding a case, and LOWERING one is the decision this exists
 * to make visible.
 */
const A11Y_MINTS_AT_LEAST_THIS_MANY_LABELS = 12

/** The same floor for `e2e/visual.spec.ts`. */
const VISUAL_MINTS_AT_LEAST_THIS_MANY_LABELS = 15

/** One entry of a declared label list. */
const LISTED_LABEL = /'([A-Za-z0-9-]+)'/gu

/**
 * Everything a `const <name>: readonly string[] = …` is initialised with, with
 * brackets and parentheses balanced.
 *
 * READ AS A WHOLE INITIALISER rather than as one bracketed run, because a list
 * can be built from more than one: `['a'].concat(OTHERS)` has two, and taking
 * the first was re-review round 2's ND-1 — the guard reported a leak that was
 * not there. It keeps consuming while a `.` follows the balanced run, which is
 * what a chained call looks like.
 * @param source - The spec's whole source.
 * @param name - The constant to read.
 * @returns The initialiser's text, or `null` when there is no such declaration
 *   or it never closes.
 */
const initialiserOf = (source: string, name: string): string | null => {
  const declaration = `const ${name}: readonly string[] = `
  const at = source.indexOf(declaration)
  if (at < 0) return null

  const from = at + declaration.length
  let depth = 0
  for (let index = from; index < source.length; index += 1) {
    const character = source[index]
    if (character === '[' || character === '(') depth += 1
    else if (character === ']' || character === ')') {
      depth -= 1
      // A chained call reopens it: `['a'].concat(['b'])` closes twice.
      if (depth === 0 && !/^\s*\./u.test(source.slice(index + 1))) return source.slice(from, index + 1)
    }
  }
  return null
}

/**
 * The labels one named `readonly string[]` declares, or `null` when this guard
 * cannot read the declaration.
 *
 * ANCHORED TO THE DECLARATION the cleanup loop actually names, rather than to
 * indentation. The pattern this replaces was `^ {2}'…',$`, which any unrelated
 * two-space-indented string array in the file satisfied (review round 1, F1).
 *
 * ═══ `null` IS NOT `[]`, AND THAT DISTINCTION IS THE WHOLE OF ND-1 ═══
 *
 * An empty array is a VERDICT ABOUT THE SPEC — "this list spends nothing" — and
 * a guard that reaches it by failing to parse is a guard that reports a leak
 * which is not there. That is the more expensive direction to be wrong in than
 * the one F1 fixed: a false red is deleted by whoever is trying to land an
 * unrelated change, and the real leak returns with it. So anything this
 * function cannot account for is `null`, which the case below turns into a
 * failure naming THIS GUARD rather than the file it was pointed at.
 *
 * WHAT IT CAN ACCOUNT FOR is array literals of quoted labels, joined by
 * `.concat(…)`. It proves that by subtraction rather than by pattern-matching a
 * shape it expects: the labels, the brackets, the commas, the `.concat` tokens
 * and the whitespace are removed, and ANY remaining character means there is
 * something here it has not understood — a spread, an identifier, a `.map`.
 * @param source - The spec's whole source.
 * @param name - The constant the loop iterates.
 * @returns Its entries, or `null` when the declaration is absent or is a shape
 *   this guard does not understand.
 */
const labelsDeclaredIn = (source: string, name: string): readonly string[] | null => {
  const initialiser = initialiserOf(source, name)
  if (initialiser === null) return null

  const unaccountedFor = initialiser.replaceAll(LISTED_LABEL, '').replaceAll(/\.concat|[[\](),]|\s/gu, '')
  if (unaccountedFor !== '') return null

  return [...initialiser.matchAll(LISTED_LABEL)].map((found) => found[1] ?? '')
}

/**
 * The text of the first argument of every call to a named function.
 *
 * READ BY BALANCING RATHER THAN BY A PATTERN, because the argument this guard
 * cares about is a template literal — backticks, `$`, braces and a nested call
 * of its own — and a regular expression that stopped at the first `)` would
 * read `` `visual.${fixtureLabel(testInfo` `` and call it a label.
 * @param source - The file's text.
 * @param call - The callee and its opening parenthesis, e.g. `foo(`.
 * @returns One entry per call site, in order, trimmed.
 * @example
 * firstArgumentsOf('mint(`a.b`, 2)', 'mint(') // ['`a.b`']
 */
const firstArgumentsOf = (source: string, call: string): readonly string[] => {
  const found: string[] = []
  for (let at = source.indexOf(call); at >= 0; at = source.indexOf(call, at + call.length)) {
    const from = at + call.length
    let depth = 1
    let end = source.length
    for (let index = from; index < source.length; index += 1) {
      const character = source[index]
      if (character === '(') depth += 1
      else if (character === ')') {
        depth -= 1
        if (depth === 0) {
          end = index
          break
        }
      } else if (depth === 1 && character === ',') {
        end = index
        break
      }
    }
    found.push(source.slice(from, end).trim())
  }
  return found
}

/**
 * Every label a spec hands `aSignedInSession`, and every label its cleanup
 * actually spends.
 *
 * READ OFF THE SPEC'S OWN SOURCE, which is what makes this a check rather than
 * a second list: a case that mints a label nobody deletes leaves a real account
 * in the developer's own `diary` database, on every run, for ever. Measured
 * before this existed: 93 of them (`docs/deviations.md` §107).
 *
 * ═══ THE SECOND HALF READS THE DELETION, NOT THE DECLARATION ═══
 *
 * Review round 1 (F1) caught this file checking only that every minted label
 * appeared in a declared LIST — which stayed green with the cleanup loop
 * deleted and the list kept, reinstating the whole leak it was written to stop.
 * Two changes. A list counts for nothing unless the loop that spends it is
 * INSIDE the `afterAll` block and removes BY ITS OWN VARIABLE, so neither a
 * deleted loop nor one that removes a single fixed label twelve times passes.
 * And the list is extracted from that loop's own named declaration rather than
 * from anything two-space indented — the old pattern would have been satisfied
 * by any unrelated string array in the file.
 *
 * ═══ THE MINTING SIDE REFUSES WHAT IT CANNOT ATTRIBUTE (PHASE 4 TASK 15e) ═══
 *
 * `docs/deviations.md` §108's first hole: the pattern this replaced matched
 * `` aSignedInSession(`label. `` AT THE CALL SITE, so
 * `const mint = (label: string) => aSignedInSession(label)` minted accounts the
 * guard never counted, and they leaked **in silence**. Silence is the whole of
 * the defect — a label nobody counts is a row that accumulates on every run
 * with nothing saying so.
 *
 * So the scan is inverted (CLAUDE.md §0's sixth species, and the shape
 * `eslint-rules/guarded-server-actions.js` uses): **every** call site of
 * `aSignedInSession` is found, and one whose first argument is not a literal
 * label is not skipped — it is reported as something this guard cannot read,
 * which the cases below turn into a failure naming THIS FILE. A wrapper
 * DECLARED IN THE SPEC is caught by that with no rule of its own: its own body
 * contains `aSignedInSession(label)`, an argument that is not a literal.
 *
 * ═══ AND A WRAPPER THAT IS NOT IN THE SPEC IS NOT CAUGHT AT ALL ═══
 *
 * The sentence above said "a wrapper" without the qualifier until review round
 * 1 (F3), and the qualifier is the whole of what this guard can see.
 * {@link fixtureLabelsOf} reads ONE FILE. A spec that imports its wrapper from
 * `e2e/support/` carries no `aSignedInSession(` text at all, so there is nothing
 * to refuse: a label minted that way, and never deleted, leaves every case here
 * green — measured, one import away. That is a remaining hole of the REFUSAL,
 * not merely a cost of the declined resolver, and `docs/deviations.md` §108 now
 * says so in those words.
 *
 * What bounds it is {@link A11Y_MINTS_AT_LEAST_THIS_MANY_LABELS} and its pair:
 * labels cannot MIGRATE out of a scanned spec without the floor noticing. A
 * label that was never in one can still be added, and nothing here sees it.
 *
 * WHY REFUSAL RATHER THAN RESOLVING THE CALL GRAPH, which is what §108
 * imagined. A resolver would have to answer for a wrapper's wrapper, a wrapper
 * imported from `./support/`, a label built by a `.map`, and a default
 * argument; §108's own paragraph says a guard that half-resolves a call graph
 * is a guard whose limits nobody can state. A refusal has one limit and it is
 * stated in the failure message: hand the label at the call site, or teach this
 * guard the shape. Nothing in this repository mints through a wrapper today, so
 * the refusal costs nothing and the silence is gone.
 *
 * ═══ AND A SWALLOWED DELETION IS NOT A DELETION ═══
 *
 * §108's second hole, in the half a static check can reach. It can never see
 * whether `removeSignedInFixture` WORKED — only an assertion against a live
 * database after a real run can — but it can see a cleanup that has arranged
 * not to find out, and a `try`/`catch` around the deletion is exactly that
 * arrangement. {@link SWALLOWS} makes the cleanup unreadable rather than
 * counting its labels as spent.
 * @param spec - The spec file's name under `e2e/`.
 * @returns The labels minted, the labels a live cleanup removes, and whatever
 *   this guard could not account for.
 */
const fixtureLabelsOf = (spec: string): FixtureLabels =>
  fixtureLabelsIn(readFileSync(path.join(REPO_ROOT, 'e2e', spec), 'utf8'))

/** What one spec mints, what its cleanup spends, and what this guard refused. */
interface FixtureLabels {
  readonly minted: readonly string[]
  readonly removed: readonly string[]
  readonly cannotRead: readonly string[]
}

/**
 * The same reading, over source handed in rather than read off disk.
 *
 * SEPARATE FROM {@link fixtureLabelsOf} SO THE REFUSALS HAVE CASES. Review
 * round 1 (F2) deleted each `cannotRead.push` below and all eight cases stayed
 * green: the refusals are asserted only as `toEqual([])` over two real specs
 * that never produce one, which is bookkeeping nothing exercises. The two
 * fixtures below give them the shape {@link labelsDeclaredIn} already has.
 * @param source - A spec's whole text.
 * @returns The labels minted, the labels a live cleanup removes, and whatever
 *   this guard could not account for.
 */
const fixtureLabelsIn = (source: string): FixtureLabels => {
  // COMMENTS FIRST, and then NOTHING reads `source` again: a spec's `@example`
  // line writes a call nobody makes, a commented-out removal deletes nothing,
  // and the word "try" in a sentence is not a `try` (see {@link COMMENT}).
  const code = source.replaceAll(COMMENT, '')
  const cannotRead: string[] = []
  const minted = firstArgumentsOf(code, MINTING_CALL).flatMap((argument) => {
    const label = A_LITERAL_LABEL.exec(argument)?.[1]
    if (label === undefined) {
      cannotRead.push(
        `a call to aSignedInSession whose label this guard cannot read: ${MINTING_CALL}${argument}) — hand it a \`label.\` template literal at the call site, or teach this guard the shape`,
      )
      return []
    }
    return [label]
  })
  const cleanup = cleanupBlockOf(code)
  if (SWALLOWS.test(cleanup)) {
    cannotRead.push(
      'the cleanup block swallows: a removeSignedInFixture inside a try/catch cannot be told from one that deleted nothing, and nothing static can tell them apart',
    )
  }

  // Named one at a time, in the cleanup itself.
  const named = [...cleanup.matchAll(REMOVED_LABEL)].map((found) => found[1] ?? '')

  // Or spent by a loop over a declared list, which counts only when the loop is
  // in the cleanup AND removes by the variable it binds.
  const loop = CLEANUP_LOOP.exec(cleanup)
  const variable = loop?.[1] ?? ''
  // SUBSTRINGS, NOT A BUILT REGULAR EXPRESSION. The needle is a template
  // literal — backticks, `$` and braces — and every escape it would need in a
  // `new RegExp(…)` string is one Prettier is entitled to normalise away, which
  // it did: the first version of this line shipped an unescaped pattern that
  // threw `Lone quantifier brackets` at run time.
  const spendsTheList = variable !== '' && (loop?.[3] ?? '').includes('removeSignedInFixture(`${' + variable + '}')
  const listed = spendsTheList ? labelsDeclaredIn(code, loop?.[2] ?? '') : []
  // `null` only when a loop names a list this guard could not parse — which is
  // a fact about the guard and is reported as one. A spec with no loop at all
  // reads fine and simply spends nothing.
  if (listed === null) {
    cannotRead.push(`a label list this guard cannot parse: ${loop?.[2] ?? ''} — see labelsDeclaredIn`)
  }

  return {
    minted: [...new Set(minted)].sort(),
    removed: [...new Set([...named, ...(listed ?? [])])].sort(),
    cannotRead,
  }
}

/**
 * Three shapes a label list can be declared in, and the one this guard must
 * refuse rather than misread.
 *
 * A LIST BUILT WITH `.concat()` IS THE CASE THAT MATTERS, and it is the defect
 * re-review round 2 found (ND-1): reading only the first bracket reported a
 * LEAK THAT WAS NOT THERE, which is the more expensive direction to be wrong
 * in. A guard that cries wolf is deleted by whoever is trying to land an
 * unrelated refactor, and the real leak comes back with it.
 */
const A_PLAIN_LIST = `const LABELS: readonly string[] = [\n  'one',\n  'two',\n]\n`
const A_CONCATENATED_LIST = `const LABELS: readonly string[] = ['one'].concat(['two', 'three'])\n`
const A_LIST_THIS_GUARD_CANNOT_READ = `const LABELS: readonly string[] = [...ELSEWHERE, 'one']\n`

test('reads a label list however it is spelled, including one built with concat', () => {
  expect(labelsDeclaredIn(A_PLAIN_LIST, 'LABELS')).toEqual(['one', 'two'])
  expect(labelsDeclaredIn(A_CONCATENATED_LIST, 'LABELS')).toEqual(['one', 'two', 'three'])
})

test('refuses a list it cannot read, instead of quietly deciding there is a leak', () => {
  // `null` IS NOT `[]`. An empty answer is a verdict about the spec — "this
  // list deletes nothing" — and it would be a false one. `null` says "this
  // guard cannot read this", which the case below turns into a failure that
  // names the guard rather than blaming the file it was pointed at.
  expect(labelsDeclaredIn(A_LIST_THIS_GUARD_CANNOT_READ, 'LABELS')).toBeNull()
  expect(labelsDeclaredIn(A_PLAIN_LIST, 'SOME_OTHER_NAME')).toBeNull()
})

/**
 * Four specs this guard has never read, which is the only place its refusals
 * can be watched firing.
 *
 * The two real specs below produce no refusal — that is the point of them — so
 * `toEqual([])` over those two is a claim about `a11y.spec.ts` and
 * `visual.spec.ts` and not about the guard. These four are the claim about the
 * guard, in the shape {@link labelsDeclaredIn}'s own cases use: a source
 * written here, read by the same function, compared to a literal answer.
 */
const A_SPEC_THAT_READS_CLEANLY = `const LABELS: readonly string[] = ['one']

test('mints one account', async () => {
  await aSignedInSession(\`one.\${fixtureLabel(testInfo)}\`)
})

test.afterAll(async () => {
  for (const label of LABELS) {
    await removeSignedInFixture(\`\${label}.\${RUN}\`)
  }
})
`

const A_SPEC_THAT_MINTS_THROUGH_A_WRAPPER = `const LABELS: readonly string[] = ['one']
const mint = (label: string) => aSignedInSession(label)

test('mints one account', async () => {
  await aSignedInSession(\`one.\${fixtureLabel(testInfo)}\`)
  await mint(\`two.\${fixtureLabel(testInfo)}\`)
})

test.afterAll(async () => {
  for (const label of LABELS) {
    await removeSignedInFixture(\`\${label}.\${RUN}\`)
  }
})
`

const A_SPEC_WHOSE_CLEANUP_SWALLOWS = A_SPEC_THAT_READS_CLEANLY.replace(
  '  for (const label of LABELS) {',
  '  try {\n  for (const label of LABELS) {',
)

const A_SPEC_WHOSE_CLEANUP_ONLY_TALKS_ABOUT_TRYING = A_SPEC_THAT_READS_CLEANLY.replace(
  '  for (const label of LABELS) {',
  '  // We try each label in turn, and a failure here is a failure of the run.\n  for (const label of LABELS) {',
)

/** The refusal {@link fixtureLabelsIn} raises for a call site it cannot attribute. */
const A_LABEL_THIS_GUARD_CANNOT_READ =
  'a call to aSignedInSession whose label this guard cannot read: aSignedInSession(label) — hand it a `label.` template literal at the call site, or teach this guard the shape'

/** The refusal it raises for a cleanup that has arranged not to find out. */
const A_CLEANUP_THAT_SWALLOWS =
  'the cleanup block swallows: a removeSignedInFixture inside a try/catch cannot be told from one that deleted nothing, and nothing static can tell them apart'

test('refuses a minting call whose label it cannot read, instead of reading the spec as clean', () => {
  // THE INVERSION, EXERCISED. The old pattern matched the LITERAL at the call
  // site, so a wrapper minted accounts nobody counted and nothing said so; this
  // one finds every call site and refuses the ones it cannot attribute. Both
  // halves are here, because a guard that refuses everything would pass the
  // second assertion on its own.
  const clean = fixtureLabelsIn(A_SPEC_THAT_READS_CLEANLY)
  expect(clean.cannotRead).toEqual([])
  expect(clean.minted).toEqual(['one'])

  const wrapped = fixtureLabelsIn(A_SPEC_THAT_MINTS_THROUGH_A_WRAPPER)
  expect(wrapped.cannotRead).toEqual([A_LABEL_THIS_GUARD_CANNOT_READ])
  // `two` IS NOT HERE, AND THAT IS THE POINT. It is minted — through `mint` —
  // and this guard cannot attribute it, so it is refused rather than counted.
  // The refusal is the whole mechanism: the old pattern returned exactly this
  // list and said nothing, which is how eleven accounts a run leaked in silence.
  expect(wrapped.minted, 'the literal call sites are still read; only the wrapper is refused').toEqual(['one'])
})

test('refuses a cleanup that swallows, and does not invent one out of a comment', () => {
  expect(fixtureLabelsIn(A_SPEC_WHOSE_CLEANUP_SWALLOWS).cannotRead).toEqual([A_CLEANUP_THAT_SWALLOWS])
  // A SENTENCE IS NOT A `try`. Review round 1 (F7): the swallow test read the
  // cleanup's raw text, so the word "try" in an ordinary comment produced a
  // failure describing a `try`/`catch` that was not in the file, and the next
  // person to write one would have gone looking for it. Comments are stripped
  // first now, as `shellShipsNoClientJs.test.ts` and `visualBaselines.test.ts`
  // already do.
  expect(fixtureLabelsIn(A_SPEC_WHOSE_CLEANUP_ONLY_TALKS_ABOUT_TRYING).cannotRead).toEqual([])
})

test('deletes every fixture account e2e/a11y.spec.ts creates, so a run leaves no accounts behind', () => {
  // THE ACCOUNTS ARE REAL ROWS IN THE DEVELOPER'S OWN DATABASE, not in
  // `diary_test`: `e2e/support/adminSession.ts` uses `getPayload()`. A label
  // minted and never removed is a row that accumulates on every run, and eleven
  // of this file's twelve labels were doing exactly that until Phase 4 Task 14.
  //
  // WHAT MAKES A LABEL "REMOVED" IS A CLEANUP THAT SPENDS IT, not a list that
  // names it — see {@link fixtureLabelsOf}, and review round 1's F1 for the
  // round where that difference was the whole defect.
  //
  // ═══ WHAT THIS GUARD CANNOT SEE, WRITTEN HERE RATHER THAN DISCOVERED ═══
  //
  // It reads source, and `docs/deviations.md` §108 named two holes that left.
  // Neither is silent any more, and neither is resolved either — both now make
  // the guard REFUSE, which is this file's own `null`-is-not-`[]` doctrine
  // applied to the minting side. A label minted through a wrapper DECLARED IN
  // THIS SPEC (`mint(label) => aSignedInSession(label)`) used to be invisible;
  // the call site is now found whatever its argument, and an argument this
  // guard cannot read lands in `cannotRead` above. A `removeSignedInFixture`
  // inside a swallowing `try/catch` used to count as a deletion; the cleanup
  // block is now refused instead.
  //
  // WHAT REMAINS, STATED RATHER THAN IMPLIED: two things, not one.
  //
  // This still cannot tell a deletion that RAN from one that DELETED ANYTHING.
  // Nothing static can — only an assertion against a live `diary` after a real
  // run — and §108 records that as declined with its cost rather than left as a
  // hole with a comment on it.
  //
  // And it reads ONE FILE, so a wrapper IMPORTED from `e2e/support/` leaves no
  // call site here to refuse (review round 1, F3). The floor above is what
  // stops today's labels moving out that way unseen; a label that was never
  // here can still be added through an import, and this guard will not say so.
  //
  // BOTH DIRECTIONS, since Phase 4 Task 15. A label minted and never removed
  // leaks an account; a label removed and never minted is a no-op delete that
  // makes the list look like it covers more than it does, and it is how a
  // renamed case quietly stops being cleaned up. The lists are hand-maintained
  // — fifteen entries in `visual.spec.ts` — so the second direction is what
  // stops one going stale without a word.
  const { minted, removed, cannotRead } = fixtureLabelsOf('a11y.spec.ts')

  expect(
    cannotRead,
    'THIS GUARD could not account for these, so nothing is claimed here about whether the spec leaks; the guard has to be taught the shape first',
  ).toEqual([])
  expect(
    minted.length,
    'fewer labels than e2e/a11y.spec.ts is known to mint: either the extraction broke, or a case now mints through something this guard cannot see',
  ).toBeGreaterThanOrEqual(A11Y_MINTS_AT_LEAST_THIS_MANY_LABELS)
  expect(
    minted.filter((label) => !removed.includes(label)),
    'these labels create an account that nothing deletes when the suite finishes',
  ).toEqual([])
  expect(
    removed.filter((label) => !minted.includes(label)),
    'these labels are deleted by the cleanup and minted by no case, so the list has outlived a case that was removed or renamed',
  ).toEqual([])
})

test('deletes every fixture account e2e/visual.spec.ts creates, so a run leaves no accounts behind', () => {
  // THE OTHER HALF OF `docs/deviations.md` §107, and the larger half: three of
  // the four biggest offenders that entry measured are this file's —
  // `visualpanel` at twelve rows, `visualjourneys` at eleven, `visualcreate` at
  // ten. §107 left it open on the argument that a fix nothing could run is the
  // species this phase keeps finding: this suite skips off Linux, so its
  // cleanup can only be exercised inside the pinned container. Task 15's
  // baseline run is that exercise, which is why the fix lands with it.
  //
  // THE LIMITS ARE THE CASE ABOVE'S, unchanged: this reads source, so it can say
  // a deletion is written and never that it deleted anything
  // (`docs/deviations.md` §108). `signedInAs` in that spec takes a session
  // rather than a label for exactly that reason, and the minting call it is
  // handed is a literal at the call site, which is what this guard now requires
  // of every one of them.
  const { minted, removed, cannotRead } = fixtureLabelsOf('visual.spec.ts')

  expect(
    cannotRead,
    'THIS GUARD could not account for these, so nothing is claimed here about whether the spec leaks; the guard has to be taught the shape first',
  ).toEqual([])
  expect(
    minted.length,
    'fewer labels than e2e/visual.spec.ts is known to mint: either the extraction broke, or a case now mints through something this guard cannot see',
  ).toBeGreaterThanOrEqual(VISUAL_MINTS_AT_LEAST_THIS_MANY_LABELS)
  expect(
    minted.filter((label) => !removed.includes(label)),
    'these labels create an account that nothing deletes when the suite finishes',
  ).toEqual([])
  expect(
    removed.filter((label) => !minted.includes(label)),
    'these labels are deleted by the cleanup and minted by no case, so the list has outlived a case that was removed or renamed',
  ).toEqual([])
})
