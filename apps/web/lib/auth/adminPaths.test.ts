/**
 * adminPaths.test.ts — every address this surface's forms and redirects name
 * is an address Next.js actually serves.
 *
 * ═══ THE DIRECTION `adminGuardRegistration.test.ts` CANNOT CHECK ═══
 *
 * That file walks from the ROUTES to the policy: everything mounted under
 * `/admin` must be declared public or apply the guard. It says nothing about a
 * constant that names an address nothing is mounted at — and that is the
 * failure Phase 2 actually shipped. `SignedInStep.tsx`'s primary action pointed
 * at `/admin`, no route existed there, and a completed sign-in ended at a 404
 * that no suite in this repository could see (blocker B2).
 *
 * It is worse than a 404 for the addresses a form POSTS to. `isGuardedAdminPath`
 * is default-deny, so a component constant that drifts from `ADMIN_PUBLIC_PATHS`
 * does not error: the middleware treats the path as guarded and redirects the
 * reader to sign-in, silently (seam S5).
 *
 * So this file walks the other way, from the constants back to the filesystem.
 * Together with `adminGuardRegistration.test.ts` the two directions close the
 * loop: nothing is mounted that policy has not seen, and nothing is named that
 * is not mounted.
 *
 * Depends on: node:fs, node:path, node:url, vitest, ./adminAccess, ./adminPaths,
 * ./resetPath.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ADMIN_PUBLIC_PATHS, isGuardedAdminPath } from './adminAccess'
import { ADMIN_PANEL_PATH, ADMIN_SURFACE_PATHS, SIGNED_IN_PATH } from './adminPaths'
import { RESET_PATH } from './resetPath'

/** apps/web/lib/auth -> apps/web. */
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** The route group every address on this surface is mounted inside. */
const ADMIN_GROUP = 'app/(admin)'

/** The two file names Next.js serves an address from, in this repository. */
const ROUTE_FILES: readonly string[] = ['page.tsx', 'route.ts']

/**
 * Whether Next.js serves something at an address.
 *
 * @param address - The URL, e.g. `/admin/sign-in/code`.
 * @returns `true` when a `page.tsx` or `route.ts` sits at the matching
 *   directory inside the admin route group.
 * @example
 * isMounted('/admin/sign-in') // true
 */
const isMounted = (address: string): boolean =>
  ROUTE_FILES.some((file) => existsSync(path.join(webRoot, ADMIN_GROUP, address, file)))

describe('the addresses this surface names', () => {
  it('lists every one of them, so the sweep below is not looking at a short list', () => {
    // The sentinel. A list that had lost its entries would satisfy every case
    // here, which is exactly how a scan becomes decorative.
    expect(ADMIN_SURFACE_PATHS).toContain(ADMIN_PANEL_PATH)
    expect(ADMIN_SURFACE_PATHS).toContain(SIGNED_IN_PATH)
    expect(ADMIN_SURFACE_PATHS).toContain(`${RESET_PATH}/set`)
    expect(ADMIN_SURFACE_PATHS.length).toBeGreaterThanOrEqual(11)
  })

  it('mounts a route at every one of them', () => {
    // THE CASE THIS FILE EXISTS FOR. `/admin` was on this list in spirit —
    // `SignedInStep.tsx` sent readers there — and nothing served it.
    const missing = ADMIN_SURFACE_PATHS.filter((address) => !isMounted(address))

    expect(
      missing,
      'these addresses are named by a form action, a link or a redirect and nothing is mounted at them',
    ).toEqual([])
  })

  it('can tell an address that is not mounted from one that is', () => {
    // Without this, `isMounted` returning `true` for everything would make the
    // case above pass having checked nothing.
    expect(isMounted('/admin/sign-in')).toBe(true)
    expect(isMounted('/admin/nothing-is-here')).toBe(false)
  })

  it('declares each public one in the allowlist the middleware actually reads', () => {
    // The default-deny half. Every address a reader with NO session has to
    // reach must be in `ADMIN_PUBLIC_PATHS`; drift here is a silent redirect
    // rather than an error, which is why it is asserted rather than assumed.
    const publicOnes = ADMIN_SURFACE_PATHS.filter((address) => !isGuardedAdminPath(address))

    expect(publicOnes.sort((left, right) => left.localeCompare(right))).toEqual(
      [...ADMIN_PUBLIC_PATHS].sort((left, right) => left.localeCompare(right)),
    )
  })

  it('guards the two addresses that claim the reader is already signed in', () => {
    // The other side of the same coin, named rather than inferred: if every
    // address on this surface were public the case above would still pass.
    expect(isGuardedAdminPath(ADMIN_PANEL_PATH)).toBe(true)
    expect(isGuardedAdminPath(SIGNED_IN_PATH)).toBe(true)
  })
})
