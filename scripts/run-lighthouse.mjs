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
 * Depends on: node:child_process, and `@lhci/cli` on the PATH via npx.
 */
import { spawnSync } from 'node:child_process'

/** The configuration files to run, in order, from the command line. */
const configs = process.argv.slice(2)

if (configs.length === 0) {
  console.error('run-lighthouse: no lighthouserc files were named')
  process.exit(2)
}

/** What each configuration exited with, in the order they were run. */
const results = configs.map((config) => {
  console.log(`\n=== lhci autorun --config=${config} ===\n`)
  // `shell: true` because `npx` is a shim on Windows; `stdio: 'inherit'` so
  // lhci's own assertion output reaches the terminal unchanged, which is what
  // anybody reading a red gate actually needs.
  const run = spawnSync('npx', ['lhci', 'autorun', `--config=${config}`], { stdio: 'inherit', shell: true })
  return { config, code: run.status ?? 1 }
})

console.log('\n=== performance gates ===')
for (const { config, code } of results) console.log(`${code === 0 ? 'PASS' : 'FAIL'}  ${config}`)

process.exit(results.some(({ code }) => code !== 0) ? 1 : 0)
