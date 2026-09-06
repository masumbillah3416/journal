/**
 * adminGuardRegistration.test.ts — every address mounted under `/admin` is
 * either declared public or actually calls the guard.
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
 * ═══ HOW IT DECIDES, AND WHAT IT WILL NOT ACCEPT ═══
 *
 * It reads the filesystem, not a list: every `page.tsx` and `route.ts` under
 * `app/(admin)/admin` is turned back into the address Next.js will serve it
 * at, and each address must satisfy one of two things —
 *
 *   1. `adminAccess.ts` declares it public (`ADMIN_PUBLIC_PATHS`, or the reset
 *      link's own shape), which is a deliberate, reviewable statement that the
 *      address answers to anybody; or
 *   2. the file CALLS the guard — itself, or in the one `lib/auth` module it
 *      re-exports its handler from, which is the shape every route file in
 *      this repository has.
 *
 * ═══ THIS FILE WAS DECORATIVE ONCE, AND ITS OWN MUTATION CAUGHT IT ═══
 *
 * The first version matched the guard's NAME anywhere in the file's text. So
 * deleting `await requireAdminSession()` from
 * `app/(admin)/admin/sign-in/done/page.tsx` — leaving the `import` line and
 * the header comment that explains the guarding — left every case here GREEN:
 * the screen was unguarded and the check that exists to catch exactly that
 * said nothing. {@link sourceWithoutMentions} strips comments and imports
 * before the scan, {@link GUARD_CALLS} requires a `(`, and there is a case
 * below that fails if either of those is undone.
 *
 * THE SENTINELS ARE NOT DECORATION EITHER. A scan that walked the wrong
 * directory, or whose path arithmetic was off by a segment, would find nothing
 * and pass with every screen unguarded. So the first case asserts the walk
 * found the addresses this repository is known to mount, by name, before
 * anything is concluded from it.
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

/** Where the bespoke admin's routes are mounted on disk, relative to `apps/web`. */
const ADMIN_ROUTE_DIRECTORY = 'app/(admin)/admin'

/** The two file names Next.js serves an address from. */
const ROUTE_FILE_NAMES: readonly string[] = ['page.tsx', 'route.ts']

/**
 * The one module this scan must never follow: the guard itself.
 *
 * THE SECOND WAY THIS FILE WAS DECORATIVE. Following a route file's imports is
 * what lets a one-line `route.ts` be credited with the guard its handler calls
 * — but `guard.ts`'s own body calls `authenticateAdminRequest`, so following IT
 * credits every file that merely imports it. That is precisely
 * `sign-in/done/page.tsx`, and deleting its call left this file green a second
 * time, for a second reason. Importing the guard is not calling it.
 */
const GUARD_MODULE = 'lib/auth/guard'

/**
 * Either way the guard can be CALLED. Both are `lib/auth/guard.ts`'s exports,
 * and the trailing `(` is the whole point of the pattern — see this file's
 * header for what a pattern without it was worth.
 */
const GUARD_CALLS = /(requireAdminSession|authenticateAdminRequest)\s*\(/u

/** One mounted address and the file that serves it. */
interface MountedAddress {
  /** The URL Next.js serves it at, e.g. `/admin/sign-in/done`. */
  readonly url: string
  /** The file, relative to `apps/web`. */
  readonly file: string
}

/**
 * Every address mounted under the bespoke admin, read off the filesystem.
 *
 * @param directory - Where to look, relative to `apps/web`.
 * @returns One entry per `page.tsx`/`route.ts`, with the URL it answers at.
 *   Route groups — a directory in parentheses — contribute no segment, exactly
 *   as Next.js treats them; a bracketed segment is left as it is written,
 *   which is what `adminAccess.ts`'s reset-link rule expects to see.
 */
const mountedAddresses = (directory: string): readonly MountedAddress[] =>
  readdirSync(path.join(webRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const child = `${directory}/${entry.name}`
    if (entry.isDirectory()) return mountedAddresses(child)
    if (!ROUTE_FILE_NAMES.includes(entry.name)) return []

    const segments = directory
      .slice('app/'.length)
      .split('/')
      .filter((segment) => !segment.startsWith('('))
    return [{ url: `/${segments.join('/')}`, file: child }]
  })

/**
 * A source file with its comments and its import statements removed.
 *
 * Both are places the guard's NAME appears without the guard being called: a
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
 * The text of a route file and of every `lib/` module it imports, with the
 * mentions stripped from each.
 *
 * ONE LEVEL, WHICH IS THE SHAPE EVERY ROUTE FILE HERE HAS: a route file names
 * its handler and nothing else, and the handler is a `lib/auth` module. A
 * deeper walk would start accepting a guard three modules away from the thing
 * being guarded, which is not a guard anybody reading the route can see.
 *
 * @param file - The route file, relative to `apps/web`.
 * @returns Its own body, followed by the body of each relative import that
 *   resolves inside `apps/web/lib`.
 */
const sourceAndItsHandlers = (file: string): string => {
  const own = readFileSync(path.join(webRoot, file), 'utf8')
  const directory = path.dirname(file)

  // Scanned off the RAW source, deliberately: this is looking for the very
  // import statements `sourceWithoutMentions` strips.
  const imported = [...own.matchAll(/from '(\.[^']+)'/gu)].flatMap((match) => {
    const specifier = match[1]
    if (specifier === undefined) return []

    const resolved = path.normalize(path.join(directory, specifier)).replaceAll('\\', '/')
    if (!resolved.startsWith('lib/') || resolved === GUARD_MODULE) return []
    return [readFileSync(path.join(webRoot, `${resolved}.ts`), 'utf8')]
  })

  return [own, ...imported].map(sourceWithoutMentions).join('\n')
}

