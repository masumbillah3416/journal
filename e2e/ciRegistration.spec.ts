/**
 * ciRegistration.spec.ts — every browser spec in this directory is actually run.
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
 * It needs no browser and no server, and takes no `page` fixture, so it costs
 * the run nothing but the file read. Adding a spec means adding one name to
 * one `run:` line and one npm script; this file is what says so, at the
 * moment it is forgotten.
 * Depends on: @playwright/test, node:fs, node:path, node:url,
 * .github/workflows/ci.yml, package.json.
 */
import { expect, test } from '@playwright/test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

test('gives every browser spec an npm script a developer can run it with', () => {
  const scripts = rootScripts()
  const runners = RUNNER_SCRIPTS.map((name) => scripts[name] ?? '')

  const unrunnable = specFiles().filter((spec) => !runners.some((script) => script.includes(spec)))

  expect(
    unrunnable,
    `these spec files are named by none of ${RUNNER_SCRIPTS.join(', ')}, so nobody can run them before pushing`,
  ).toEqual([])
})
