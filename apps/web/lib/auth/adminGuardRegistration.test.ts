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
 *   2. the file APPLIES the guard in its own body — `guarded(handler)` for a
 *      route, `requireAdminSession()` for a page. Nothing it imports is read:
 *      see {@link GUARD_APPLICATIONS}.
 *
 * ═══ THIS FILE WAS DECORATIVE ONCE, AND ITS OWN MUTATION CAUGHT IT ═══
 *
 * The first version matched the guard's NAME anywhere in the file's text. So
 * deleting `await requireAdminSession()` from
 * `app/(admin)/admin/sign-in/done/page.tsx` — leaving the `import` line and
 * the header comment that explains the guarding — left every case here GREEN:
 * the screen was unguarded and the check that exists to catch exactly that
 * said nothing. {@link sourceWithoutMentions} strips comments and imports
 * before the scan, {@link GUARD_APPLICATIONS} requires a `(`, and the scan
 * reads the route file ALONE — see that constant for the three rounds it took
 * to get there.
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
 * Every way a mounted file can apply the guard, and the `(` is the point.
 *
 * `guarded(` is the wrapper a route handler is exported through;
 * `requireAdminSession(` is what a Server Component calls;
 * `authenticateAdminRequest(` is the underlying read, allowed here because a
 * route that calls it directly has still made the decision in its own file.
 *
 * ═══ THIS FILE WAS DECORATIVE THREE TIMES, IN THE ONE PLACE THAT MATTERS ═══
 *
 * It is the only thing standing between Phase 4's ten screens of mutations and
 * one of them going out unguarded, and every version of it so far has passed
 * with the guard removed:
 *
 *   1. It matched the guard's NAME anywhere in the file, so the `import` line
 *      and the header comment satisfied it.
 *   2. It stripped those and required a `(` — and followed the route file's
 *      imports one level to credit a one-line `route.ts`, so `guard.ts`'s own
 *      body (which calls `authenticateAdminRequest`) credited every file that
 *      imported it.
 *   3. It stopped following `guard.ts` — and still credited a route for
 *      ANY module it imported, so a guarded route re-exporting any handler
 *      from `signInEndpoints.ts` passed, because that module holds several and
 *      one of them called the guard.
 *
 * The fix is not another exclusion. It is that **the guard is now applied in
 * the route file itself** (`guarded(handleSignOut)`), so this scan reads that
 * one file and follows nothing at all. A check that has to look somewhere else
 * to find its subject is a check that can be satisfied by a neighbour.
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

describe('the admin addresses this repository mounts', () => {
  const mounted = mountedAddresses(ADMIN_ROUTE_DIRECTORY)

  /**
   * Whether a mounted file applies the guard in its own body.
   * @param file - The route file, relative to `apps/web`.
   * @returns `true` when the file itself calls or applies a guard.
   */
  const appliesTheGuard = (file: string): boolean =>
    GUARD_APPLICATIONS.test(sourceWithoutMentions(readFileSync(path.join(webRoot, file), 'utf8')))

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

  it('leaves every guarded address applying the guard in its own file', () => {
    const unguarded = mounted
      .filter((address) => isGuardedAdminPath(address.url))
      .filter((address) => !appliesTheGuard(address.file))

    expect(
      unguarded.map((address) => address.file),
      'these admin addresses are guarded by policy but apply no guard in their own file: declare them in ADMIN_PUBLIC_PATHS, call requireAdminSession, or export guarded(handler)',
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
    expect(appliesTheGuard('app/(admin)/admin/sign-in/password/route.ts')).toBe(false)
    expect(appliesTheGuard('app/(admin)/admin/sign-out/route.ts')).toBe(true)
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
