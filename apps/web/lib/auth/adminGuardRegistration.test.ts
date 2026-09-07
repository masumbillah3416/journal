/**
 * adminGuardRegistration.test.ts — nothing that answers at an `/admin` address
 * can mutate without applying the guard in its own file.
 *
 * ═══ WHY THIS FILE EXISTS ═══
 *
 * `SECURITY.md`: "Check authorization on **every mutation**, not just at
 * login... nothing inherits trust from the page it was reached from." Phase 4
 * builds ten screens of mutations. A guard that each of those screens has to
 * remember to call is a guard one of them will not call, and the failure is
 * invisible in every other way this repository checks its work: the screen
 * renders, its tests pass, its visual baseline matches, and it is open to
 * anybody who types the address.
 *
 * The layer that would make forgetting impossible does not exist here, and the
 * reasons are written down where they belong — `apps/web/middleware.ts` runs
 * in the Edge runtime and cannot read a `sessions` row, and a shared layout
 * cannot cover `/admin/sign-in/done` without also covering the sign-in screens
 * beside it, which must answer to a reader who has no session. So the thing
 * that makes forgetting impossible is this test, and it fails on the commit
 * that forgets rather than on the day somebody notices.
 *
 * ═══ IT HAS NOW CREDITED THE WRONG THING FIVE TIMES, SO IT IS BUILT
 *     DIFFERENTLY ═══
 *
 * Four of the five were caught in the phase that wrote it, and the fifth was a
 * set of three found by the whole-branch review:
 *
 *   1. It matched the guard's NAME anywhere in the file, so the `import` line
 *      and the header comment satisfied it.
 *   2. It stripped those and required a `(` — and followed the route file's
 *      imports one level, so `guard.ts`'s own body credited every file that
 *      imported it.
 *   3. It stopped following `guard.ts` — and still credited a route for ANY
 *      module it imported, so a guarded route re-exporting any handler from
 *      `signInEndpoints.ts` passed, because that module holds several and one
 *      of them called the guard. Ruling F61 removed the following entirely.
 *   4. It read only `page.tsx` and `route.ts`, under a HARD-CODED
 *      `app/(admin)/admin`. So a Server Action in an `actions.ts` was never
 *      read at all — and `docs/api.md` says Phase 4's mutations will be server
 *      actions; an action defined INSIDE a scanned `page.tsx` satisfied the
 *      regex on the strength of the page component's own guard call, while
 *      being dispatched as a separate `POST` BEFORE the page renders; and a
 *      route under a second route group (`app/(panel)/admin/…`, which Next
 *      serves at the same address) was invisible to the walk.
 *
 * PATCHING THOSE THREE WOULD HAVE MADE A SIXTH INEVITABLE. Every version so
 * far has been an ENUMERATION — of file names, of directories, of the shapes
 * an author might use — and an enumeration is wrong the moment somebody uses a
 * shape nobody listed. This one is built the other way round, in four rules:
 *
 *   **A · Discover, do not enumerate.** The walk covers the whole `app/` tree
 *   and computes each file's address the way Next.js does, so a route group
 *   nobody has invented yet contributes nothing to the address and is seen.
 *
 *   **B · Fail closed on a file whose kind is not recognised.** Every file
 *   sitting under an admin address must be classified: a route file, a Server
 *   Action module, or one of the Next.js conventions in
 *   {@link NON_SERVABLE_FILES}, each listed with the reason it cannot answer a
 *   request. Anything else FAILS, naming the file. A new framework convention,
 *   a `.mdx` page, an extension nobody here has seen — none of them passes
 *   unseen; the suite stops and somebody decides.
 *
 *   **C · Server Actions are NOT this file's business, and that is round 5's
 *   correction.** They were, for one round: this file walked three named
 *   directories for a `'use server'` prologue and split each module's text at
 *   `/^export\s+(?:const|(?:async\s+)?function)/` to check its exports. It was
 *   defeated five times in five attempts — by a module in a fourth directory
 *   (`apps/web/actions/`), by `export default async function`, by
 *   `export { name }`, by `export default name`, and by a single space before
 *   the word `export`. Meanwhile three documents had been rewritten to promise
 *   "every export of every `'use server'` module in `apps/web`", which the scan
 *   never did: B3's species again, with the claim growing while the code stood
 *   still.
 *
 *   The fix is not a tenth pattern. "Every export of every module" is not a
 *   sentence text matching can express, so it is written where the exports are
 *   already parsed: `eslint-rules/guarded-server-actions.js`, an ESLint rule
 *   over the AST, running on every file `npm run lint` visits. And the shape it
 *   admits is one that cannot be got wrong — `guardedAction()`
 *   (`apps/web/lib/auth/guard.ts`) calls the guard and then the action, so an
 *   action has no opportunity to forget. What THIS file keeps is the two
 *   questions about that arrangement which are not about a syntax tree: is the
 *   rule still switched on, and has anybody switched it off for a file.
 *
 * ═══ HOW IT DECIDES, FOR THE FILES IT DOES RECOGNISE ═══
 *
 * A route file at a guarded address must satisfy one of two things —
 *
 *   1. `adminAccess.ts` declares its address public (`ADMIN_PUBLIC_PATHS`, or
 *      the reset link's own shape), which is a deliberate, reviewable statement
 *      that the address answers to anybody; or
 *   2. the file APPLIES the guard in its own body — `guarded(handler)` for a
 *      route, `requireAdminSession()` for a page. Nothing it imports is read:
 *      see {@link GUARD_APPLICATIONS}.
 *
 * THE SENTINELS ARE NOT DECORATION. A scan that walked the wrong directory, or
 * whose path arithmetic was off by a segment, would find nothing and pass with
 * every screen unguarded. So the first cases assert the walk found the
 * addresses this repository is known to mount, by name, and that each new rule
 * can actually FAIL, before anything is concluded from any of them.
 *
 * Depends on: node:fs, node:path, node:url, vitest, ./adminAccess.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isGuardedAdminPath } from './adminAccess'

/** apps/web/lib/auth -> apps/web. */
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * The whole Next.js app directory, walked from its root.
 *
 * NOT `app/(admin)/admin`, which is what the previous version read. Next.js
 * serves `app/(panel)/admin/journeys/route.ts` at `/admin/journeys` — route
 * groups contribute no path segment — so a second group is a mutation endpoint
 * at a guarded address that a walk rooted inside the first group cannot see.
 * Rooting at `app/` means the walk cannot be escaped by naming a directory.
 */
