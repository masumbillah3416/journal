/**
 * resetPath.test.ts — the two spellings of `/admin/reset` are one path.
 *
 * WHY THERE ARE TWO AT ALL. `apps/web/lib/auth/passwordReset.ts` builds the
 * emailed link from a private `RESET_PATH`; `apps/web/components/admin/
 * PasswordStep.tsx` exports its own for the "Forgotten" link. The first module
 * cannot be the shared source of the second: it is server-only, and importing
 * it into a client component would pull Payload and `node:crypto` into the
 * browser bundle. Unifying them behind one client-safe constant belongs to
 * Task 9, which mounts the route; until then there are two literals that must
 * agree, and until this file existed NOTHING checked that they did (review
 * round 1, finding 6). Two constants that must match with nothing comparing
 * them is a defect waiting for a rename — the reset email would keep pointing
 * at the old path, silently, and the only symptom would be a 404 in somebody
 * else's inbox.
 *
 * WHY IT READS SOURCE TEXT RATHER THAN IMPORTING. Neither import is available
 * to one Vitest project: `PasswordStep.tsx` is a client component with a CSS
 * Module import, which only the `unit-dom` project compiles, and
 * `passwordReset.ts` pulls Payload, which has no business being loaded into
 * jsdom. Reading both files is the one thing a single test CAN do here, and it
 * checks exactly the fact that matters — that the two literals are the same
 * string. Its limitation is stated rather than hidden: it would not notice a
 * path assembled from parts, so both files must keep the literal on one line.
 *
 * THE MATCHES ARE ASSERTED TO EXIST BEFORE THEY ARE COMPARED. Two `undefined`s
 * are equal, and a regex that stopped matching after a refactor would make
 * this file pass while checking nothing — the phase's most common defective
 * test shape.
 * Depends on: node:fs, node:path, node:url, vitest.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** apps/web/lib/auth -> apps/web. */
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * The single-quoted string a file assigns to `RESET_PATH`.
 *
 * @param relativePath - The file to read, relative to `apps/web`.
 * @returns The literal, or `null` when the file has no such assignment.
 */
const resetPathIn = (relativePath: string): string | null => {
  const source = readFileSync(path.join(webRoot, relativePath), 'utf8')
  const match = /RESET_PATH = '([^']*)'/.exec(source)
  return match?.[1] ?? null
}

describe('the reset screen’s path', () => {
  it('is spelled the same way by the email that links to it and the screen that links to it', () => {
    const inTheEmail = resetPathIn('lib/auth/passwordReset.ts')
    const onTheScreen = resetPathIn('components/admin/PasswordStep.tsx')

    // Both found FIRST: two nulls are equal, and comparing them would make
    // this case pass against a file that no longer declares the constant.
    expect(inTheEmail).not.toBeNull()
    expect(onTheScreen).not.toBeNull()
    expect(onTheScreen).toBe(inTheEmail)
  })

  it('is the path phase ruling F41 settled, under /admin rather than beside it', () => {
    // Pinned to the literal, not read back from either file: a case that
    // only compared the two would stay green if both were renamed together
    // to something the session cookie's `Path=/admin` scope cannot reach.
    expect(resetPathIn('lib/auth/passwordReset.ts')).toBe('/admin/reset')
  })
})
