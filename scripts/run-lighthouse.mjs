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
 * ═══ WHY A CONFIGURATION CAN NEED A SESSION BEFORE IT RUNS ═══
 *
 * `docs/testing.md` recorded for seven rounds that "`/admin` ITSELF HAS NO
 * LIGHTHOUSE BUDGET", because `/admin` is guarded: a collector that sends no
 * cookie is answered with a redirect to `/admin/sign-in` and measures that
 * screen twice under `/admin`'s name. Closing it needs "a seeded account plus
 * an `extraHeaders` cookie in the collect settings", and Phase 4 Task 3 is
 * where that happens.
 *
 * So before any configuration that collects an `/admin…` address, this mints a
 * live session (`npm run lighthouse:session -w apps/web`) and passes it to lhci
 * as a collect-settings override. IT REFUSES TO RUN WITHOUT ONE, and that
 * refusal is the whole point: a missing cookie does not fail the gate on its
 * own — Lighthouse follows the redirect and reports a 200 for the sign-in
 * screen — so a run that could not mint one would be green and meaningless.
 *
 * AND IT CHECKS THAT THE COOKIE WAS HONOURED, not merely that one was minted.
 * A cookie that mints and is refused leaves Lighthouse on `/admin/sign-in`
 * with **all four assertions passing** — that screen measures status 1,
 * 140,763 bytes against 327,680, LCP 2,929ms against 3,085 and CLS 0. So after
 * each such configuration this reads the runs' own final URLs and exits
 * non-zero if any of them moved. Without it the gate is green on the wrong
 * screen and every later task's headroom is fictional.
 *
 * WHAT IS PRINTED IS A LIVE CREDENTIAL. It is read off the child's stdout,
 * handed to lhci as an argument, and never written to a file by this code —
 * but **Lighthouse copies its own `configSettings`, `extraHeaders` included,
 * into every report it writes**, so the header does land in `.lighthouseci/`
 * and `lhci-reports/`. Both are `.gitignore`d and MUST STAY SO, and neither may
 * be uploaded as a CI artifact. What makes the written copy harmless rather
 * than merely hidden is the revocation below: once a configuration's runs are
 * done, every session the collector holds is revoked, so the value in those
 * files authenticates nothing.
 *
 * Every DECISION in the three paragraphs above lives in
 * `./lighthouseSession.mjs`, beside the annotations' own module and for the
 * identical reason: nothing in this file can be executed by a Vitest project,
 * so nothing in this file may decide anything.
 *
 * Depends on: node:child_process, node:fs; `annotationLines`
 * (./lighthouseAnnotations.mjs); `collectorLanded`, `collectsAdmin`,
 * `sessionCookie` and `sessionOverrideArgs` (./lighthouseSession.mjs); and
 * `@lhci/cli` on the PATH via npx.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { annotationLines } from './lighthouseAnnotations.mjs'
import { collectorLanded, collectsAdmin, sessionCookie, sessionOverrideArgs } from './lighthouseSession.mjs'

/** Where `lhci autorun` writes the assertion outcomes of the run just finished. */
const ASSERTION_RESULTS = '.lighthouseci/assertion-results.json'

/** Where it writes one report per run, and which the next `autorun` replaces. */
const REPORT_DIR = '.lighthouseci'

/**
 * What CI adds to every `autorun`, and a local run does not.
 *
 * Without this the results file carries failures only — see the module header
 * for the measurement — so there would be no median to report on a green run.
 */
const CI_ONLY_ARGS = process.env.GITHUB_ACTIONS ? ['--assert.includePassedAssertions'] : []

/** What mints the collector's session, and where it is run from. */
const MINT_COMMAND = ['run', 'lighthouse:session', '-w', 'apps/web', '--silent']

/** What takes every session the collector holds away again, once the runs are done. */
const REVOKE_COMMAND = ['run', 'lighthouse:session:revoke', '-w', 'apps/web', '--silent']

/** The configuration files to run, in order, from the command line. */
const configs = process.argv.slice(2)

if (configs.length === 0) {
  console.error('run-lighthouse: no lighthouserc files were named')
  process.exit(2)
}

