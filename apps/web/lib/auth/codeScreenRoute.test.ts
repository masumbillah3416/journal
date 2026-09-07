/**
 * codeScreenRoute.test.ts — `/admin/sign-in/code` is rendered per request, not
 * at build time.
 *
 * ═══ THE DEFECT THIS PINS, AND WHY NOTHING ELSE COULD SEE IT ═══
 *
 * The route rendered `○ (Static)` in a production build. Its countdown's
 * origin was `Date.now()`, evaluated ONCE while the build ran — so every
 * reader was shown the same instant, and five minutes after any deploy the
 * screen said `0:00` to everybody. It is invisible in development, where Next
 * re-renders every request, so three passes over that file and a green browser
 * suite all missed it.
 *
 * ═══ WHAT THIS CASE PROVES, AND WHAT IT DOES NOT ═══
 *
 * It reads the route file and requires the declaration that forces dynamic
 * rendering. That is a source-text check, and it is worth being exact about
 * its limits: it proves the declaration is there, not that Next honoured it.
 * What proves the second is a production build — `npm run build` prints
 * `ƒ (Dynamic)` beside this route — and the browser suites that run against
 * one (CI's `browser` job, and the visual container, both `CI=1`).
 *
 * It is here rather than nowhere because the alternative was nothing at all:
 * a page component cannot be executed by either Vitest project, and a timing
 * assertion in a browser would be flaky in exactly the environment where the
 * defect does not occur.
 *
 * THE SECOND CASE IS THE ONE THAT MATTERS MORE. `readCodeScreen` reads
 * `cookies()`, which forces dynamic rendering whether or not the declaration
 * is present — so the route is pinned by two independent things, and this
 * asserts the second is still true.
 *
 * Depends on: node:fs, node:path, node:url, vitest.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** apps/web/lib/auth -> apps/web. */
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** The route whose rendering mode this file is about. */
const CODE_ROUTE = 'app/(admin)/admin/sign-in/code/page.tsx'

/** Its source, read once. */
const source = readFileSync(path.join(webRoot, CODE_ROUTE), 'utf8')

/**
 * A source with its comments blanked out.
 *
 * ═══ THIS FILE WAS DECORATIVE ON ITS FIRST RUN, AND ITS OWN MUTATION SAID SO
 * ═══
 *
 * The cases below scan for `export const dynamic = 'force-dynamic'`. That
 * route's own header explains the declaration and QUOTES it, so replacing the
 * real one with `export const revalidate = 60` left the string in the file and
 * every case green — the route was statically rendered again and the check that
 * exists for exactly that said nothing. The same shape as
 * `adminGuardRegistration.test.ts`'s three rounds, in a file written to avoid
 * it.
 *
 * Text-level rather than a parse, and the failure direction is why that is
 * enough: it can only remove too much, which makes a case fail rather than
 * silently pass. The `[^:]` guard keeps a URL's own `//` intact, so a comment
 * scan cannot swallow the rest of a line that merely contains one.
 *
 * A PARAMETER RATHER THAN A CLOSURE OVER `source`, so the case that guards it
 * can hand it text of its own instead of pinning a sentence of the route's
 * prose — see that case for why the first version of it was the wrong shape.
 *
 * @param text - Any source text.
 * @returns The same text with its comments blanked.
 */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/(^|[^:])\/\/.*$/gmu, '$1')

/** The route's source, with its comments gone. */
const code = stripComments(source)

describe('the one-time-code route’s rendering mode', () => {
  it('is the file this repository actually mounts, not a path that no longer exists', () => {
    // The sentinel: `readFileSync` throws for a moved file, so this case fails
    // loudly rather than the ones below passing over an empty string.
    expect(code).toContain('const CodeStepPage')
  })

  it('reads code rather than prose, so a declaration quoted in a comment is not one', () => {
    // The mutation for the case below survived without this: that route's
    // header QUOTES the declaration it explains, so a scan over raw text was
    // satisfied by the comment.
    //
    // ASSERTED AGAINST TEXT OF ITS OWN, NOT AGAINST THE ROUTE'S WORDING. The
    // first version pinned an exact prose sentence out of that header, so a
    // documentation reword broke the suite — and it was the fifth assertion of
    // that shape in this phase, written into the file that exists because of
    // the fourth. What has to hold is a property of the STRIPPER, and a
    // stripper can simply be shown some text.
    const quoted = [
      "/** `export const dynamic = 'force-dynamic'` is what does it. */",
      "// export const dynamic = 'force-dynamic' would go here",
      'const page = null',
    ].join('\n')

    expect(stripComments(quoted)).not.toContain('force-dynamic')
    expect(stripComments("export const dynamic = 'force-dynamic'")).toContain('force-dynamic')
  })

  it('declares itself dynamic, so the countdown is not the build’s own clock', () => {
    expect(code).toContain("export const dynamic = 'force-dynamic'")
  })

  it('reads the request’s cookies, which forces the same thing independently', () => {
    // `readCodeScreen` is what reads them. Two mechanisms hold this route
    // dynamic, and deleting either alone leaves the other — which is the
    // point, because the declaration is the half a reader of the file can see
    // and the cookie read is the half Next enforces.
    expect(code).toContain('readCodeScreen(')
  })
})
