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
 *   **C · A Server Action is an endpoint, wherever it lives.** Every module in
 *   `apps/web` whose first statement is `'use server'` is a set of `POST`
 *   endpoints Next.js mounts under an opaque action id. Each of its exports
 *   must apply the guard, or the module must be declared in
 *   {@link PUBLIC_SERVER_ACTION_MODULES} — default-deny, the same way
 *   `ADMIN_PUBLIC_PATHS` is. It is not scoped to `app/`, because an action
 *   module is reachable from wherever it is imported.
 *
 *   **D · An inline `'use server'` in a scanned file is refused outright.** An
 *   action defined inside a page body is dispatched BEFORE that page renders,
 *   so the page's own `requireAdminSession()` does not gate it —
 *   `SECURITY.md`'s "nothing inherits trust from the page it was reached from",
 *   exactly. No text-level check could tell such an action's guard from the
 *   page's, so the shape is refused rather than analysed: put the action in a
 *   module where rule C can see every export.
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

/** Where a Server Action can live: anywhere this app's own code does. */
const SERVER_ACTION_ROOTS: readonly string[] = ['app', 'components', 'lib']

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
 * Modules that may declare `'use server'` without guarding their exports.
 *
 * EMPTY, AND DEFAULT-DENY. `ADMIN_PUBLIC_PATHS` is written the same way round
 * and for the same reason: a list of what is exempt is reviewable, while a
 * list of what is covered is a list somebody forgets to add to. A public
 * Server Action — one the diary needs, say — goes here, by exact path, with
 * the reason it answers to anybody.
 */
const PUBLIC_SERVER_ACTION_MODULES: readonly string[] = []

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

