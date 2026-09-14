/* c8 ignore start -- Nothing can measure this file: it spawns `npx lhci`, which
 * needs a built app, a browser and minutes per run, and no Vitest project can
 * do that. The honest treatment CLAUDE.md §2.1 names for a file no pass can
 * reach is a `c8 ignore` carrying its reason, not an exclusion promising a pass
 * that does not exist. Everything this script DECIDES was moved into
 * `./lighthouseAnnotations.mjs` for exactly that reason, and that module is
 * gated at 100/100/100.
 *
 * IT SITS ABOVE THE MODULE HEADER, WHICH IS NOT A STYLE CHOICE. Placed after
 * the header block comment, this file reported 67 uncovered lines instead of
 * nothing and the `scripts/**` threshold failed at 60.81%. Moved to the first
 * line, the same file reports 0 of 0 and the directory is 100/100/100. Both
 * measured, in consecutive runs; revisit when `@vitest/coverage-v8` changes
 * version. `app/(admin)/admin/media/upload/route.ts` carries the identical
 * wrapping after ITS header and is unmeasured either way, so it settles
 * nothing about the position - saying it "is ignored correctly" would be the
 * claim this round was told to stop making, since nothing distinguishes a
 * consumed hint from a file no test imports. It wraps the imports too: an
 * unimported file's imports are themselves uncovered lines. */
/**
 * run-lighthouse.mjs — runs every Lighthouse CI configuration it is given, and
 * fails if any of them failed.
 *
 * ═══ WHY THIS IS NOT `lhci autorun && lhci autorun && lhci autorun` ═══
 *
 * It was, until Phase 2 Task 11's fix round, and the chain hid a gate. `&&`
 * stops at the first non-zero exit, so the moment `lighthouserc.book.json`'s
 * `/p/1` LCP went red, `lighthouserc.admin.json` — added in the same task,
 * third in the chain — stopped running altogether. Its numbers existed only
 * because they were collected by invoking the config directly. A gate that
 * cannot report because an earlier gate failed is a gate nobody sees, and the
 * failure mode is silent: the command exits 1, CI reports one red step, and
 * nothing says that two of the three budgets were never measured.
 *
 * So every configuration runs, whatever the ones before it did, and the
 * process exits non-zero if ANY of them did. Fail-fast is the right shape for
 * a build step; it is the wrong shape for a set of independent measurements.
 *
 * ═══ WHY THE CONFIGS ARE ARGUMENTS RATHER THAN DISCOVERED ═══
 *
 * This script could glob `lighthouserc*.json` itself. It deliberately does
 * not: `e2e/ciRegistration.test.ts` guards against a configuration file that
 * exists and is run by nothing, and it does that by reading the config
 * filenames off disk and checking that `npm run test:perf` NAMES each one. A
 * script that discovered them would satisfy that guard by construction and
 * therefore stop guarding anything — the same "passes because it cannot fail"
 * shape this phase has found fifteen times. Naming them in `package.json`
 * keeps the guard load-bearing.
 *
 * ═══ WHY EACH RUN'S NUMBERS ARE ANNOTATED, IN CI ONLY ═══
 *
 * Three CI failures of the `/p/1` LCP gate were each diagnosed by ELIMINATION,
 * because the measured number never leaves the runner: `/actions/jobs/<id>/logs`
 * answers `403 Must have admin rights` without a token, and `gh` is not
 * installed on the authoring machine. So after each configuration this emits
 * GitHub workflow commands, which become annotations on the run's own page and
 * are readable without log access. `.lighthouseci/assertion-results.json` is
 * read INSIDE the loop because the next `autorun` overwrites it.
 *
 * **`assertion-results.json` HOLDS ONLY FAILURES UNLESS IT IS ASKED NOT TO,
 * which is measured and not assumed.** `@lhci/utils/src/assertions.js` ends
 * `getAllAssertionResults` with `if (options.includePassedAssertions) return
 * results; return results.filter(result => !result.passed)`. On a green run the
 * file is therefore `[]` — checked against this repository's own
 * `.lighthouseci/` before any of this was written, and checked again by calling
 * the engine directly over the saved runs: 0 results without the option, 12
 * with it, each carrying `expected`, `actual` and its five `values`. So the
 * margin a passing run is supposed to report does not exist in that file by
 * default, and a notice built on it would have printed nothing forever.
 *
 * The option is therefore turned on as a CLI OVERRIDE under `GITHUB_ACTIONS`
 * rather than in the three `lighthouserc*.json` files. `lhci autorun` forwards
 * `--assert.<option>` to its `assert` child as `--<option>`
 * (`getOverrideArgsForCommand`), and with it on, lhci also prints every passing
 * assertion to its own stderr — which is welcome in CI and is a change to what
 * a local `npm run test:perf` prints. Local output stays exactly as it was.
 *
 * Guarded by `GITHUB_ACTIONS` so a local `npm run test:perf` prints exactly
 * what it always printed. What each line SAYS is decided by
 * `./lighthouseAnnotations.mjs`, which is a pure function with its own test —
 * nothing in this file can be executed by a Vitest project, so nothing in this
 * file may decide anything.
 *
 * Depends on: node:child_process, node:fs; `annotationLines`
 * (./lighthouseAnnotations.mjs); and `@lhci/cli` on the PATH via npx.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { annotationLines } from './lighthouseAnnotations.mjs'

/** Where `lhci autorun` writes the assertion outcomes of the run just finished. */
const ASSERTION_RESULTS = '.lighthouseci/assertion-results.json'

