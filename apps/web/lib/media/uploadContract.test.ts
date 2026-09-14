/**
 * uploadContract.test.ts — holds `EXPECTED_UPLOAD_REQUEST` against the two
 * artefacts it has to agree with today.
 *
 * ═══ NEITHER CASE IS THE CONSTANT AGREEING WITH ITSELF, AND THAT IS THE
 *     WHOLE REASON THIS FILE EXISTS ═══
 *
 * `uploadContract.ts`'s header used to say that nothing in the Vitest suites
 * COULD kill a wrong `method` or `contentType` — that any in-suite check would
 * be the constant compared with a literal somebody typed beside it. That was
 * false, and a false impossibility claim is how a real check never gets
 * written. Both cases below compare the constant with a value derived from
 * somewhere else entirely:
 *
 *   1. **The route's own mounted method.** Next.js decides which method a
 *      route answers from the NAME of the exported handler, so
 *      `apps/web/app/(admin)/admin/media/upload/route.ts`'s source is an
 *      independent statement of the method the app actually serves. Reading a
 *      route file's text in the `unit` project is established here —
 *      `apps/web/lib/auth/adminGuardRegistration.test.ts` walks the whole
 *      `app/` tree that way.
 *
 *      IT MATCHES EVERY SPELLING THAT IS EQUALLY CORRECT, AND NO MORE.
 *      `export const PUT = …`, `export function PUT(…)` and
 *      `export async function PUT(…)` are the three ways Next.js takes a
 *      handler of this name, and a refactor between them breaks nothing — a
 *      check that failed on one of them would be failing for the wrong reason,
 *      and the temptation at that moment is to loosen it until it stops
 *      biting. A FOURTH form arriving means adding it here, deliberately,
 *      never widening the pattern to something that would also match a comment
 *      or a re-export: what must keep failing is a handler that is absent,
 *      renamed, or exported under a method this constant does not name.
 *   2. **The pipeline's own accepted-type list.** `acceptedIngestTypes`
 *      (`packages/domain/src/media/ingestPolicy.ts`) is derived from the
 *      domain's `STILL_TYPES`, which no part of this contract touches. A
 *      declared type the pipeline would refuse outright is a fixture nobody
 *      could ever upload through.
 *
 * WHAT THESE CASES STILL DO NOT PROVE, because no in-suite check can: that the
 * constant matches what a BROWSER sends. Only a browser settles a measurement,
 * and `e2e/upload.spec.ts` (Task 9) is where it is settled — against the
 * method and headers of the request Chromium actually made, read through
 * `page.waitForRequest`. That distinction is load-bearing rather than
 * pedantic: the first version of that spec read the page's own `File` back and
 * so asserted the same coherence these two do, with a browser in the middle
 * acting as an identity function. These two hold the constant against the
 * route and the pipeline; that one holds it against the wire.
 * Depends on: vitest, node:fs, node:url; `acceptedIngestTypes`
 * (@travel-diary/domain/media/ingestPolicy); the module under test.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { acceptedIngestTypes } from '@travel-diary/domain/media/ingestPolicy'
import { describe, expect, it } from 'vitest'
import { EXPECTED_UPLOAD_REQUEST } from './uploadContract'

/** The route file whose exported handler name IS the method the app serves. */
const UPLOAD_ROUTE = fileURLToPath(new URL('../../app/(admin)/admin/media/upload/route.ts', import.meta.url))

describe('EXPECTED_UPLOAD_REQUEST', () => {
  it('names the HTTP method the upload route actually mounts', () => {
    const source = readFileSync(UPLOAD_ROUTE, 'utf8')

    // Next.js mounts a method by the exported NAME, so this is the app's own
    // statement of what it answers - not a literal restating the constant. The
    // three spellings are the ones Next.js treats identically; see the header
    // for why a fourth gets added rather than the pattern loosened.
    const exported = new RegExp(
      String.raw`export (?:const ${EXPECTED_UPLOAD_REQUEST.method} =|(?:async )?function ${EXPECTED_UPLOAD_REQUEST.method}\()`,
    )

    expect(source).toMatch(exported)
  })

  it('names a content type the configured pipeline would actually accept', () => {
    // `inline` is the mode ADR 0004 ships; `worker` accepts a superset, so a
    // type acceptable here is acceptable in both.
    const accepted: readonly string[] = acceptedIngestTypes('inline')

    expect(accepted).toContain(EXPECTED_UPLOAD_REQUEST.contentType)
  })
})
