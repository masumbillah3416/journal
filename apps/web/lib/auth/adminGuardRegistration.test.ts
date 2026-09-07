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
import { readdirSync, readFileSync } from 'node:fs'
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
const ACTIONS_RULE_EXEMPT_FILES: readonly string[] = ['app/(payload)/layout.tsx']

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
    // twelve shapes that defeated the scans this replaced.
    expect(eslintConfig).toContain("'guarded-server-actions': guardedServerActions")
    expect(eslintConfig).toContain(`'${ACTIONS_RULE}': 'error'`)
  })

  it('applies it to every path, with no `files` list to sit outside of', () => {
    // Five of the nine defeats were a file in a directory the check did not
    // walk. A flat-config block carrying `files` would reintroduce exactly
    // that, so the block that registers this rule must carry none.
    const block = eslintConfig.slice(
      eslintConfig.indexOf('plugins: {'),
      eslintConfig.indexOf(`'${ACTIONS_RULE}': 'error'`),
    )

    expect(block).not.toContain('files:')
  })

  it('is switched off for exactly the files somebody wrote down', () => {
    // The one thing that defeats the rule is a disable comment, so the set of
    // them is default-deny and enumerated. Read off the whole tree rather than
    // off a directory list — being outside a directory list is how five of the
    // nine defeats worked. Matched on a line carrying BOTH `eslint-disable` and
    // the rule's name, so a file that merely NAMES the rule — this one, and the
    // rule's own test — is not counted as disabling it.
    const disabling = ['app', 'components', 'lib', 'collections', 'scripts'].flatMap(filesUnder).filter((file) =>
      textOf(file)
        .split(NEWLINE)
        .some((line) => line.includes('eslint-disable') && line.includes(ACTIONS_RULE)),
    )

    expect(disabling.sort((left, right) => left.localeCompare(right))).toEqual([...ACTIONS_RULE_EXEMPT_FILES])
  })

  it('can tell a file that disables it from one that does not', () => {
    // Without this, a scan that matched nothing would pass the case above by
    // agreeing with an allowlist it never tested against.
    expect(textOf('app/(payload)/layout.tsx')).toContain(`eslint-disable-next-line ${ACTIONS_RULE}`)
    expect(textOf('lib/auth/guard.ts')).not.toContain(`eslint-disable-next-line ${ACTIONS_RULE}`)
  })

  it('has a factory for actions to be built from, which is what makes the rule satisfiable', () => {
    // A rule nobody can satisfy is a rule Phase 4 turns off. `guardedAction`
    // is the one shape it admits, and it lives beside the guard it calls.
    expect(textOf('lib/auth/guard.ts')).toContain('export const guardedAction =')
    expect(textOf('lib/auth/guard.ts')).toContain('await requireAdminSession()')
  })
})
