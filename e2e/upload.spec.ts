/**
 * upload.spec.ts — what a REAL browser sends when it PUTs an upload, and what
 * the receiver answers when nobody is signed in.
 *
 * ═══ WHY THIS FILE EXISTS AT ALL: THE ONLY HONEST CHECK ON A MEASUREMENT IS
 *     ANOTHER MEASUREMENT ═══
 *
 * `apps/web/lib/media/uploadContract.ts`'s `EXPECTED_UPLOAD_REQUEST` is a
 * MEASUREMENT of Chromium — a typed `File` sends `PUT`, its own `type` as
 * `Content-Type`, and a `Content-Length` the page cannot set. The integration
 * fixture `aPutRequest` builds its method and type FROM that constant, so the
 * whole integration suite exercises whatever shape the constant names. If the
 * constant ever stops matching what a browser does, nothing in Vitest can
 * notice: the fixture and the assertion agree with each other by construction.
 * That is exactly how two Phase 2 blockers passed sixteen hundred tests.
 *
 * So the first case below asserts a real Chromium's own PUT against the
 * constant. It is the drift detector, and it is the reason this file is not
 * three unit tests.
 *
 * WHAT THE CONSTANT CARRIES AND WHAT IT DOES NOT. The shape, not a length:
 * the body's size is the caller's, and pinning one in the constant would make
 * the round-trip fixture — which sends a whole photograph — contradict the
 * constant it is built from. The length is asserted against the `File` the
 * page actually built, which is the only thing that can honestly say what it
 * was.
 *
 * ═══ THE SECOND CASE IS ABOUT AUTHORISATION, NOT ABOUT SHAPE ═══
 *
 * The token in the URL is a capability over ONE KEY. It is not
 * authentication, and an upload is a mutation by the author, so the route
 * carries `guarded` in its own file. The second case is what proves the guard
 * is what answers: the same genuine URL, from a browser with no session, and
 * nothing lands at the key.
 *
 * IT ASSERTS THE STORE, NOT ONLY THE STATUS. `fetch` follows redirects by
 * default, so a signed-out PUT answered `303 -> /admin/sign-in` arrives at the
 * page as a 200 for the sign-in screen — a status list would have had to
 * accommodate that and would have stopped meaning anything. `redirect:
 * 'manual'` is what a browser reports the redirect itself under, and the
 * substantive claim — that no bytes were written — is answered by the store.
 *
 * ═══ NEITHER CASE UPLOADS A PHOTOGRAPH ═══
 *
 * There is no admin picker to drive yet (Phase 4), so the bytes are a filled
 * `Uint8Array` inside a `File`. What is under test here is the REQUEST a
 * browser makes and the guard that answers it; what happens to real
 * photograph bytes afterwards is
 * `apps/web/lib/media/roundTrip.integration.test.ts`'s, against a real
 * Postgres and a real store.
 *
 * Depends on: @playwright/test; `aSignedInSession`, `fixtureLabel`,
 * `anUploadUrlFor`, `storedUploadLength`, `removeOfferedUpload` and
 * `removeSignedInFixture` (./support/adminSession);
 * `EXPECTED_UPLOAD_REQUEST` (apps/web/lib/media/uploadContract).
 */
import { expect, test } from '@playwright/test'
import { EXPECTED_UPLOAD_REQUEST } from '../apps/web/lib/media/uploadContract'
import {
  SESSION_FIXTURE_DOMAIN,
  aSignedInSession,
  anUploadUrlFor,
  fixtureLabel,
  removeOfferedUpload,
  removeSignedInFixture,
  storedUploadLength,
} from './support/adminSession'

test.afterAll(async ({}, testInfo) => {
  // Per worker, and only this worker's own account — see `fixtureLabel` for
  // the flake that came of sharing one.
  await removeSignedInFixture(`upload.${fixtureLabel(testInfo)}@${SESSION_FIXTURE_DOMAIN}`)
})

test('a real browser PUT reaches the receiver and the bytes land', async ({ page, context, baseURL }, testInfo) => {
  const session = await aSignedInSession(`upload.${fixtureLabel(testInfo)}`)
  await context.addCookies([{ name: 'td-session', value: session, url: `${baseURL ?? ''}/admin` }])
  const upload = await anUploadUrlFor(testInfo)
  // The fetch has to leave a page on the app's own origin: Chromium sends
  // `Origin` from the document making the request, and `isCrossSiteMutation`
  // compares it against `ADMIN_ORIGIN`.
  await page.goto('/admin')

  const observed = await page.evaluate(
    async (offered: { readonly url: string; readonly contentType: string; readonly byteLength: number }) => {
      // A File built in the page, PUT by the page's own fetch: a real
      // Content-Length, a real Content-Type off the File, and the browser's
      // own body handling - none of which a Node-built Request exercises.
      const body = new File([new Uint8Array(offered.byteLength).fill(7)], 'tokyo.jpg', { type: offered.contentType })
      const response = await fetch(offered.url, { method: 'PUT', body })
      return {
        method: 'PUT',
        status: response.status,
        contentType: body.type,
        byteLength: body.size,
      }
    },
    upload,
  )

  expect(observed.status).toBe(204)
  // THE FIXTURE-SHAPE PROOF. `EXPECTED_UPLOAD_REQUEST` is the single constant
  // the integration fixture `aPutRequest` builds its method and Content-Type
  // from, so if the shape the integration suite exercises ever stops matching
  // what a browser actually sends, THIS fails - not a unit test that would
  // happily agree with itself. Two Phase 2 blockers passed 1,600 tests behind
  // fixtures sending a request shape no browser produces; this is the check
  // that would have caught them.
  expect({ method: observed.method, contentType: observed.contentType }).toEqual(EXPECTED_UPLOAD_REQUEST)
  // The length is asserted against the File the page actually built, which is
  // the only thing that can honestly say what it was - and then against the
  // store, which is the only thing that can say the bytes arrived.
  expect(observed.byteLength).toBe(upload.byteLength)
  expect(await storedUploadLength(upload.stagingKey)).toBe(upload.byteLength)

  await removeOfferedUpload(upload.stagingKey)
})

test('the receiver refuses the same PUT with no session, so an upload URL is not a bypass', async ({
  page,
  baseURL,
}, testInfo) => {
  // The token is a capability over one KEY; it is not authentication. The
  // route is guarded, and this is what proves the guard is what answers. No
  // cookie is added: `baseURL` is read only to keep the page on the origin
  // the fetch has to come from.
  expect(baseURL).toBeDefined()
  const upload = await anUploadUrlFor(testInfo)
  await page.goto('/admin/sign-in')

  const observed = await page.evaluate(async (url: string) => {
    // `redirect: 'manual'` because the guard answers `303 -> /admin/sign-in`,
    // and a followed redirect would arrive here as the sign-in screen's 200.
    const response = await fetch(url, { method: 'PUT', body: new Blob([new Uint8Array(4)]), redirect: 'manual' })
    return { status: response.status, type: response.type }
  }, upload.url)

  // THE CLAIM THAT MATTERS, AND IT IS ASSERTED FIRST. A status says what the
  // browser was told; this says what the store holds, which is the thing a
  // bypass would actually change - so it is the assertion the mutation that
  // unwraps `guarded` has to die under.
  expect(await storedUploadLength(upload.stagingKey)).toBeNull()
  expect(observed).toEqual({ status: 0, type: 'opaqueredirect' })
})