const APP_DIRECTORY = 'app'

/** The prefix an address must carry to be this file's business. */
const ADMIN_PREFIX = '/admin'

/**
 * The file names Next.js serves an address from.
 *
 * Every extension Next.js accepts for each, not just the two this repository
 * happens to use: a `route.js` added tomorrow is the same endpoint as a
 * `route.ts`, and a scan that knew only about `.ts` would treat it as an
 * unrecognised file. Rule B would then fail rather than pass it, which is the
 * safe direction — but failing for the wrong reason teaches an author to widen
 * the wrong list.
 */
const ROUTE_FILE_NAMES: readonly string[] = [
  'page.tsx',
  'page.ts',
  'page.jsx',
  'page.js',
  'route.ts',
  'route.tsx',
  'route.js',
  'route.mjs',
]

/**
 * Files that may sit under an admin address without answering a request, each
 * with the reason it cannot.
 *
 * THIS LIST IS THE WHOLE OF RULE B, so it is written as reasons rather than as
 * a pattern. Anything under an admin address that is neither a route file, nor
 * a Server Action module, nor one of these, fails the suite by name — which is
 * what stops a convention nobody here has heard of from being served unseen.
 *
 * - `layout.tsx`/`template.tsx` wrap a page and answer no request of their own;
 *   the page inside them is scanned on its own terms, which is the point of
 *   `SECURITY.md`'s "nothing inherits trust from the page it was reached from".
 * - `not-found.tsx`, `loading.tsx`, `error.tsx`, `global-error.tsx` are
 *   rendered in place of a page rather than fetched, and none mutates.
 * - `*.module.css` is a stylesheet.
 * - `*.test.ts`/`*.test.tsx` are this repository's own tests, never shipped.
 */
const NON_SERVABLE_FILES: readonly { readonly matches: (name: string) => boolean; readonly because: string }[] = [
  { matches: (name) => name === 'layout.tsx', because: 'a layout wraps a page and answers no request of its own' },
  { matches: (name) => name === 'template.tsx', because: 'a template wraps a page and answers no request of its own' },
  { matches: (name) => name === 'not-found.tsx', because: 'rendered in place of a page, never fetched' },
  { matches: (name) => name === 'loading.tsx', because: 'rendered in place of a page, never fetched' },
  { matches: (name) => name === 'error.tsx', because: 'rendered in place of a page, never fetched' },
  { matches: (name) => name === 'global-error.tsx', because: 'rendered in place of a page, never fetched' },
  { matches: (name) => name.endsWith('.module.css'), because: 'a stylesheet' },
  { matches: (name) => name.endsWith('.test.ts') || name.endsWith('.test.tsx'), because: 'a test, never shipped' },
]

/**
 * The files permitted to carry an `eslint-disable` for the Server Action rule,
 * by exact path.
 *
 * DEFAULT-DENY, the same way `ADMIN_PUBLIC_PATHS` is, and for the same reason:
 * a disable comment is the one thing that defeats
 * `eslint-rules/guarded-server-actions.js`, and it should be a decision
 * somebody made rather than a line somebody added. A second entry here is a
 * diff a reviewer sees.
 *
 * The one entry is Payload's own Server Action dispatcher. `RootLayout`
 * requires it and its directive has to sit inside a function, because Payload's
 * type is a function rather than a module. It is not ours to guard:
 * `handleServerFunctions` authenticates against the `payload-token` cookie and
 * runs Payload's own access control, and wrapping it in `guardedAction` would
 * demand a `td-session` Payload knows nothing about. Since
 * `apps/web/collections/sealedUserAuth.ts` sealed every endpoint that could
 * mint a `payload-token`, its reachable surface is what Payload grants an
 * anonymous request — the same surface `/api/**` already exposes.
 */
const ACTIONS_RULE_EXEMPT_FILES: readonly string[] = ['apps/web/app/(payload)/layout.tsx']

/** Splits a file into lines, whichever line ending it was written with. */
const NEWLINE = /\r?\n/u

/** The rule that makes an unguarded Server Action a lint error. */
const ACTIONS_RULE = 'travel-diary/guarded-server-actions'

