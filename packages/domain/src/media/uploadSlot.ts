/**
 * media/uploadSlot — what a request for upload slots may ask for, and the
 * staging key each accepted file is offered.
 *
 * Step 0 of `SECURITY.md`'s upload order: it runs before a single byte has
 * been offered anywhere, because the whole point of a presigned upload is that
 * the bytes never pass through the app (spec §9.1: Vercel caps a request body
 * at ~4.5MB, and a 25MB photograph is larger than that). So the only things
 * this module can see are what the client SAID — a name, a type and a length —
 * and the only thing it decides is whether to offer a place to put them.
 *
 * ═══ PATTERN (CLAUDE.md §3.3) ═══
 *
 * Result type. A refusal is a value the caller has to unwrap, and it carries
 * WHICH refusal, because an admin told "too many files" and an admin told
 * "that file is too big" have different things to do next.
 *
 * ═══ WHAT THIS DISCHARGES, AND WHAT IT DELIBERATELY DOES NOT ═══
 *
 * `SECURITY.md`, "Cap file size and the per-request file count; reject
 * archives". The two caps are {@link MAX_UPLOAD_BYTES} and
 * {@link MAX_FILES_PER_REQUEST} and they are enforced here. Archives are NOT
 * rejected here and cannot be: a `.zip` renamed `tokyo.jpg` and declared
 * `image/jpeg` is indistinguishable from a photograph until somebody reads the
 * bytes, which is `sniffMediaType`'s job at ingest. What this module refuses is
 * a request that has not even claimed to be a photograph.
 *
 * ═══ INVARIANTS A FUTURE EDIT COULD BREAK ═══
 *
 *   - **THE PLAN IS ONLY WHAT THE CLIENT WAS TOLD.** `byteLength` is a number
 *     the client typed; nothing here has weighed anything. The cap is enforced
 *     AGAIN at the receiver, against the bytes that actually arrive
 *     (`apps/web/lib/media/receiveLocalUpload.ts`). Deleting either enforcement
 *     leaves a cap a client sets for itself.
 *   - **The whole request is refused when one file fails.** A caller handed
 *     three slots for four files would upload three and never learn which one
 *     it lost, so there is no partial success to mishandle.
 *   - **`acceptedTypes` is the bound processor's own list**, passed in rather
 *     than written here. ADR 0004 requires enabling clips to be one
 *     configuration change; a second list in this module would be a second
 *     place for that change to be forgotten.
 *   - **The journey segment of the key is the id, unsanitised.** A `JourneyId`
 *     is branded but its constructor only refuses the empty string, so a key
 *     built from a hostile one could in principle carry a `..`. That is refused
 *     at the PORT — `validateStorageKey` in `apps/web/lib/ports/storage.ts`
 *     rejects it for every adapter, including the R2 one that has no filesystem
 *     to protect — rather than silently rewritten here into a key naming a
 *     different journey than the caller asked for.
 *   - **`nonce` is injected, never reached for.** A key built from
 *     `randomUUID()` inside pure logic is a key no test can assert, exactly as
 *     a clock read inside logic is (CLAUDE.md §2.3). The caller in
 *     `apps/web/app/(admin)/admin/media/actions.ts` passes `() => randomUUID()`.
 *
 * Depends on: Result, err and ok from ../result; JourneyId from ../ids.
 */
import type { JourneyId } from '../ids'
import type { Result } from '../result'
import { err, ok } from '../result'

/**
 * The most bytes one uploaded file may carry — 50MiB.
 *
 * Chosen against the thing being uploaded rather than against a round number:
 * a 45-megapixel full-frame raw-to-JPEG export lands around 25MB, and 50MiB
 * leaves room for a burst-mode original without leaving room for a video file
 * smuggled in under a still's declared type.
 */
export const MAX_UPLOAD_BYTES = 52_428_800

/**
 * The most files one slot request may ask for.
 *
 * A day's shooting arrives in tens, not thousands. Twenty is a comfortable
 * drag-and-drop batch and a hard ceiling on how much staging space one
 * unattended request can claim.
 */
export const MAX_FILES_PER_REQUEST = 20

/**
 * How long an offered upload URL stays usable — fifteen minutes.
 *
 * Long enough for twenty files over a hotel connection, short enough that a URL
 * copied out of a log or a browser history is dead by the time it is read. The
 * URL is a capability over one key; see `apps/web/lib/media/uploadToken.ts`.
 */
export const UPLOAD_URL_TTL_SECONDS = 900

/** Why a slot request was refused. One name per reason; see the order below. */
export type SlotRefusal = 'empty-request' | 'too-many-files' | 'too-large' | 'type-not-offered' | 'unnamed-file'

