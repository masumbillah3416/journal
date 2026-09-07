/**
 * resetPath.test.ts — the one spelling of `/admin/reset`, the routes that
 * actually answer at it, and the sibling segments the dynamic route beside
 * them must not swallow.
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
 * source: it holds the constants and nothing else, imports nothing, and is
 * therefore safe on both sides of the boundary. Both modules import it, so
 * there is nothing left to compare.
 *
 * THREE GUARDS REPLACE THAT COMPARISON, and each catches something the old one
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
 *   3. **Nothing this surface addresses under `/admin/reset/` is left to be
 *      read as a token.** Ruling F56: mounting `[token]` directly above
 *      `/admin/reset/request` made `request` a valid token spelling, so
 *      §3.3's own "Send the link" button answered 200 with "That link has
 *      expired" where it had answered 404 the day before. Case 2 could not
 *      see that - a route that exists is exactly what caused it. The cases
 *      below read the addresses this surface actually posts to off its own
 *      source, and the static routes actually mounted beside `[token]` off
 *      the filesystem, and require every one of them to be reserved.
 *
 * NEITHER MODULE MAY DECLARE ITS OWN SPELLING AGAIN, and the last case in the
 * first block says so by reading both files: an `import` is invisible to a
 * source scan looking for an assignment, so a re-introduced literal is
 * exactly what it finds.
 * Depends on: node:fs, node:path, node:url, vitest, ./resetPath.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isReservedResetSegment, RESERVED_RESET_SEGMENTS, RESET_PATH } from './resetPath'

/** apps/web/lib/auth -> apps/web. */
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Where the reset routes are mounted on disk, relative to `apps/web`. */
const routeDirectory = `app/(admin)${RESET_PATH}`

/**
 * Whether a file assigns a `RESET_PATH` string literal of its own.
 *
 * @param relativePath - The file to read, relative to `apps/web`.
 * @returns `true` when the file declares its own spelling of the path.
 */
const declaresItsOwnResetPath = (relativePath: string): boolean =>
  /RESET_PATH = '[^']*'/.test(readFileSync(path.join(webRoot, relativePath), 'utf8'))

/**
 * Every `.ts`/`.tsx` file under a directory, its own tests excluded.
 *
 * @param relativePath - The directory to walk, relative to `apps/web`.
 * @returns Absolute paths of the authored source under it.
 */
const sourceFilesUnder = (relativePath: string): readonly string[] =>
  readdirSync(path.join(webRoot, relativePath), { withFileTypes: true }).flatMap((entry) => {
    const child = `${relativePath}/${entry.name}`
    if (entry.isDirectory()) return sourceFilesUnder(child)
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return []
    return [path.join(webRoot, child)]
  })

/**
 * A source file with its comments blanked out, so a scan over it sees code.
 *
 * THIS EXISTS BECAUSE THE SCAN BELOW SHIPPED WITH A DECORATIVE SENTINEL. The
 * first version matched a quoted address anywhere in the file text and claimed
 * prose was "deliberately not matched". It was not: every TSDoc block in this
 * repository writes an address in BACKTICKS, which the quote class included,
 * and two comments in `newPasswordScreen.ts` name the reset endpoint. So the
 * `toContain` sentinel meant to prove the scan had found the real constant was
 * satisfied by a comment - moving the form's action off `/admin/reset`
 * altogether left the case green. Blanking the comments first is what makes
 * that sentinel load-bearing.
 *
 * TEXT-LEVEL, NOT A PARSE, and the failure direction is why that is enough:
 * block comments go first, then whatever follows a `//` at the start of a line
 * or after whitespace. Every URL this repository writes has its `//` preceded
 * by a colon, so no string loses its tail - and if this ever did remove too
 * much, it could only make the scan find FEWER addresses, which the sentinel
 * turns into a failure rather than a silent pass.
 *
 * @param source - The file's text.
 * @returns The same text with its comments replaced by whitespace.
 */
const withoutComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n')

/**
 * Every path segment this surface names under `/admin/reset/` in a quoted
 * string IN CODE, which is the only shape a real address is written in.
 *
 * Comments are blanked out before the scan, for the reason `withoutComments`
 * gives: `resetPath.ts`'s own `@example` names a token in prose, so a scan
 * over raw text both demands that a token be reserved and lets a comment
 * stand in for the real address.
 *
 * @returns The segments, deduplicated, in no particular order.
 */