/**
 * Every way a mounted file can apply the guard, and the `(` is the point.
 *
 * `guarded(` is the wrapper a route handler is exported through;
 * `requireAdminSession(` is what a Server Component or a Server Action calls;
 * `authenticateAdminRequest(` is the underlying read, allowed here because a
 * route that calls it directly has still made the decision in its own file.
 *
 * The fix for the three rounds this scan was decorative is not another
 * exclusion: it is that **the guard is applied in the file itself**
 * (`guarded(handleSignOut)`), so this scan reads that one file and follows
 * nothing at all. A check that has to look somewhere else to find its subject
 * is a check that can be satisfied by a neighbour.
 */
const GUARD_APPLICATIONS = /(guarded|requireAdminSession|authenticateAdminRequest)\s*\(/u

/**
 * The separator `git ls-files -z` writes between paths.
 *
 * `String.fromCharCode(0)` rather than an escape, for the same reason the
 * rule's own test spells a line break that way: an escape sequence written into
 * a source file by a script is one transcription error away from being a real
 * control byte in the file, and this one would be invisible in a diff.
 */
const NUL_SEPARATOR = String.fromCharCode(0)

/** The repository root — `apps/web/lib/auth` -> the workspace above `apps/`. */
const repositoryRoot = path.resolve(webRoot, '../..')

/**
 * Every file the repository holds, tracked or newly written, repository-relative.
 *
 * ═══ WHY GIT AND NOT A DIRECTORY WALK ═══
 *
 * The version this replaced enumerated five directory names
 * (`['app','components','lib','collections','scripts']`) inside `apps/web` — in
 * the file whose own header says that being outside a directory list is how
 * five of the nine defeats worked. It was duly defeated by
 * `apps/web/actions/journeys.ts` and by `apps/web/globals/journeyActions.ts`,
 * both real directories, and by anything at all outside `apps/web`.
 *
 * A hand-rolled walk from the repository root would need a skip list —
 * `node_modules`, `.next`, `coverage`, `media`, the Playwright and Lighthouse
 * artefacts — and that skip list is the same enumeration wearing a different
 * hat. `git ls-files` needs no list from us: the index plus the untracked files
 * git does not ignore IS "what this repository holds", and `.gitignore` is
 * already the repository's own written statement of what is generated rather
 * than authored.
 *
 * `--others --exclude-standard` as well as `--cached` is the load-bearing part:
 * an attack on this check writes a file, runs the gate and deletes it, and a
 * listing of the index alone would not see a file that was never staged. What
 * it deliberately does NOT see is a file somebody has added to `.gitignore` —
 * which cannot be committed, and whose `.gitignore` line is a visible decision
 * in the same diff.
 *
 * @returns One repository-relative path per file, with `/` separators.
 * @throws If `git` cannot be run, rather than returning an empty list — an
 *   empty list would satisfy every case below having read nothing.
 */
const repositoryFiles = (): readonly string[] => {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const files = listed.split(NUL_SEPARATOR).filter((file) => file.length > 0)
  if (files.length === 0) throw new Error('git listed no files, so nothing below has read anything')
  return files
}

/** The bytes of one repository file. */
const bytesOf = (file: string): Buffer => readFileSync(path.join(repositoryRoot, file))

/**
 * Both spellings of the directive that turns a module's exports into endpoints.
 *
 * Searched over BYTES rather than decoded text, so a file this scan has no
 * business decoding — a PNG baseline, the handoff's screenshots — costs one
 * buffer comparison instead of a UTF-8 decode, and cannot throw.
 */
const SERVER_DIRECTIVE_SPELLINGS: readonly string[] = ["'use server'", '"use server"']

/** Whether a file carries the directive anywhere in it, comments included. */
const carriesTheDirective = (file: string): boolean => {
  const bytes = bytesOf(file)
  return SERVER_DIRECTIVE_SPELLINGS.some((spelling) => bytes.includes(spelling))
}

/**
 * Files that carry the directive as PROSE rather than as a module, by exact path.
 *
 * DEFAULT-DENY, like {@link ACTIONS_RULE_EXEMPT_FILES}: the coverage case below
 * requires every file carrying `'use server'` to be one ESLint lints with the
 * rule at `error`, and these three are documentation quoting the mechanism.
 * They are named individually rather than excused by a `docs/` prefix or a
 * `.md` suffix, because a prefix would also excuse a `.jsx` action somebody
 * dropped in a documentation directory, and the whole defect being closed here
 * is a file at an address nobody listed.
 *
 * The consequence is stated rather than left to be met: a NEW document that
 * quotes the directive fails this case until it is listed. That is the safe
 * direction — the failure names the file and asks somebody whether it is prose
 * or a module — but it is friction, and it is the price of not owning a pattern
 * that a real action could hide behind.
 */
const DIRECTIVE_IN_PROSE: readonly { readonly path: string; readonly because: string }[] = [
  { path: 'docs/adr/0018-admin-request-policy-and-the-guard-split.md', because: 'the ADR describing the rule' },
  { path: 'docs/api.md', because: 'the shape a Phase 4 action takes, in a fenced example' },
  { path: 'docs/architecture.md', because: 'the paragraph naming the rule and what defeats it' },
  { path: 'docs/security.md', because: 'the discharge table cell for authorization on every mutation' },
  { path: 'docs/testing.md', because: 'the section explaining this suite, which §1.2 requires' },
]

/** Narrows an unknown to an indexable object, so nothing below needs a cast. */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** The severity that makes the gate fail rather than warn. */
const ERROR_SEVERITY = 2

/**
 * The program that asks ESLint how it would configure the rule for some paths.
 *
 * ═══ WHY THIS RUNS IN A CHILD PROCESS ═══
 *
 * It could be four lines of `await new ESLint().calculateConfigForFile(...)`
 * inline, and that is how it was first written. The reason it is not is a
 * measured coverage-tooling interaction, not a preference: ESLint loads
 * `eslint.config.js` — and through it `eslint-rules/guarded-server-actions.js` —
 * with Node's own loader, so calling the ESLint API from inside a Vitest worker
 * puts a SECOND, UNINSTRUMENTED copy of the rule in the same process. Both
 * copies report against the same source path, the uninstrumented one's zero
 * counts win, and `@vitest/coverage-v8` then reports the rule at 89.84% lines /
 * 63.15% functions — with every function marked unexecuted — where the
 * RuleTester suite alone measures it at 100/100/100 and `vitest.config.ts`
 * gates it at 100%. Reproduced by running the two test files together and then
 * separately.
 *
 * A child process keeps the two loads in two processes. It also asks the
 * question the way `npm run lint` asks it — a fresh Node process, ESLint
 * resolving its own config off disk — rather than the way a test harness would.
 *
 * The paths arrive on STDIN as JSON rather than as arguments: this repository
 * lists over five hundred files, and Windows caps a command line at 32,767
 * characters.
 */
const SEVERITY_PROBE_PROGRAM = [
  "import { ESLint } from 'eslint'",
  'const chunks = []',
  'for await (const chunk of process.stdin) chunks.push(chunk)',
  'const eslint = new ESLint({ cwd: process.cwd() })',
  'const answer = {}',
  "for (const file of JSON.parse(Buffer.concat(chunks).toString('utf8'))) {",
  '  const resolved = await eslint.calculateConfigForFile(file)',
  "  const entry = resolved?.rules?.['" + 'travel-diary/guarded-server-actions' + "']",
  '  answer[file] = Array.isArray(entry) ? entry[0] : (entry ?? null)',
  '}',
  'process.stdout.write(JSON.stringify(answer))',
].join('\n')

/**
 * How ESLint would configure {@link ACTIONS_RULE} for each of some paths.
 *
 * ASKED OF ESLINT RATHER THAN READ OUT OF `eslint.config.js`. The case this
 * replaced sliced the config's source text between two markers and asserted a
 * `files:` key was absent from the slice, which a `files:` key written AFTER
 * the rules key sat outside of. `calculateConfigForFile` runs the same
 * resolution `eslint .` runs, answers for a path whose file does not exist, and
 * has no opinion about where in the file a key was written.
 *
 * The child's answer is narrowed rather than trusted — CLAUDE.md §3.1 bans the
 * `any` ESLint types that method as, and this crosses a process boundary, which
 * is a trust boundary — so a reply of any other shape reads back as
 * `undefined`, which every caller treats as "not at error".
 *
 * @param files - Repository-relative paths, which need not exist.
 * @returns The severity per path: 2 for `error`, 1 for `warn`, 0 for `off`,
 *   undefined when it is a file ESLint does not lint at all.
 * @throws If the child cannot be run or does not answer with an object, rather
 *   than returning nothing — an empty answer would satisfy every case below.
 */
const configuredSeverities = (files: readonly string[]): ReadonlyMap<string, number | undefined> => {
  const printed = execFileSync(process.execPath, ['--input-type=module', '-e', SEVERITY_PROBE_PROGRAM], {
    cwd: repositoryRoot,
    input: JSON.stringify(files),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const answer: unknown = JSON.parse(printed)
  if (!isRecord(answer)) throw new Error('the severity probe did not answer with an object')

  const severities = new Map<string, number | undefined>()
  for (const file of files) {
    const severity: unknown = answer[file]
    severities.set(file, typeof severity === 'number' ? severity : undefined)
  }
  return severities
}

/**
 * A program printing, for each path handed to it, whether ESLint ignores it.
 *
 * A SECOND PROBE RATHER THAN A FIELD ON THE FIRST, because the two questions
 * are different: `calculateConfigForFile` answers for a path ESLint would never
 * visit, so it cannot tell a linted file from an ignored one. Run in a child
 * process for the same measured coverage reason as
 * {@link SEVERITY_PROBE_PROGRAM} — see its own comment.
 */
const IGNORE_PROBE_PROGRAM = [
  "import { ESLint } from 'eslint'",
  'const chunks = []',
  'for await (const chunk of process.stdin) chunks.push(chunk)',
  'const eslint = new ESLint({ cwd: process.cwd() })',
  'const answer = {}',
  "for (const file of JSON.parse(Buffer.concat(chunks).toString('utf8'))) {",
  '  answer[file] = await eslint.isPathIgnored(file)',
  '}',
  'process.stdout.write(JSON.stringify(answer))',
].join('\n')

/**
 * Whether ESLint ignores each of some paths, asked of ESLint.
 *
 * @param files - Repository-relative paths, which need not exist.
 * @returns The paths ESLint does NOT ignore, in the order given.
 * @throws If the child cannot be run or does not answer with an object, rather
 *   than returning nothing — an empty answer would satisfy the case below.
 */
const pathsEslintWalks = (files: readonly string[]): readonly string[] => {
  const printed = execFileSync(process.execPath, ['--input-type=module', '-e', IGNORE_PROBE_PROGRAM], {
    cwd: repositoryRoot,
    input: JSON.stringify(files),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const answer: unknown = JSON.parse(printed)
  if (!isRecord(answer)) throw new Error('the ignore probe did not answer with an object')

  return files.filter((file) => answer[file] !== true)
}

/**
 * Every directory `.prettierignore` names, as a probe path inside it.
 *
 * Read off the file rather than listed here, so the two ignore sets cannot
 * drift apart silently — which is exactly what happened to `.lighthouseci/`.
 * Only directory entries are taken: `.prettierignore` also names one generated
 * FILE and three binary globs, which are not directories ESLint walks into.
 *
 * @returns One `<directory>/probe.js` per directory entry.
 */
const generatedDirectoryProbes = (): readonly string[] =>
  readFileSync(path.join(repositoryRoot, '.prettierignore'), 'utf8')
    .split(NEWLINE)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && line.endsWith('/'))
    .map((directory) => `${directory}probe.js`)

/** One mounted address and the file that serves it. */
interface MountedAddress {
  /** The URL Next.js serves it at, e.g. `/admin/sign-in/done`. */
  readonly url: string
  /** The file, relative to `apps/web`. */
  readonly file: string
}

/**
 * Every file under a directory, recursively.
 *
 * @param directory - Where to look, relative to `apps/web`.
 * @returns One path per file, relative to `apps/web`, with `/` separators.
 */
const filesUnder = (directory: string): readonly string[] =>
  readdirSync(path.join(webRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const child = `${directory}/${entry.name}`
    return entry.isDirectory() ? filesUnder(child) : [child]
  })

/**
 * The address Next.js serves a file at, computed the way Next.js computes it.
 *
 * @param file - The file, relative to `apps/web`.
 * @returns The URL of the directory holding it. Route groups — a directory in
 *   parentheses — contribute no segment, exactly as Next.js treats them, so a
 *   file under ANY group is measured at the address it really answers at; a
 *   bracketed segment is left as written, which is what `adminAccess.ts`'s
 *   reset-link rule expects to see.
 */
const addressOf = (file: string): string => {
  const segments = file
    .slice(`${APP_DIRECTORY}/`.length)
    .split('/')
    .slice(0, -1)
    .filter((segment) => !segment.startsWith('('))
  return `/${segments.join('/')}`
}

/**
 * A source file with its comments and its import statements removed.
 *
 * Both are places the guard's NAME appears without the guard being applied: a
 * TSDoc header that explains the guarding, and the `import` that brings it in.
 * A scan over raw text is satisfied by either, which is what made the first
 * version of this file green with the call deleted.
 *
 * Text-level rather than a parse, and the failure direction is why that is
 * enough: it can only remove too much, which makes the scan find FEWER calls
 * and turns a mistake into a failing test rather than a silent pass.
 *
 * @param source - The file's text.
 * @returns The same text with its comments blanked and its imports dropped.
 */
const sourceWithoutMentions = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/u, ''))
    .filter((line) => !/^\s*import\b/u.test(line))
    .join('\n')

/**
 * The text of one file under `apps/web`.
 * @param file - The path, relative to `apps/web`.
 * @returns Its contents.
 */
const textOf = (file: string): string => readFileSync(path.join(webRoot, file), 'utf8')

/**
 * Whether a file mentions the `'use server'` directive at all.
 *
 * DELIBERATELY CRUDE, and it is not a guard: `eslint-rules/guarded-server-actions.js`
 * decides what a Server Action module may export, over the parsed AST. This is
 * only rule B's classifier, and it fails in the safe direction — a file it
 * cannot recognise falls into the unaccounted list and fails the suite.
 *
 * @param source - The file's text, comments and imports already stripped.
 * @returns `true` when the directive appears anywhere in the file.
 */
const mentionsServerDirective = (source: string): boolean => /(['"])use server\1/u.test(source)

/**
 * Whether a file applies the guard in its own body.
 * @param source - The file's text, comments and imports already stripped.
 * @returns `true` when the file itself calls or applies a guard.
 */
const appliesTheGuard = (source: string): boolean => GUARD_APPLICATIONS.test(source)

describe('the admin addresses this repository mounts', () => {
  const everyAppFile = filesUnder(APP_DIRECTORY)
  const underAnAdminAddress = everyAppFile.filter((file) => addressOf(file).startsWith(ADMIN_PREFIX))
  const mounted: readonly MountedAddress[] = underAnAdminAddress
    .filter((file) => ROUTE_FILE_NAMES.includes(path.basename(file)))
    .map((file) => ({ url: addressOf(file), file }))

  it('finds the addresses that are known to be mounted, so the scan is not looking at nothing', () => {
    // The sentinel. Every conclusion below is drawn from this list, and a walk
    // that produced an empty one would satisfy them all.
    const urls = mounted.map((address) => address.url)

    expect(urls).toContain('/admin/sign-in')
    expect(urls).toContain('/admin/sign-in/done')
    expect(urls).toContain('/admin/sign-out')
    expect(urls).toContain('/admin/reset/[token]')
  })

  it('walks the whole app tree, so a second route group is not invisible to it', () => {
    // The walk used to be rooted at `app/(admin)/admin`. Next serves
    // `app/(panel)/admin/journeys/route.ts` at `/admin/journeys` all the same,
    // and a walk inside one group cannot see another. Proved on real files:
    // the tree holds three route groups, and the address arithmetic drops each.
    expect(everyAppFile.some((file) => file.startsWith('app/(diary)/'))).toBe(true)
    expect(everyAppFile.some((file) => file.startsWith('app/(payload)/'))).toBe(true)
    expect(addressOf('app/(panel)/admin/journeys/route.ts')).toBe('/admin/journeys')
    expect(addressOf('app/(admin)/admin/sign-out/route.ts')).toBe('/admin/sign-out')
  })

  it('finds both kinds of file, so a route handler is not invisible to it', () => {
    // A scan matching only `page.tsx` would see every screen and no endpoint —
    // and the endpoints are the mutations `SECURITY.md` is actually about.
    expect(mounted.map((address) => address.file).filter((file) => file.endsWith('route.ts'))).not.toHaveLength(0)
    expect(mounted.map((address) => address.file).filter((file) => file.endsWith('page.tsx'))).not.toHaveLength(0)
  })

  it('leaves every guarded address applying the guard in its own file', () => {
    const unguarded = mounted
      .filter((address) => isGuardedAdminPath(address.url))
      .filter((address) => !appliesTheGuard(sourceWithoutMentions(textOf(address.file))))

    expect(
      unguarded.map((address) => address.file),
      'these admin addresses are guarded by policy but apply no guard in their own file: declare them in ADMIN_PUBLIC_PATHS, call requireAdminSession, or export guarded(handler)',
    ).toEqual([])
  })

  it('accounts for every file under an admin address, so an unrecognised one fails rather than passing', () => {
    // RULE B, and the reason this file is not another enumeration. Every
    // previous version listed the shapes it knew and was silent about the rest;
    // this one requires each file to be classified, so a Next.js convention
    // nobody here has heard of stops the suite instead of shipping unseen.
    const unaccounted = underAnAdminAddress.filter((file) => {
      const name = path.basename(file)
      if (ROUTE_FILE_NAMES.includes(name)) return false
      if (NON_SERVABLE_FILES.some((kind) => kind.matches(name))) return false
      return !mentionsServerDirective(sourceWithoutMentions(textOf(file)))
    })

    expect(
      unaccounted,
      'these files sit under an /admin address and this scan cannot say whether they answer a request: classify them in ROUTE_FILE_NAMES, NON_SERVABLE_FILES, or make them a guarded Server Action module',
    ).toEqual([])
  })

  it('reads a guard APPLICATION rather than a mention of one', () => {
    // Fix round 1, finding 6 of round 0: the first version matched the guard's
    // name anywhere, so deleting the call left the `import` line and the header
    // comment matching and every case green.
    const namedButNeverApplied = [
      "import { requireAdminSession } from '../../lib/auth/guard'",
      '/** Calls requireAdminSession() before it draws anything. */',
      '// requireAdminSession() belongs here',
      'const Page = () => null',
    ].join('\n')

    expect(GUARD_APPLICATIONS.test(sourceWithoutMentions(namedButNeverApplied))).toBe(false)
    expect(GUARD_APPLICATIONS.test(sourceWithoutMentions('const account = await requireAdminSession()'))).toBe(true)
    expect(GUARD_APPLICATIONS.test(sourceWithoutMentions('export const POST = guarded(handleSignOut)'))).toBe(true)
  })

  it('credits no route for what a module it imports happens to contain', () => {
    // FIX ROUND 1, FINDING 2, and the third instance of this class in the one
    // file whose whole purpose is to stop a screen going unguarded. The scan
    // used to follow a route file's imports one level, so a guarded route
    // re-exporting ANY handler from `signInEndpoints.ts` passed — that module
    // holds several, and one of them called the guard. It now reads the route
    // file alone, which is why `sign-out/route.ts` applies `guarded` itself.
    //
    // Asserted against a REAL mounted file rather than a fabricated string: a
    // route that names a handler and no guard must fail the scan even though
    // the module it imports from is full of guard calls.
    expect(appliesTheGuard(sourceWithoutMentions(textOf('app/(admin)/admin/sign-in/password/route.ts')))).toBe(false)
    expect(appliesTheGuard(sourceWithoutMentions(textOf('app/(admin)/admin/sign-out/route.ts')))).toBe(true)
  })

  it('has at least one guarded address, so the case above is not vacuous', () => {
    // A repository whose every address was declared public would pass the
    // guarding case having checked nothing at all.
    expect(mounted.filter((address) => isGuardedAdminPath(address.url))).not.toHaveLength(0)
  })

  it('declares every public address deliberately rather than by prefix', () => {
    // The other direction: an address that answers to anybody must be one
    // somebody wrote down. This case is what a new sign-in step would fail if
    // it were mounted without being declared — which is the moment to decide
    // whether it should be public at all.
    const publicAddresses = mounted.filter((address) => !isGuardedAdminPath(address.url)).map((one) => one.url)

    expect(publicAddresses.sort((left, right) => left.localeCompare(right))).toEqual([
      '/admin/reset',
      '/admin/reset/[token]',
      '/admin/reset/request',
      '/admin/reset/set',
      '/admin/sign-in',
      '/admin/sign-in/code',
      '/admin/sign-in/code/resend',
      '/admin/sign-in/code/verify',
      '/admin/sign-in/password',
    ])
  })
})

describe('the rule that makes an unguarded Server Action unwritable', () => {
  const eslintConfig = readFileSync(path.join(webRoot, '../../eslint.config.js'), 'utf8')

  it('registers the rule at error, so removing it fails the same gate the guard does', () => {
    // THE ONLY THING THIS FILE STILL SAYS ABOUT SERVER ACTIONS, and it is a
    // question about configuration rather than about syntax — which is what
    // reading text is adequate for. What the rule DOES is asserted where the
    // AST is, by `eslint-rules/guarded-server-actions.test.js`, over the
    // thirty-two invalid shapes that defeated the scans this replaced, or the
    // rule versions that replaced them — a number that file now asserts off
    // its own array rather than spelling in a comment, because this comment
    // said "twelve" through two rounds in which the list grew.
    expect(eslintConfig).toContain("'guarded-server-actions': guardedServerActions")
    expect(eslintConfig).toContain(`'${ACTIONS_RULE}': 'error'`)
  })

  it('reaches every file in the repository that carries the directive, whatever its extension', () => {
    // THE COVERAGE CHECK, INVERTED - RULING F73.
    //
    // The rule keeps the AST, because judging an export is not something text
    // matching can do. But the rule can only judge a file ESLint HANDS it, and
    // the question of which files those are was answered by an extension list
    // nobody had audited: a flat config lints what some block's `files` array
    // names, and no block named `.jsx`. An unguarded `'use server'` module
    // written as `apps/web/app/(admin)/admin/journeys/actions.jsx` therefore
    // passed `eslint .` at exit 0 - naming it directly answered "File ignored
    // because no matching configuration was supplied" - while a running Next.js
    // dev server registered its export as a real action endpoint.
    //
    // So the two halves are put where each is strong. TEXT FINDS THE
    // CANDIDATES, anywhere in the repository and at any extension, because a
    // byte comparison needs no list of where to look. THE AST DECIDES
    // CORRECTNESS, on the files text handed it. This case is the join: every
    // file carrying the literal must be a file ESLint visits with the rule at
    // `error`, asked of ESLint's own API rather than inferred from the config's
    // source text.
    //
    // WHAT THIS DOES NOT CLAIM. It cannot fail before the file exists - a
    // twenty-ninth extension gap is closed on the commit that first writes a
    // module at it, not in advance. The case below narrows that for the
    // extensions Next.js is known to serve; beyond those, this is a check that
    // fires on the commit that would have shipped the hole, which is the commit
    // somebody is reading.
    const carrying = repositoryFiles().filter(carriesTheDirective)

    // THE SENTINEL. A listing that found nothing, or a byte comparison that
    // matched nothing, would satisfy the loop below having read no file at all.
    expect(carrying).toContain('apps/web/lib/auth/guard.ts')
    expect(carrying).toContain('apps/web/app/(payload)/layout.tsx')
    expect(carrying).toContain('eslint-rules/guarded-server-actions.js')

    const asModules = carrying.filter((file) => !DIRECTIVE_IN_PROSE.some((prose) => prose.path === file))
    const severities = configuredSeverities(asModules)
    const unreached = asModules.filter((file) => severities.get(file) !== ERROR_SEVERITY)

    expect(
      unreached,
      'these files carry a "use server" directive and ESLint does not lint them with travel-diary/guarded-server-actions at error: give their extension a config block, or list them in DIRECTIVE_IN_PROSE if they are documentation',
    ).toEqual([])
  })

  it('has the rule at error for every extension Next.js serves, in directories nobody listed', () => {
    // The proactive half, and the replacement for a case that read the config's
    // TEXT POSITIONALLY: it sliced `eslint.config.js` between `plugins: {` and
    // the rules key and asserted no `files:` in the slice, so a `files` key
    // written AFTER the rules key in the same object scoped the rule and the
    // case still passed. Asked of ESLint's own config resolution instead, so
    // where the key sits in the file is not something this case can be wrong
    // about.
    //
    // The paths are HYPOTHETICAL - `calculateConfigForFile` answers for a path
    // that does not exist - so this fails when an extension gap is introduced
    // rather than when somebody first exploits it. The extensions are Next.js's
    // default `pageExtensions` (`tsx, ts, jsx, js`, and
    // `apps/web/next.config.ts` overrides none of them) plus the four module
    // extensions its compiler also accepts. That IS a list, and a list is what
    // the nine defeats taught us not to trust - which is why the case above
    // exists and does not consult one.
    const probes = [
      'apps/web/app/(admin)/admin/journeys/actions.ts',
      'apps/web/app/(admin)/admin/journeys/actions.tsx',
      'apps/web/app/(admin)/admin/journeys/actions.js',
      'apps/web/app/(admin)/admin/journeys/actions.jsx',
      'apps/web/app/(admin)/admin/journeys/actions.mjs',
      'apps/web/app/(admin)/admin/journeys/actions.cjs',
      'apps/web/app/(admin)/admin/journeys/actions.mts',
      'apps/web/app/(admin)/admin/journeys/actions.cts',
      // Directories no `files` array in this repository names, and one of them
      // is where two of the three round-6 defeats were written.
      'apps/web/actions/journeys.ts',
      'apps/web/globals/journeyActions.ts',
      'packages/domain/src/journeyActions.ts',
      'actions.ts',
    ]

    const severities = configuredSeverities(probes)
    const notAtError = probes.filter((probe) => severities.get(probe) !== ERROR_SEVERITY)

    expect(
      notAtError,
      'ESLint would not apply travel-diary/guarded-server-actions at error to these paths: an extension with no config block, or a `files` list the rule now sits inside',
    ).toEqual([])
  })

  it('is switched off for exactly the files somebody wrote down, read off the whole repository', () => {
    // The one thing that defeats the rule is a disable comment, so the set of
    // them is default-deny and enumerated by exact path. The SCAN is not
    // enumerated: it used to walk five directory names inside `apps/web`, in
    // the file whose own header says that being outside a directory list is how
    // five of the nine defeats worked - and it was duly defeated by a disable
    // comment in `apps/web/actions/` and by one in `apps/web/globals/`, both
    // real directories outside the five, as well as by anything outside
    // `apps/web` at all. It now reads git's own listing of the repository.
    //
    // Matched on a line carrying BOTH `eslint-disable` and the rule's id, so a
    // file that merely NAMES the rule - this one, the rule itself, the config -
    // is not counted as disabling it. A document that puts both on ONE line
    // fails this case; that is friction in the safe direction, and the fix is
    // to break the sentence over two lines.
    const disabling = repositoryFiles().filter((file) =>
      bytesOf(file)
        .toString('utf8')
        .split(NEWLINE)
        .some((line) => line.includes('eslint-disable') && line.includes(ACTIONS_RULE)),
    )

    expect(disabling.sort((left, right) => left.localeCompare(right))).toEqual([...ACTIONS_RULE_EXEMPT_FILES])
  })

  it('does not walk the generated directories prettier ignores, so the gate is one anybody can pass', () => {
    // WHY THIS SITS BESIDE THE RULE. `eslint.config.js` excludes generated
    // artefact directories, and its own comment says why: they are
    // `.gitignore`d, so they are invisible in `git status`, but ESLint walks
    // the WORKING TREE — which made `npm run lint`, and therefore the
    // pre-commit gate, pass or fail depending on whether the developer had run
    // `test:e2e` or `test:perf` since the last clean. CLAUDE.md §11: a gate has
    // to be one a developer can always pass honestly.
    //
    // The comment claimed the class was closed and it was not:
    // `.lighthouseci/`, `blob-report/`, `build/` and `.superpowers/` were in
    // `.prettierignore` and not in that array, so `isPathIgnored` answered
    // false for all four while answering true for `lhci-reports/`. None held a
    // linted extension, so nothing was failing — which is why only an
    // executable check finds it. Asked of ESLint's own API rather than read out
    // of the config's source text, and read off `.prettierignore` rather than
    // from a list here, so the next directory added to one file and not the
    // other fails on that commit.
    const probes = generatedDirectoryProbes()

    // THE SENTINEL, first: an empty `.prettierignore`, or a filter that matched
    // no line, would satisfy the assertion below having probed nothing.
    expect(probes.length).toBeGreaterThanOrEqual(10)
    expect(pathsEslintWalks(probes)).toEqual([])
  })

  it('still walks this repository’s own source, so the exclusions above are not a hole', () => {
    // Without this, an `ignores` array of `['**']` would pass the case above.
    expect(pathsEslintWalks(['apps/web/lib/auth/guard.ts', 'eslint-rules/guarded-server-actions.js'])).toEqual([
      'apps/web/lib/auth/guard.ts',
      'eslint-rules/guarded-server-actions.js',
    ])
  })

  it('can tell a file that disables it from one that does not', () => {
    // Without this, a scan that matched nothing would pass the case above by
    // agreeing with an allowlist it never tested against.
    expect(textOf('app/(payload)/layout.tsx')).toContain(`eslint-disable-next-line ${ACTIONS_RULE}`)
    expect(textOf('lib/auth/guard.ts')).not.toContain(`eslint-disable-next-line ${ACTIONS_RULE}`)
  })

  it('resolves the factory to a real file, so a module merely named like it is not it', () => {
    // Round 6's other two defeats, and the reason they are asserted HERE as
    // well as in the rule's own RuleTester suite: both were about a path on
    // disk rather than about a syntax tree. The old check tested the import
    // specifier against a suffix pattern, so a decoy at
    // `apps/web/lib/auth/guardedAction.ts` - a file this repository has never
    // had, meaning the optional group could only ever admit a forgery - and an
    // `auth/guard.ts` written beside the action and imported as `./auth/guard`
    // both satisfied it while calling no guard.
    //
    // What the rule compares now is a resolved path against ONE real file, so
    // that file has to be where the rule looks for it. This case is what fails
    // if `guard.ts` is ever moved or renamed without the rule being told.
    const rule = textOf('../../eslint-rules/guarded-server-actions.js')

    expect(rule).toContain("'../apps/web/lib/auth/guard.ts'")
    expect(rule).not.toContain('FACTORY_MODULE')
    expect(filesUnder('lib/auth')).toContain('lib/auth/guard.ts')
  })

  it('has a factory for actions to be built from, which is what makes the rule satisfiable', () => {
    // A rule nobody can satisfy is a rule Phase 4 turns off. `guardedAction`
    // is the one shape it admits, and it lives beside the guard it calls.
    expect(textOf('lib/auth/guard.ts')).toContain('export const guardedAction =')
    expect(textOf('lib/auth/guard.ts')).toContain('await requireAdminSession()')
  })
})