/**
 * What CI adds to every `autorun`, and a local run does not.
 *
 * Without this the results file carries failures only — see the module header
 * for the measurement — so there would be no median to report on a green run.
 */
const CI_ONLY_ARGS = process.env.GITHUB_ACTIONS ? ['--assert.includePassedAssertions'] : []

/** The configuration files to run, in order, from the command line. */
const configs = process.argv.slice(2)

if (configs.length === 0) {
  console.error('run-lighthouse: no lighthouserc files were named')
  process.exit(2)
}

/**
 * Prints one configuration's measured numbers as GitHub workflow commands.
 *
 * Called immediately after that configuration's `autorun`, because the next one
 * overwrites the file. THIS FUNCTION DECIDES NOTHING, which is the whole reason
 * it is three lines: it hands `annotationLines` the read itself, and a read that
 * throws — no file, no permission, a run that died before writing one — is that
 * module's to name, where a test can drive it. It used to catch the throw here
 * and map it to `undefined`, under the whole-file `c8 ignore` at line 1, which
 * is a meaning no test could ever check.
 * @param {string} config - The `lighthouserc*.json` that was just run.
 */
const annotate = (config) => {
  if (!process.env.GITHUB_ACTIONS) return

  const lines = annotationLines({ config, readResults: () => readFileSync(ASSERTION_RESULTS, 'utf8') })
  for (const line of lines) console.log(line)
}

/** What each configuration exited with, in the order they were run. */
const results = configs.map((config) => {
  console.log(`\n=== lhci autorun --config=${config} ===\n`)
  // `shell: true` because `npx` is a shim on Windows; `stdio: 'inherit'` so
  // lhci's own assertion output reaches the terminal unchanged, which is what
  // anybody reading a red gate actually needs.
  const run = spawnSync('npx', ['lhci', 'autorun', `--config=${config}`, ...CI_ONLY_ARGS], {
    stdio: 'inherit',
    shell: true,
  })
  annotate(config)
  return { config, code: run.status ?? 1 }
})

console.log('\n=== performance gates ===')
for (const { config, code } of results) console.log(`${code === 0 ? 'PASS' : 'FAIL'}  ${config}`)

process.exit(results.some(({ code }) => code !== 0) ? 1 : 0)
/* c8 ignore stop */