/**
 * The lhci overrides one configuration needs before it can be trusted.
 *
 * THIS FUNCTION DECIDES NOTHING, like `annotate` below: whether a
 * configuration needs a session, what counts as a cookie in the child's
 * output, and what lhci is handed are all `./lighthouseSession.mjs`'s, where a
 * test drives them. What is here is the process spawn and the exit.
 * @param {string} config - The `lighthouserc*.json` about to be run.
 * @returns {readonly string[]} The extra arguments for `lhci autorun`.
 */
const sessionArgs = (config) => {
  if (!collectsAdmin(readFileSync(config, 'utf8'))) return []

  const minted = spawnSync('npm', MINT_COMMAND, { encoding: 'utf8', shell: true })
  const cookie = sessionCookie(minted.stdout ?? '')

  if (cookie === null) {
    console.error(`run-lighthouse: could not mint a session for ${config}`)
    console.error(minted.stderr ?? '')
    console.error('run-lighthouse: it collects a guarded admin address, so without one it would measure sign-in')
    process.exit(2)
  }

  return sessionOverrideArgs(cookie)
}

/**
 * Refuses a run that was answered somewhere other than it asked.
 *
 * THIS FUNCTION DECIDES NOTHING either: what counts as landing where it asked,
 * and what an empty set of reports means, are `./lighthouseSession.mjs`'s,
 * where cases drive them. The directory read and the exit are here. It is read
 * INSIDE the loop for the same reason `annotate` is — the next `autorun`
 * replaces these files.
 * @param {string} config - The `lighthouserc*.json` that was just run.
 */
const refuseARedirectedRun = (config) => {
  if (!collectsAdmin(readFileSync(config, 'utf8'))) return

  const reports = readdirSync(REPORT_DIR)
    .filter((name) => /^lhr-.*\.json$/.test(name))
    .map((name) => readFileSync(`${REPORT_DIR}/${name}`, 'utf8'))

  const landed = collectorLanded(reports)
  if (landed.ok) return

  console.error(`run-lighthouse: ${config} did not measure the screens it named`)
  console.error(`run-lighthouse: ${landed.message}`)
  console.error('run-lighthouse: the collector carried a session and the guard did not accept it, so these numbers')
  console.error('run-lighthouse: describe the sign-in screen and not the screen they are named after')
  process.exit(3)
}

/**
 * Takes the collector's sessions away once a configuration is done with them.
 *
 * Lighthouse writes `extraHeaders` into every report it saves, so the cookie
 * outlives the run in `.lighthouseci/` and `lhci-reports/` whatever this script
 * does. Revoking is what makes those copies worthless rather than merely
 * gitignored. A failure here is reported and does not fail the gate: the
 * numbers are already collected, and turning a cleanup into a red performance
 * run would teach people to ignore a red performance run.
 * @param {string} config - The `lighthouserc*.json` that was just run.
 */
const revokeCollectorSessions = (config) => {
  if (!collectsAdmin(readFileSync(config, 'utf8'))) return

  const revoked = spawnSync('npm', REVOKE_COMMAND, { encoding: 'utf8', shell: true })
  if (revoked.status !== 0) {
    console.error(`run-lighthouse: could not revoke the collector's session after ${config}`)
    console.error(revoked.stderr ?? '')
    console.error('run-lighthouse: a live admin cookie is in .lighthouseci/ and lhci-reports/ until it expires')
  }
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
  const run = spawnSync('npx', ['lhci', 'autorun', `--config=${config}`, ...CI_ONLY_ARGS, ...sessionArgs(config)], {
    stdio: 'inherit',
    shell: true,
  })
  annotate(config)
  // BEFORE the revoke, because it reads the reports that carry the cookie, and
  // BEFORE the next configuration, which replaces them.
  refuseARedirectedRun(config)
  revokeCollectorSessions(config)
  return { config, code: run.status ?? 1 }
})

console.log('\n=== performance gates ===')
for (const { config, code } of results) console.log(`${code === 0 ? 'PASS' : 'FAIL'}  ${config}`)

process.exit(results.some(({ code }) => code !== 0) ? 1 : 0)
/* c8 ignore stop */
