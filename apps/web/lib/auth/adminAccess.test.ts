/**
 * adminAccess.test.ts — which admin addresses answer without a session, which
 * requests are refused as cross-site, and what every admin response carries.
 *
 * Unit test (CLAUDE.md §2): the module under test imports nothing but
 * `./resetPath`, so every case here is a few strings in and a decision out.
 *
 * WHAT EACH BLOCK IS GUARDING AGAINST, rather than what it restates:
 *
 *   - The path block's most important case is the one about an address nobody
 *     listed. A policy written as "these are the guarded paths" admits every
 *     screen Phase 4 forgets to add to it; this one refuses every screen
 *     nobody has declared public, so forgetting fails closed.
 *   - The cross-site block asserts the ABSENT `Origin` is refused as well as
 *     the wrong one. A check written as `origin !== target` treats `null` as a
 *     mismatch by luck rather than by decision, and a later `origin === null ||`
 *     guard added "for robustness" would silently invert it.
 *   - The header block asserts each directive on its own, so deleting one
 *     fails a case named for it rather than one comparison against a string
 *     assembled the same way twice.
 *
 * Depends on: vitest, ./adminAccess.
 */
import { describe, expect, it } from 'vitest'
import { ADMIN_SECURITY_HEADERS, isAdminPath, isCrossSiteMutation, isGuardedAdminPath, isMutation } from './adminAccess'

describe('which addresses this policy speaks for', () => {
  it('speaks for the admin surface itself', () => {
    expect(isAdminPath('/admin')).toBe(true)
    expect(isAdminPath('/admin/sign-in')).toBe(true)
  })

  it('does not speak for a path that merely begins with the same letters', () => {
    expect(isAdminPath('/administrator')).toBe(false)
    expect(isAdminPath('/adminish/thing')).toBe(false)
  })

  it('does not speak for the diary, whose headers must be untouched', () => {
    expect(isAdminPath('/p/1')).toBe(false)
    expect(isAdminPath('/gallery/iceland')).toBe(false)
    expect(isAdminPath('/cms')).toBe(false)
  })
})

describe('which admin addresses answer without a session', () => {
  it('lets a reader who cannot sign in yet reach every step of signing in', () => {
    expect(isGuardedAdminPath('/admin/sign-in')).toBe(false)
    expect(isGuardedAdminPath('/admin/sign-in/password')).toBe(false)
    expect(isGuardedAdminPath('/admin/sign-in/code')).toBe(false)
    expect(isGuardedAdminPath('/admin/sign-in/code/verify')).toBe(false)
  })

  it('lets them reach every step of getting a way back in', () => {
    expect(isGuardedAdminPath('/admin/reset')).toBe(false)
    expect(isGuardedAdminPath('/admin/reset/request')).toBe(false)
    expect(isGuardedAdminPath('/admin/reset/set')).toBe(false)
  })

  it('lets the mailed link itself be opened, whatever token it carries', () => {
    expect(isGuardedAdminPath('/admin/reset/deadbeefdeadbeefdeadbeefdeadbeefdeadbeef')).toBe(false)
  })

  it('guards the signed-in screen, which is the state it claims to be in', () => {
    expect(isGuardedAdminPath('/admin/sign-in/done')).toBe(true)
  })

  it('guards signing out, since revoking a session means naming one', () => {
    expect(isGuardedAdminPath('/admin/sign-out')).toBe(true)
  })

  it('guards the panel itself, which Phase 4 builds', () => {
    expect(isGuardedAdminPath('/admin')).toBe(true)
    expect(isGuardedAdminPath('/admin/journeys')).toBe(true)
  })

  it('guards an address nobody has declared public, so forgetting fails closed', () => {
    // The case that makes this a policy rather than a list. Phase 4 adds ten
    // screens; none of them has to be added here to be guarded.
    expect(isGuardedAdminPath('/admin/a-screen-nobody-wrote-down')).toBe(true)
    expect(isGuardedAdminPath('/admin/sign-in/done/anything-under-it')).toBe(true)
    expect(isGuardedAdminPath('/admin/reset/a/deeper/path')).toBe(true)
  })

  it('guards a public address dressed up with a longer name', () => {
    // `/admin/sign-in/passwordless` is not `/admin/sign-in/password`.
    expect(isGuardedAdminPath('/admin/sign-in/passwordless')).toBe(true)
  })
})