describe('the admin addresses this repository mounts', () => {
  const mounted = mountedAddresses(ADMIN_ROUTE_DIRECTORY)

  it('finds the addresses that are known to be mounted, so the scan is not looking at nothing', () => {
    // The sentinel. Every conclusion below is drawn from this list, and a walk
    // that produced an empty one would satisfy them all.
    const urls = mounted.map((address) => address.url)

    expect(urls).toContain('/admin/sign-in')
    expect(urls).toContain('/admin/sign-in/done')
    expect(urls).toContain('/admin/sign-out')
    expect(urls).toContain('/admin/reset/[token]')
  })

  it('finds both kinds of file, so a route handler is not invisible to it', () => {
    // A scan matching only `page.tsx` would see every screen and no endpoint —
    // and the endpoints are the mutations `SECURITY.md` is actually about.
    expect(mounted.map((address) => address.file).filter((file) => file.endsWith('route.ts'))).not.toHaveLength(0)
    expect(mounted.map((address) => address.file).filter((file) => file.endsWith('page.tsx'))).not.toHaveLength(0)
  })

  it('leaves every guarded address actually calling the guard', () => {
    const unguarded = mounted
      .filter((address) => isGuardedAdminPath(address.url))
      .filter((address) => !GUARD_CALLS.test(sourceAndItsHandlers(address.file)))

    expect(
      unguarded.map((address) => address.file),
      'these admin addresses are guarded by policy but call no guard: declare them in ADMIN_PUBLIC_PATHS, or call requireAdminSession / authenticateAdminRequest',
    ).toEqual([])
  })

  it('reads a guard CALL rather than a mention of one, so deleting the call fails the case above', () => {
    // Written after the mutation run for this task deleted
    // `await requireAdminSession()` from the signed-in screen and this file
    // stayed green — the `import` line and the header comment both matched a
    // pattern that looked only for the name. A file that names the guard in an
    // import and in a comment, and calls it nowhere, must NOT satisfy it.
    const namedButNeverCalled = [
      "import { requireAdminSession } from '../../lib/auth/guard'",
      '/** Calls requireAdminSession() before it draws anything. */',
      '// requireAdminSession() belongs here',
      'const Page = () => null',
    ].join('\n')

    expect(GUARD_CALLS.test(sourceWithoutMentions(namedButNeverCalled))).toBe(false)
    expect(GUARD_CALLS.test(sourceWithoutMentions('const account = await requireAdminSession()'))).toBe(true)
  })

  it('does not credit a file for importing the guard, only for calling it', () => {
    // The second reason this file was decorative, and the one the first fix
    // missed: `guard.ts`'s own body calls `authenticateAdminRequest`, so a scan
    // that followed it credited every file that merely imported it. The
    // signed-in screen imports it AND calls it, so the honest way to say this
    // is to read what the follow actually returns: the guard module's body must
    // not be in it.
    const followed = sourceAndItsHandlers('app/(admin)/admin/sign-in/done/page.tsx')

    expect(followed).not.toContain('const sessions = createSessionService(')
    expect(followed).toMatch(GUARD_CALLS)
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
      '/admin/sign-in/code/verify',
      '/admin/sign-in/password',
    ])
  })
})