/** A `'use server'` directive, in either quote style. */
const USE_SERVER = /(['"])use server\1/u

/** A top-level export that a `'use server'` module turns into an endpoint. */
const EXPORTED_BINDING = /^export\s+(?:const|(?:async\s+)?function)\s+(\w+)/gmu

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
 * Whether a module declares `'use server'` as its FIRST statement, which is
 * what makes every one of its exports an endpoint.
 *
 * @param source - The file's text, comments and imports already stripped.
 * @returns `true` for a Server Action module.
 */
const isServerActionModule = (source: string): boolean => USE_SERVER.test(source.trimStart().split('\n')[0] ?? '')

/**
 * Whether a file hides a `'use server'` directive somewhere other than its
 * first statement — an action defined inside a page or a component.
 *
 * @param source - The file's text, comments and imports already stripped.
 * @returns `true` when the shape rule D refuses is present.
 */
const hasInlineServerAction = (source: string): boolean => USE_SERVER.test(source) && !isServerActionModule(source)

/**
 * Whether a file applies the guard in its own body.
 * @param source - The file's text, comments and imports already stripped.
 * @returns `true` when the file itself calls or applies a guard.
 */
const appliesTheGuard = (source: string): boolean => GUARD_APPLICATIONS.test(source)

/**
 * The exports of a Server Action module that do not apply the guard.
 *
 * Each export is a separate `POST` endpoint, so the question is per export
 * rather than per file: a module holding one guarded action and one unguarded
 * one is a module with an unguarded endpoint in it. The source is split at
 * export boundaries and each segment — one export's own body — must contain a
 * guard application.
 *
 * @param source - The module's text, comments and imports already stripped.
 * @returns The names of the exports with no guard between them and the next.
 */
const unguardedExportsIn = (source: string): readonly string[] => {
  const boundaries = [...source.matchAll(EXPORTED_BINDING)]
  return boundaries
    .filter((match, position) => {
      const from = match.index
      const next = boundaries[position + 1]?.index ?? source.length
      return !appliesTheGuard(source.slice(from, next))
    })
    .map((match) => match[1] ?? '')
}

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
      return !isServerActionModule(sourceWithoutMentions(textOf(file)))
    })

    expect(
      unaccounted,
      'these files sit under an /admin address and this scan cannot say whether they answer a request: classify them in ROUTE_FILE_NAMES, NON_SERVABLE_FILES, or make them a guarded Server Action module',
    ).toEqual([])
  })

  it('mounts no Server Action inside a page or a route file', () => {
    // RULE D. A Server Action defined inside a scanned file is a separate
    // `POST` endpoint dispatched BEFORE the page renders, so the page body's
    // own `requireAdminSession()` does not gate it — `SECURITY.md`'s "nothing
    // inherits trust from the page it was reached from". No text-level check
    // can tell such an action's guard from the page's, so the shape is refused
    // rather than analysed.
    const inline = underAnAdminAddress.filter((file) => hasInlineServerAction(sourceWithoutMentions(textOf(file))))

    expect(
      inline,
      "these files define a Server Action inline: an action is dispatched before the page renders, so a guard in the page body does not gate it — move it to a module whose first statement is 'use server', where every export is checked",
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

describe('the Server Actions this repository mounts', () => {
  const actionModules = SERVER_ACTION_ROOTS.flatMap(filesUnder)
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
    .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
    .filter((file) => isServerActionModule(sourceWithoutMentions(textOf(file))))

  it('guards every export of every Server Action module', () => {
    // RULE C. Next.js mounts each export of a `'use server'` module as its own
    // `POST` endpoint under an opaque action id, reachable by anybody who has
    // the id — the middleware does not close it, because it enforces CSRF and
    // never authentication, so a request carrying a matching `Origin` reaches
    // the action unauthenticated. The check is per EXPORT rather than per file:
    // a module holding one guarded action and one unguarded one is a module
    // with an unguarded endpoint in it.
    const unguarded = actionModules
      .filter((file) => !PUBLIC_SERVER_ACTION_MODULES.includes(file))
      .flatMap((file) => unguardedExportsIn(sourceWithoutMentions(textOf(file))).map((name) => `${file}#${name}`))

    expect(
      unguarded,
      'these Server Action exports apply no guard: a Server Action is a POST endpoint of its own, so call requireAdminSession() inside each one, or declare the module in PUBLIC_SERVER_ACTION_MODULES',
    ).toEqual([])
  })

  it('recognises a Server Action module, and only by its first statement', () => {
    // THE SENTINEL FOR RULE C. `actionModules` is empty today — Phase 4 writes
    // the first one — so without this the case above passes having checked
    // nothing, which is exactly the shape that made four earlier versions of
    // this file decorative. These drive the same predicates the walk does.
    expect(isServerActionModule(sourceWithoutMentions("'use server'\nexport const save = async () => {}"))).toBe(true)
    expect(isServerActionModule(sourceWithoutMentions('"use server"\nexport const save = async () => {}'))).toBe(true)
    expect(isServerActionModule(sourceWithoutMentions('export const save = async () => {}'))).toBe(false)
    // A directive that is not the first statement does not make the MODULE an
    // action module — it makes the function one, which rule D refuses.
    expect(isServerActionModule(sourceWithoutMentions('const x = 1\n"use server"'))).toBe(false)
  })

  it('finds an unguarded export inside a module whose other export is guarded', () => {
    // THE SECOND SENTINEL, and the one that says the check is per export. A
    // per-FILE check passes the module below, because one of its two exports
    // calls the guard.
    const mixed = [
      "'use server'",
      'export const publish = async () => {',
      '  await requireAdminSession()',
      '}',
      'export const unpublish = async () => {',
      '  await payload.update({})',
      '}',
    ].join('\n')

    expect(unguardedExportsIn(sourceWithoutMentions(mixed))).toEqual(['unpublish'])
  })

  it('sees a Server Action defined inside a page, which a page-body guard does not gate', () => {
    // THE SENTINEL FOR RULE D, on a fabricated page of exactly the shape the
    // review describes: the page component calls the guard, and the action
    // beside it is dispatched before that component ever runs.
    const pageWithAnInlineAction = [
      'const save = async () => {',
      "  'use server'",
      '  await payload.update({})',
      '}',
      'const Page = async () => {',
      '  await requireAdminSession()',
      '  return <form action={save} />',
      '}',
    ].join('\n')

    expect(appliesTheGuard(sourceWithoutMentions(pageWithAnInlineAction))).toBe(true)
    expect(hasInlineServerAction(sourceWithoutMentions(pageWithAnInlineAction))).toBe(true)
  })

  it('declares every exempt action module deliberately rather than by prefix', () => {
    // Default-deny, the same way `ADMIN_PUBLIC_PATHS` is: an action that
    // answers to anybody is one somebody wrote down. Empty today, and the case
    // exists so that a future entry has to be a deliberate edit here.
    expect(PUBLIC_SERVER_ACTION_MODULES).toEqual([])
  })
})
