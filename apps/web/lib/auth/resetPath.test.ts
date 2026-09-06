/**
 * resetPath.test.ts — the one spelling of `/admin/reset`, and the routes that
 * actually answer at it.
 *
 * ═══ WHAT THIS FILE USED TO DO, AND WHY IT NO LONGER DOES IT ═══
 *
 * Until Task 9 there were TWO literals: `apps/web/lib/auth/passwordReset.ts`
 * built the emailed link from a private `RESET_PATH`, and
 * `apps/web/components/admin/PasswordStep.tsx` exported its own for the
 * "Forgotten" link. The first could not be the shared source of the second -
 * it is server-only, and importing it into a client component would pull
 * Payload and `node:crypto` into the browser bundle - so this file compared
 * the two by reading their source text. `./resetPath.ts` is now that shared
 * source: it holds the constant and nothing else, imports nothing, and is
 * therefore safe on both sides of the boundary. Both modules import it, so
 * there is nothing left to compare.
 *
 * TWO GUARDS REPLACE THAT COMPARISON, and each catches something the old one
 * could not:
 *
 *   1. The path is still pinned to the literal `/admin/reset` - phase ruling
 *      F41's path, under `/admin` rather than beside it, which is what the
 *      session cookie's `Path=/admin` scope can reach. A test that only
 *      compared two spellings stayed green when both were renamed together.
 *   2. **A route file actually exists at that path, and at its `[token]`
 *      child.** This is the defect the constant existed to prevent and did
 *      not: for the whole of Tasks 5 to 8 the reset email carried a working
 *      token to an address that answered 404, with every mechanism behind it
 *      green. A constant that agrees with itself proves nothing about whether
 *      anything is mounted there.
 *
 * NEITHER MODULE MAY DECLARE ITS OWN SPELLING AGAIN, and the third case says
 * so by reading both files: an `import` is invisible to a source scan looking
 * for an assignment, so a re-introduced literal is exactly what it finds.
 * Depends on: node:fs, node:path, node:url, vitest, ./resetPath.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RESET_PATH } from './resetPath'

/** apps/web/lib/auth -> apps/web. */
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * Whether a file assigns a `RESET_PATH` string literal of its own.
 *
 * @param relativePath - The file to read, relative to `apps/web`.
 * @returns `true` when the file declares its own spelling of the path.
 */
const declaresItsOwnResetPath = (relativePath: string): boolean =>
  /RESET_PATH = '[^']*'/.test(readFileSync(path.join(webRoot, relativePath), 'utf8'))

describe('the reset screen’s path', () => {
  it('is the path phase ruling F41 settled, under /admin rather than beside it', () => {
    // Pinned to the literal rather than read back off a file: a case that
    // only compared spellings would stay green if every one of them were
    // renamed together to something `Path=/admin` cannot reach.
    expect(RESET_PATH).toBe('/admin/reset')
  })

  it('has a route mounted at it, so the "Forgotten" link is not a 404', () => {
    expect(existsSync(path.join(webRoot, `app/(admin)${RESET_PATH}/page.tsx`))).toBe(true)
  })

  it('has a route mounted at its token child, so the emailed link is not a 404', () => {
    // The gap ruling F47 exists to close: the token was minted, mailed and
    // consumable, and the address it named answered 404.
    expect(existsSync(path.join(webRoot, `app/(admin)${RESET_PATH}/[token]/page.tsx`))).toBe(true)
  })

  it('is spelled in one module, not re-declared by the email or by the screen', () => {
    // Both files are asserted to have been READ, not merely to lack a match:
    // a path typo would make `declaresItsOwnResetPath` throw rather than
    // return `false`, which is the failure this pair is meant to produce.
    expect(declaresItsOwnResetPath('lib/auth/resetPath.ts')).toBe(true)
    expect(declaresItsOwnResetPath('lib/auth/passwordReset.ts')).toBe(false)
    expect(declaresItsOwnResetPath('components/admin/PasswordStep.tsx')).toBe(false)
  })
})
