/**
 * uploadContract — the shapes that cross between the admin's browser and the
 * upload surface, and the one constant that says what a browser's PUT looks
 * like.
 *
 * The types live here rather than beside the Server Action that returns them
 * for two reasons. `eslint-rules/guarded-server-actions.js` lets a
 * `'use server'` module export nothing but `guardedAction(...)` calls and
 * type-only declarations, so keeping the module down to its exports is the
 * shape that stays readable; and the admin's client code will import these to
 * type its own request, which it cannot do from an action module without
 * pulling the action's whole graph with it.
 *
 * ═══ `EXPECTED_UPLOAD_REQUEST` IS THE FIXTURE-DRIFT DEFENCE, AND IT IS A
 *     MEASUREMENT ═══
 *
 * Two Phase 2 blockers passed sixteen hundred tests because a fixture sent a
 * request shape no browser produces — one set an `Origin` header a browser
 * omits, the other posted one field where the form sends six. Nothing in a
 * test suite can notice that, because the fixture and the assertion agree with
 * each other by construction.
 *
 * So the shape is written down ONCE, here, as a value. The integration
 * fixture (`testing/uploadProbes.ts`'s `aPutRequest`) builds its method and
 * `Content-Type` from it, and `e2e/upload.spec.ts` (Task 9) asserts a real
 * Chromium's own PUT against it. If the two ever diverge, the browser test
 * fails rather than the suite quietly agreeing with itself.
 *
 * WHAT WAS MEASURED, AND HOW. This repository's own Chromium (Playwright
 * 1.62.1, HeadlessChrome 151) was driven at a local Node HTTP server on the
 * loopback interface, and the request line and headers were read off the
 * wire — nothing left this machine (CLAUDE.md §7.1). Four bodies were sent
 * through the page's own `fetch(url, { method: 'PUT', body })`:
 *
 *   - `new File([bytes], 'tokyo.jpg', { type: 'image/jpeg' })`
 *     → `PUT`, `content-type: image/jpeg`, `content-length: 2048`
 *   - `new File([bytes], 'x.png', { type: 'image/png' })`
 *     → `PUT`, `content-type: image/png`, `content-length: 10`
 *   - `new Blob([bytes])` with no type → `PUT`, **no `content-type` header at
 *     all** (not `application/octet-stream`), `content-length: 4`
 *   - a bare `Uint8Array` → `PUT`, **no `content-type` header**,
 *     `content-length: 6`
 *
 * Three things follow, and each is relied upon somewhere:
 *
 *   1. The `Content-Type` is the `File`'s own `type`, which a file picker sets
 *      from the NAME (Task 2's measurement) — so it is a claim, exactly like
 *      `declaredType` on a slot request, and the receiver never believes it.
 *   2. `Content-Length` is set by the browser and is the body's real length. A
 *      page cannot set it — so a lying length is a hand-rolled client, which
 *      is precisely why the receiver weighs the bytes it actually read as well
 *      as reading the header.
 *   3. Chromium DOES send `Origin` on this fetch (`origin: <the page's own>`),
 *      unlike the form navigation Phase 2 measured. That is what lets
 *      `isCrossSiteMutation` in `apps/web/lib/auth/adminAccess.ts` admit the
 *      upload at all: the URL is built from `ADMIN_ORIGIN`, so a same-origin
 *      PUT matches the target and a cross-site one does not.
 *
 * The constant carries the SHAPE and not a length. The body's size is the
 * caller's, and pinning one here would make the round-trip fixture — which
 * sends a whole photograph — contradict the constant it is built from.
 *
 * **WHAT DOES NOT YET GUARD IT, stated rather than left to be discovered.**
 * Until `e2e/upload.spec.ts` lands, nothing in the suite fails if these two
 * values are wrong: changing `method` to `'POST'` and `contentType` to
 * `'application/octet-stream'` was run as a mutation, and both integration
 * files stayed green — the receiver reads neither, because the route mounts
 * only `PUT` and the declared type is a claim it never believes. A unit test
 * asserting this constant against a literal would be the constant agreeing
 * with itself, which is the vacuity this whole module exists to avoid. The
 * only honest check on a measurement is another measurement, and that is the
 * browser's.
 *
 * PATTERN (CLAUDE.md §3.3): Data Transfer Object — one serialization boundary
 * between the admin's browser and the upload surface.
 * Depends on: `RequestedUpload`, `SlotRefusal` and `UploadSlotPlan` from
 * `@travel-diary/domain/media/uploadSlot`; `Result` from
 * `@travel-diary/domain/result`.
 */
import type { RequestedUpload, SlotRefusal, UploadSlotPlan } from '@travel-diary/domain/media/uploadSlot'
import type { Result } from '@travel-diary/domain/result'

/**
 * The method and content type a browser's own upload PUT carries.
 *
 * Measured, not assumed — see this module's header for the run that produced
 * it. `as const` so a fixture built from it cannot widen the shape.
 */
export const EXPECTED_UPLOAD_REQUEST = {
  /** What the page's `fetch` sends. Never POST: the object is being placed. */
  method: 'PUT',
  /** The `File`'s own `type`, which is a claim about the bytes, never a fact. */
  contentType: 'image/jpeg',
} as const

/** What the admin's picker asks for: somewhere to put these files. */
export interface UploadSlotRequest {
  /** The journey every offered key is staged under (CLAUDE.md §7). */
  readonly journey: string
  /** What the picker selected, as the client describes it. */
  readonly files: readonly RequestedUpload[]
}

/** One place to put one file, and the URL that will take it. */
export interface OfferedUploadSlot extends UploadSlotPlan {
  /**
   * The URL to PUT the bytes to. Carries its own capability token, so one
   * slot's URL cannot be used to overwrite another slot's object.
   */
  readonly uploadUrl: string
}

/**
 * Why a slot request could not be answered.
 *
 * The domain's own {@link SlotRefusal} names everything decided about the
 * FILES; the two added here are decided about the request around them —
 * `'invalid-journey'` when the id names no journey it could key by, and
 * `'no-upload-url'` when the store refused to mint a URL for a planned key.
 */
export type SlotFailure = SlotRefusal | 'invalid-journey' | 'no-upload-url'

/** What the admin's picker gets back: one slot per file, or one refusal. */
export type UploadSlotResponse = Result<readonly OfferedUploadSlot[], SlotFailure>