/** One file a client has asked for somewhere to put. Every field is its claim. */
export interface RequestedUpload {
  /** What the client called the file. Never used to decide what it IS. */
  readonly filename: string
  /** What the client called its type. Never used to decide what it IS. */
  readonly declaredType: string
  /** How big the client says it is. Weighed again at the receiver. */
  readonly byteLength: number
}

/** One accepted file's place to put itself. */
export interface UploadSlotPlan {
  /** The key the bytes are staged under, keyed by journey (CLAUDE.md §7). */
  readonly stagingKey: string
  /** The type the offered URL will accept, echoed back from the request. */
  readonly declaredType: string
  /** The name the client sent, unaltered, so the admin sees what it uploaded. */
  readonly filename: string
}

/** Characters a storage key segment may hold. Everything else becomes a hyphen. */
const UNSAFE_IN_KEY = /[^a-z0-9]+/g

/** Trims the hyphens sanitising leaves at either end of a segment. */
const EDGE_HYPHENS = /^-+|-+$/g

/**
 * Reduces one filename part to the characters a storage key may hold.
 * @param part - A filename's base or extension, in any case.
 * @returns Lowercased, with every run of unsafe characters collapsed to a
 *   single hyphen and the edges trimmed. May be empty.
 */
const sanitiseKeyPart = (part: string): string =>
  part.toLowerCase().replace(UNSAFE_IN_KEY, '-').replace(EDGE_HYPHENS, '')

/**
 * Reduces a client's filename to the tail of a storage key.
 * @param filename - Exactly what the client called the file.
 * @returns The sanitised name, or an empty string when nothing usable is left —
 *   which is refused rather than replaced with an invented name.
 */
const keyNameFor = (filename: string): string => {
  const lastDot = filename.lastIndexOf('.')
  // A leading dot is not an extension separator: `.profile` is a name, not an
  // empty name with a `profile` extension.
  const hasExtension = lastDot > 0
  const base = sanitiseKeyPart(hasExtension ? filename.slice(0, lastDot) : filename)
  const extension = hasExtension ? sanitiseKeyPart(filename.slice(lastDot + 1)) : ''

  if (base.length === 0) return ''
  return extension.length === 0 ? base : `${base}.${extension}`
}

/**
 * Decides whether one requested file may be offered a slot at all.
 *
 * The order is size, then type, then name, and it is the order the admin is
 * best served by: a file that is too big is too big whatever it is called, and
 * a type nobody offers cannot be fixed by renaming it.
 * @param file - What the client claimed about one file.
 * @param acceptedTypes - The bound processor's own accepted list.
 * @returns The refusal to answer the whole request with, or `undefined` when
 *   the file may have a slot.
 */
const refusalFor = (file: RequestedUpload, acceptedTypes: readonly string[]): SlotRefusal | undefined => {
  if (file.byteLength <= 0 || file.byteLength > MAX_UPLOAD_BYTES) return 'too-large'
  if (!acceptedTypes.includes(file.declaredType)) return 'type-not-offered'
  if (keyNameFor(file.filename).length === 0) return 'unnamed-file'
  return undefined
}

/**
 * Plans where each file in one upload request would be staged, or refuses the
 * whole request.
 *
 * @param request - The files claimed, the types the bound processor accepts,
 *   the journey everything is keyed by, and the nonce source each key's unique
 *   prefix comes from.
 * @returns `ok` with one plan per file, in the order they were asked for, or
 *   `err` naming the first refusal found. Never partially succeeds.
 * @example
 * planUploadSlots({
 *   files: [{ filename: 'tokyo.jpg', declaredType: 'image/jpeg', byteLength: 2_000_000 }],
 *   acceptedTypes: ['image/jpeg', 'image/png'],
 *   journey,
 *   nonce: () => randomUUID(),
 * })
 */
export const planUploadSlots = (request: {
  readonly files: readonly RequestedUpload[]
  readonly acceptedTypes: readonly string[]
  readonly journey: JourneyId
  readonly nonce: (index: number) => string
}): Result<readonly UploadSlotPlan[], SlotRefusal> => {
  if (request.files.length === 0) return err('empty-request')
  if (request.files.length > MAX_FILES_PER_REQUEST) return err('too-many-files')

  const plans: UploadSlotPlan[] = []
  for (const [index, file] of request.files.entries()) {
    const refusal = refusalFor(file, request.acceptedTypes)
    if (refusal !== undefined) return err(refusal)

    plans.push({
      stagingKey: `staging/${request.journey}/${request.nonce(index)}-${keyNameFor(file.filename)}`,
      declaredType: file.declaredType,
      filename: file.filename,
    })
  }

  return ok(plans)
}