describe('which requests change something', () => {
  it('reads the three methods that only ask as safe', () => {
    expect(isMutation('GET')).toBe(false)
    expect(isMutation('HEAD')).toBe(false)
    expect(isMutation('OPTIONS')).toBe(false)
  })

  it('reads everything else as a mutation, including verbs nothing here mounts', () => {
    expect(isMutation('POST')).toBe(true)
    expect(isMutation('DELETE')).toBe(true)
    expect(isMutation('PATCH')).toBe(true)
    expect(isMutation('BREW')).toBe(true)
  })

  it('reads a lowercase method the same way, since the method is what a client sent', () => {
    expect(isMutation('post')).toBe(true)
    expect(isMutation('get')).toBe(false)
  })
})

describe('which requests are refused as cross-site', () => {
  const OURS = 'https://diary.example'

  it('admits a form posted from our own pages', () => {
    expect(isCrossSiteMutation({ method: 'POST', origin: OURS, target: OURS })).toBe(false)
  })

  it('refuses a post carrying somebody else’s origin', () => {
    expect(isCrossSiteMutation({ method: 'POST', origin: 'https://attacker.example', target: OURS })).toBe(true)
  })

  it('refuses a post carrying no origin at all', () => {
    // Every current browser sends `Origin` on a form POST. A request without
    // one did not come from a browser form, and treating "absent" as "fine" is
    // the single mistake that makes an origin check decorative.
    expect(isCrossSiteMutation({ method: 'POST', origin: null, target: OURS })).toBe(true)
  })

  it('refuses a post from the same host on another scheme or port', () => {
    expect(isCrossSiteMutation({ method: 'POST', origin: 'http://diary.example', target: OURS })).toBe(true)
    expect(isCrossSiteMutation({ method: 'POST', origin: 'https://diary.example:8443', target: OURS })).toBe(true)
  })

  it('lets a GET through however it was reached, since a GET changes nothing', () => {
    expect(isCrossSiteMutation({ method: 'GET', origin: 'https://attacker.example', target: OURS })).toBe(false)
    expect(isCrossSiteMutation({ method: 'GET', origin: null, target: OURS })).toBe(false)
  })
})

describe('what every admin response carries', () => {
  const policy = ADMIN_SECURITY_HEADERS['Content-Security-Policy']

  it('states a content security policy at all', () => {
    // Asserted before anything about its contents: every case below is a
    // substring check, and a substring check against `undefined` is the shape
    // CLAUDE.md §10 names — an assertion about the content of something with
    // no assertion that the something exists.
    expect(policy).toBeTypeOf('string')
    expect(policy).not.toBe('')
  })

  it('falls back to our own origin for anything it does not name', () => {
    expect(policy).toContain("default-src 'self'")
  })

  it('lets no page frame the admin, so a click cannot be stolen from it', () => {
    expect(policy).toContain("frame-ancestors 'none'")
  })

  it('lets no form on an admin page post anywhere but here', () => {
    // The second half of the CSRF defence, and the half a browser enforces
    // before the request is made rather than after it arrives.
    expect(policy).toContain("form-action 'self'")
  })

  it('lets no injected base element rewrite where every relative link goes', () => {
    expect(policy).toContain("base-uri 'none'")
  })

  it('lets no plugin or object element run at all', () => {
    expect(policy).toContain("object-src 'none'")
  })

  it('sends no referrer, so an address holding a reset token never leaves with one', () => {
    expect(ADMIN_SECURITY_HEADERS['Referrer-Policy']).toBe('no-referrer')
  })

  it('lets no browser guess a content type the admin did not declare', () => {
    expect(ADMIN_SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff')
  })

  it('asks no crawler to keep any of it', () => {
    expect(ADMIN_SECURITY_HEADERS['X-Robots-Tag']).toBe('noindex, nofollow')
  })

  it('permits the inline script and the eval React needs, and says so out loud', () => {
    // NOT a rubber stamp: the case exists so that removing either keyword is a
    // deliberate act with a failing test attached, and so that the pair is
    // visible to anybody reading this file rather than buried in a joined
    // string. Both were measured — the policy without `'unsafe-eval'` logged
    // four React errors on every admin page under `next dev`, which
    // `e2e/reset.spec.ts` caught. See the module header for what they cost.
    expect(policy).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
  })

  it('permits neither of them anywhere but in script-src', () => {
    // The bound on the concession above. `default-src` must not carry them, or
    // every directive that falls back to it inherits them.
    expect(policy).toContain("default-src 'self';")
    expect(policy?.match(/'unsafe-eval'/gu)).toHaveLength(1)
  })
})
