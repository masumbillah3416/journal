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
 * `npm run test:perf` chains TWO `lhci autorun` invocations — one per
 * `lighthouserc*.json` — because lhci's collect settings are per-run, not
 * per-URL, so the book surface's 1350x940 desktop viewport cannot share a run
 * with the gallery's phone emulation
 * (`docs/adr/0014-the-viewport-the-diary-lcp-gate-is-measured-at.md`). Nothing
 * enforced that. Collapsing the script to one command — a plausible
 * tidy-up — would have silently stopped gating the book surface, the heavier
 * of the two and the one every LCP ADR measured, while `npm run test:perf`
 * still exited 0 and CI still reported the step green. That is precisely the
 * failure the two spec cases above exist for, so it gets the same treatment:
 * the config files are read off the filesystem, the script is read out of
 * `package.json`, and the case fails naming exactly which config nothing runs.
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
 * adding a Lighthouse configuration means adding one command to `test:perf`;
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

/** The npm scripts that count as a way to run a spec from a developer's machine. */
const RUNNER_SCRIPTS = ['test:e2e', 'test:visual', 'test:a11y'] as const

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

test('gives every browser spec an npm script a developer can run it with', () => {
  const scripts = rootScripts()
  const runners = RUNNER_SCRIPTS.map((name) => scripts[name] ?? '')

  const unrunnable = specFiles().filter((spec) => !runners.some((script) => script.includes(spec)))

  expect(
    unrunnable,
    `these spec files are named by none of ${RUNNER_SCRIPTS.join(', ')}, so nobody can run them before pushing`,
  ).toEqual([])
})