const addressedSegments = (): readonly string[] => {
  const quoted = new RegExp(`(['"\`])${RESET_PATH}/([A-Za-z0-9_-]+)\\1`, 'g')
  // AND THE INTERPOLATED SPELLING, WHICH IS NOW THE CANONICAL ONE. Seam S5's
  // fix moved every address on this surface into `./adminPaths.ts`, where the
  // two reset endpoints are built from the constant rather than repeating it.
  // A scan that read only the quoted literal stopped finding them the moment
  // that landed — and said so by failing its own sentinel, which is what this
  // file's `expect(addressed).toContain('request')` line exists for.
  const interpolated = /\$\{RESET_PATH\}\/([A-Za-z0-9_-]+)/gu
  const found = new Set<string>()

  for (const file of [...sourceFilesUnder('components'), ...sourceFilesUnder('lib')]) {
    const source = withoutComments(readFileSync(file, 'utf8'))
    for (const match of source.matchAll(quoted)) {
      const segment = match[2]
      if (segment !== undefined) found.add(segment)
    }
    for (const match of source.matchAll(interpolated)) {
      const segment = match[1]
      if (segment !== undefined) found.add(segment)
    }
  }

  return [...found]
}

describe('the reset screen’s path', () => {
  it('is the path phase ruling F41 settled, under /admin rather than beside it', () => {
    // Pinned to the literal rather than read back off a file: a case that
    // only compared spellings would stay green if every one of them were
    // renamed together to something `Path=/admin` cannot reach.
    expect(RESET_PATH).toBe('/admin/reset')
  })

  it('has a route mounted at it, so the "Forgotten" link is not a 404', () => {
    expect(existsSync(path.join(webRoot, `${routeDirectory}/page.tsx`))).toBe(true)
  })

  it('has a route mounted at its token child, so the emailed link is not a 404', () => {
    // The gap ruling F47 exists to close: the token was minted, mailed and
    // consumable, and the address it named answered 404.
    expect(existsSync(path.join(webRoot, `${routeDirectory}/[token]/page.tsx`))).toBe(true)
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

describe('the segments the [token] route may not swallow', () => {
  it('reserves every address this surface posts to under /admin/reset/', () => {
    const addressed = addressedSegments()

    // The scan is asserted to have FOUND the segment ruling F56 is about, not
    // merely to have produced no unreserved ones: a scan that matched nothing
    // at all would otherwise pass this case with the defect present. This
    // sentinel was itself decorative in the first fix round - it was satisfied
    // by the endpoint's name in a COMMENT, so moving the form's action off
    // `/admin/reset` entirely left it green. `withoutComments` is what makes
    // it real, and moving the action is how it was watched to fail.
    expect(addressed).toContain('request')
    expect(addressed.filter((segment) => !isReservedResetSegment(segment))).toEqual([])
  })

  it('reserves every static route actually mounted beside [token]', () => {
    // Next.js resolves a static segment before a dynamic one, so these do not
    // reach `[token]` today. They are reserved anyway, because what protects
    // them is a framework precedence rule rather than anything this
    // repository states - and because a route that MOVES (to a parent
    // handler, to middleware) stops being protected by it silently.
    const mounted = readdirSync(path.join(webRoot, routeDirectory), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('['))
      .map((entry) => entry.name)

    expect(mounted).not.toHaveLength(0)
    expect(mounted.filter((segment) => !isReservedResetSegment(segment))).toEqual([])
  })

  it('reserves no word a token Payload minted could be spelled as', () => {
    // Payload mints reset tokens as hexadecimal, so reserving a word that is
    // not hexadecimal costs no reader their link. A reserved `deadbeef` would.
    expect(RESERVED_RESET_SEGMENTS).not.toHaveLength(0)
    expect(RESERVED_RESET_SEGMENTS.filter((segment) => /^[0-9a-f]+$/i.test(segment))).toEqual([])
  })

  it('reads a token that merely resembles a reserved word as a token', () => {
    // The reservation is exact, never a prefix and never a shape: a link
    // whose token happened to begin "request" is still a link.
    expect(isReservedResetSegment('request')).toBe(true)
    expect(isReservedResetSegment('requests')).toBe(false)
    expect(isReservedResetSegment('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef')).toBe(false)
  })

  it('mounts the token route as a directory, so its siblings are one listing', () => {
    // The case above reads that directory; a `[token]` laid out some other
    // way would make it read a listing that is not the token route's, and
    // pass while seeing nothing.
    expect(statSync(path.join(webRoot, `${routeDirectory}/[token]`)).isDirectory()).toBe(true)
  })
})
