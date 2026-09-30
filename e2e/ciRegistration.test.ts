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

/** One label a spec mints. */
const MINTED_LABEL = /aSignedInSession\(`([A-Za-z0-9-]+)\./gu

/** One label a cleanup removes by name. */
const REMOVED_LABEL = /removeSignedInFixture\(`([A-Za-z0-9-]+)\./gu

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
 * @param spec - The spec file's name under `e2e/`.
 * @returns The labels minted, and the labels a live cleanup removes.
 */
const fixtureLabelsOf = (
  spec: string,
): { readonly minted: readonly string[]; readonly removed: readonly string[]; readonly readable: boolean } => {
  const source = readFileSync(path.join(REPO_ROOT, 'e2e', spec), 'utf8')
  const minted = [...source.matchAll(MINTED_LABEL)].map((found) => found[1] ?? '')
  const cleanup = cleanupBlockOf(source)

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
  const listed = spendsTheList ? labelsDeclaredIn(source, loop?.[2] ?? '') : []

  return {
    minted: [...new Set(minted)].sort(),
    removed: [...new Set([...named, ...(listed ?? [])])].sort(),
    // `null` only when a loop names a list this guard could not parse — which
    // is a fact about the guard and is reported as one. A spec with no loop at
    // all is readable and simply spends nothing.
    readable: listed !== null || !spendsTheList,
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
  // It reads source. So a label minted through a WRAPPER
  // (`mint(label) => aSignedInSession(label)`) is invisible to `MINTED_LABEL`
  // and leaks silently, and a `removeSignedInFixture` wrapped in a swallowing
  // `try/catch` counts as a deletion while deleting nothing. The second is
  // inherent to a static check — only a live database assertion after a real
  // run can tell a cleanup that ran from one that worked — and both are
  // `docs/deviations.md` §108 with an owner, so that the next person to trust
  // this file inherits its limits rather than finding them.
  //
  // BOTH DIRECTIONS, since Phase 4 Task 15. A label minted and never removed
  // leaks an account; a label removed and never minted is a no-op delete that
  // makes the list look like it covers more than it does, and it is how a
  // renamed case quietly stops being cleaned up. The lists are hand-maintained
  // — fifteen entries in `visual.spec.ts` — so the second direction is what
  // stops one going stale without a word.
  const { minted, removed, readable } = fixtureLabelsOf('a11y.spec.ts')

  expect(
    readable,
    'THIS GUARD cannot read that spec’s label list — see labelsDeclaredIn. Nothing is claimed here about whether the spec leaks; the guard has to be taught the shape first',
  ).toBe(true)
  expect(
    minted.length,
    'no aSignedInSession labels found — the extraction, not the spec, is what broke',
  ).toBeGreaterThan(1)
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
  // THE LIMITS ARE THE CASE ABOVE'S, unchanged: this reads source, so a label
  // minted through a wrapper is invisible and a swallowed `removeSignedInFixture`
  // counts as a deletion (`docs/deviations.md` §108). The first of those two is
  // why `signedInAs` in that spec takes a session rather than a label.
  const { minted, removed, readable } = fixtureLabelsOf('visual.spec.ts')

  expect(
    readable,
    'THIS GUARD cannot read that spec’s label list — see labelsDeclaredIn. Nothing is claimed here about whether the spec leaks; the guard has to be taught the shape first',
  ).toBe(true)
  expect(
    minted.length,
    'no aSignedInSession labels found — the extraction, not the spec, is what broke',
  ).toBeGreaterThan(1)
  expect(
    minted.filter((label) => !removed.includes(label)),
    'these labels create an account that nothing deletes when the suite finishes',
  ).toEqual([])
  expect(
    removed.filter((label) => !minted.includes(label)),
    'these labels are deleted by the cleanup and minted by no case, so the list has outlived a case that was removed or renamed',
  ).toEqual([])
})
