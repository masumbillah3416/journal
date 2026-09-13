/**
 * upload.spec.ts — what a REAL browser puts on the wire when it PUTs an
 * upload, and what the receiver answers when nobody is signed in.
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
 * ═══ THE ASSERTION READS THE REQUEST, NOT THE PAGE'S OWN VARIABLES, AND THE
 *     FIRST VERSION OF THIS FILE DID NOT ═══
 *
 * This is the correction that matters most here, and it is recorded rather
 * than quietly fixed. The first version returned `method: 'PUT'` — a string
 * literal typed inside `page.evaluate` — and `contentType: body.type`, the
 * `File`'s own property, set from the value `anUploadUrlFor` had just passed
 * in. No request header was read at all, so the case reduced to
 * `acceptedIngestTypes('inline')[0] === EXPECTED_UPLOAD_REQUEST.contentType`
 * with a browser in the middle acting as an identity function — something
 * `uploadContract.test.ts` already asserts in Vitest without Chromium. The
 * review proved it by overriding the wire header: the assertion stayed GREEN
 * with `application/octet-stream` on the wire and `image/jpeg` in the
 * comparison. A check built to be immune to fixture echo by construction was
 * an echo.
 *
 * So the shape now comes off `page.waitForRequest` — `request.method()` and
 * `allHeaders()['content-type']`, which is what Chromium actually sent. The
 * `File`'s type still comes off the bound pipeline's `acceptedTypes` rather
 * than off the constant, so the two sides of the comparison have independent
 * sources: the page says what to send, the network says what was sent, and
 * the constant is what they are both held against.
 *
 * `content-length` is asserted here too, and was asserted nowhere before. It
 * is point 2 of the constant's own measurement — the browser sets it and a
 * page cannot make it lie — which is precisely why the receiver weighs the
 * bytes it actually read as well as reading the header. **THE SECOND HALF OF
 * THAT SENTENCE WAS RE-MEASURED HERE** rather than carried over: a page that
 * adds `headers: { 'Content-Length': '99' }` to the same `fetch` is ignored,
 * and the wire still carried the body's real length. `Content-Length` is a
 * forbidden header name, so the claim is the browser's to keep and not ours
 * to enforce.
 *
 * WHAT THE CONSTANT CARRIES AND WHAT IT DOES NOT. The shape, not a length:
 * the body's size is the caller's, and pinning one in the constant would make
 * the round-trip fixture — which sends a whole photograph — contradict the
 * constant it is built from. The length is asserted against the wire, against
 * the size the slot was offered for.
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
 * THE SLOT IS A FIXTURE WITH TEARDOWN, not a value a case remembers to clean
 * up. `removeOfferedUpload` used to be the last statement of the happy path,
 * so a case that failed after its PUT left two kilobytes under `MEDIA_DIR` —
 * the review found one after re-running a mutation. Fixture teardown runs on
 * a red case too, which is the only version that holds.
 *
 * Depends on: @playwright/test; `aSignedInSession`, `fixtureLabel`,
 * `anUploadUrlFor`, `storedUploadLength`, `removeOfferedUpload`,
 * `removeSignedInFixture` and the `OfferedUpload` shape
 * (./support/adminSession); `EXPECTED_UPLOAD_REQUEST`
 * (apps/web/lib/media/uploadContract).
 */
import { expect, test as base } from '@playwright/test'
import { EXPECTED_UPLOAD_REQUEST } from '../apps/web/lib/media/uploadContract'
import type { OfferedUpload } from './support/adminSession'
import {
  SESSION_FIXTURE_DOMAIN,
  aSignedInSession,
  anUploadUrlFor,
  fixtureLabel,
  removeOfferedUpload,
  removeSignedInFixture,
  storedUploadLength,
} from './support/adminSession'

/**
 * `test`, with one presigned upload slot per case and its object removed
 * afterwards whether the case passed or failed.
 */
const test = base.extend<{ upload: OfferedUpload }>({
  upload: async ({}, use, testInfo) => {
    const offered = await anUploadUrlFor(testInfo)
    await use(offered)
    await removeOfferedUpload(offered.stagingKey)
  },
})

test.afterAll(async ({}, testInfo) => {
  // Per worker, and only this worker's own account — see `fixtureLabel` for
  // the flake that came of sharing one.
  await removeSignedInFixture(`upload.${fixtureLabel(testInfo)}@${SESSION_FIXTURE_DOMAIN}`)
})

test('a real browser PUT reaches the receiver and the bytes land', async ({
  page,
  context,
  baseURL,
  upload,
}, testInfo) => {
  const session = await aSignedInSession(`upload.${fixtureLabel(testInfo)}`)
  await context.addCookies([{ name: 'td-session', value: session, url: `${baseURL ?? ''}/admin` }])
  // The fetch has to leave a page on the app's own origin: Chromium sends
  // `Origin` from the document making the request, and `isCrossSiteMutation`
  // compares it against `ADMIN_ORIGIN`.
  await page.goto('/admin')
  // ARMED BEFORE THE FETCH IS MADE. This is the object the assertions below
  // read; nothing the page returns says anything about the request.
  const sent = page.waitForRequest((request) => request.url().startsWith(upload.url.split('?')[0] ?? ''))

  const observed = await page.evaluate(
    async (offered: { readonly url: string; readonly contentType: string; readonly byteLength: number }) => {
      // A File built in the page, PUT by the page's own fetch: a real
      // Content-Length, a real Content-Type off the File, and the browser's
      // own body handling - none of which a Node-built Request exercises.
      // Nothing about the File is reported back: what it was asked to send is
      // not evidence of what it sent.
      const body = new File([new Uint8Array(offered.byteLength).fill(7)], 'tokyo.jpg', { type: offered.contentType })
      const response = await fetch(offered.url, { method: 'PUT', body })
      return { status: response.status }
    },
    upload,
  )
  const request = await sent
  const headers = await request.allHeaders()

  expect(observed.status).toBe(204)
  // THE FIXTURE-SHAPE PROOF, READ OFF THE REQUEST CHROMIUM ACTUALLY MADE.
  // `EXPECTED_UPLOAD_REQUEST` is the single constant the integration fixture
  // `aPutRequest` builds its method and Content-Type from, so if the shape the
  // integration suite exercises ever stops matching what a browser sends,
  // THIS fails - not a unit test that would happily agree with itself. Two
  // Phase 2 blockers passed 1,600 tests behind fixtures sending a request
  // shape no browser produces; this is the check that would have caught them,
  // and it only is one because both values come off `request`.
  expect({ method: request.method(), contentType: headers['content-type'] }).toEqual(EXPECTED_UPLOAD_REQUEST)
  // Point 2 of that same measurement, asserted nowhere until now: the browser
  // sets `Content-Length` from the body it was given and a page cannot make it
  // lie, which is why the receiver weighs the bytes it read as well as reading
  // this header.
  expect(headers['content-length']).toBe(String(upload.byteLength))
  // And the store, which is the only thing that can say the bytes arrived.
  expect(await storedUploadLength(upload.stagingKey)).toBe(upload.byteLength)
})

test('the receiver refuses the same PUT with no session, so an upload URL is not a bypass', async ({
  page,
  baseURL,
  upload,
}) => {
  // The token is a capability over one KEY; it is not authentication. The
  // route is guarded, and this is what proves the guard is what answers. No
  // cookie is added: `baseURL` is read only to keep the page on the origin
  // the fetch has to come from.
  expect(baseURL).toBeDefined()
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
