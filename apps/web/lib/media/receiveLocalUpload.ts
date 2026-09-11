/**
 * receiveLocalUpload — what happens when a browser PUTs an upload's bytes.
 *
 * ═══ WHY A RECEIVER OF OUR OWN EXISTS AT ALL ═══
 *
 * Spec §9.1 forces uploads direct to the bucket rather than preferring it:
 * Vercel's serverless functions cap a request body at ~4.5MB, so a 25MB
 * photograph cannot pass through the app. In production that PUT goes to R2.
 * There is no R2 here — no account, no credentials, and CLAUDE.md §7.1 forbids
 * sending a byte of this repository to a service to find out — and the local
 * disk adapter's `signedUrl` returns a `file://` URL, **which no browser can
 * PUT to**. So without this module, "direct to bucket" would be unexercisable
 * locally: no test, no browser sweep and no developer could drive the upload
 * path at all. This is the surface `createLocalStorage`'s `uploadUrl` points
 * at, and `docs/adr/0020-the-presign-seam-and-the-local-upload-receiver.md`
 * records both the decision and the residual — this route must be deleted or
 * gated in the same change that adds the R2 adapter.
 *
 * ═══ THE ORDER IS THE POINT ═══
 *
 *   1. Read the token off the URL. No token, no conversation.
 *   2. Verify it — signature first, then expiry (see `./uploadToken.ts`).
 *   3. Refuse a DECLARED `Content-Length` over the token's cap, before a byte
 *      of body is read. A browser always sends one (measured; see
 *      `./uploadContract.ts`), so this is the check that stops a 50MB body
 *      being buffered before it is refused.
 *   4. Read the body, and weigh it. A `Content-Length` is a claim, and a
 *      client is not what enforces a cap — so the bytes that actually arrived
 *      are measured too. Deleting either check leaves a cap a client sets.
 *   5. Write through the port, which is where traversal is refused.
 *
 * ═══ INVARIANTS A FUTURE EDIT COULD BREAK ═══
 *
 *   - **THE KEY COMES FROM THE TOKEN, NEVER FROM THE URL.** A key read off the
 *     query string would make this URL a write-anywhere primitive; the
 *     signature is what makes the key a claim we made rather than one the
 *     client made.
 *   - **It never throws.** The request is attacker-controlled, so every way of
 *     failing is a value — including a store that cannot take the bytes, which
 *     is `'unwritable'` rather than a rejected promise out of a route handler.
 *   - **A refusal writes nothing.** Every refusal here happens before the
 *     `put`, so there is no partially-written object to clean up.
 *   - **Nothing here logs the token.** It is a capability; see
 *     `./uploadToken.ts`'s header.
 *
 * PATTERN (CLAUDE.md §3.3): Ports & Adapters — the bytes go out through
 * `StoragePort` and this module never learns what is behind it; Result type
 * for every refusal.
 * Depends on: `StoragePort` and `validateStorageKey` (../ports/storage);
 * `verifyUploadToken` (./uploadToken); Result, err and ok from
 * `@travel-diary/domain/result`.
 */
import type { Result } from '@travel-diary/domain/result'
import { err, ok } from '@travel-diary/domain/result'
import type { StoragePort } from '../ports/storage'
import { validateStorageKey } from '../ports/storage'
import type { TokenRefusal } from './uploadToken'
import { verifyUploadToken } from './uploadToken'

/**
 * Why an upload was not received.
 *
 * The three {@link TokenRefusal} names all mean "this capability is not one",
 * and `localUploadEndpoint.ts` answers all three identically so the endpoint
 * cannot become an oracle. `'too-large'` and `'unwritable'` are separate
 * because they are separate things for the admin to do about it.
 */
export type ReceiveRefusal = TokenRefusal | 'too-large' | 'unwritable'

/** What the receiver needs from the world outside it. */
export interface ReceiverDependencies {
  /** Where the bytes go. The same port every other caller writes through. */
  readonly storage: StoragePort
  /** The clock, injected — never `Date.now()` inside logic under test (§2.3). */
  readonly now: () => number
  /** The secret the presented token must have been signed with. */
  readonly secret: string
}

/** The query parameter the minted URL carries its capability in. */
const TOKEN_PARAM = 'token'

/**
 * Receives one presigned upload's bytes, or refuses it.
 *
 * @param request - The PUT exactly as it arrived, token in its query string.
 * @param dependencies - The store to write through, the clock, and the signing
 *   secret.
 * @returns `ok` with the key the bytes were written to, or `err` naming the
 *   refusal. Never throws, and never writes anything on a refusal.
 * @example
 * const received = await receiveLocalUpload(request, {
 *   storage: createLocalStorage(MEDIA_DIR),
 *   now: Date.now,
 *   secret: env.PAYLOAD_SECRET,
 * })
 */
export const receiveLocalUpload = async (
  request: Request,
  dependencies: ReceiverDependencies,
): Promise<Result<{ readonly key: string }, ReceiveRefusal>> => {
  const presented = new URL(request.url).searchParams.get(TOKEN_PARAM)
  if (presented === null) return err('malformed')

  const grant = verifyUploadToken({ token: presented, now: dependencies.now(), secret: dependencies.secret })
  if (!grant.ok) return err(grant.error)

  // A signed key is still only a key we are asked to believe we minted. It is
  // put through the port's own validation before it is used, so a traversal
  // refuses the same way an unsigned one would rather than reaching the store.
  if (!validateStorageKey(grant.value.key).ok) return err('malformed')

  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > grant.value.maxBytes) return err('too-large')

  const body = new Uint8Array(await request.arrayBuffer())
  if (body.byteLength > grant.value.maxBytes) return err('too-large')

  const contentType = request.headers.get('content-type') ?? 'application/octet-stream'
  try {
    const written = await dependencies.storage.put(grant.value.key, body, contentType)
    if (!written.ok) return err('unwritable')
  } catch {
    // A store that rejects rather than returning is still a store that could
    // not take the bytes. Swallowing the reason is deliberate: it is a
    // filesystem path, and this value is one step from a response body.
    return err('unwritable')
  }

  return ok({ key: grant.value.key })
}
