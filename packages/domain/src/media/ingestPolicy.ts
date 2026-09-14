/**
 * media/ingestPolicy — whether a file may be ingested at all, and the refusal
 * a rejected one is refused by name with.
 *
 * Step 2 of SECURITY.md's upload order, and the whole of what each pipeline
 * mode accepts. It takes the type `sniffMediaType` read out of the BYTES,
 * never a filename and never a client's word for it — the `declared` field
 * below can only ever cost a file its acceptance, never win it one.
 *
 * ═══ PATTERN (CLAUDE.md §3.3) ═══
 *
 * Result type. A refusal is a value a caller has to unwrap, not an exception
 * it can forget to catch — and the value carries WHICH refusal, because the
 * refusals are not interchangeable (see the order below).
 *
 * ═══ THE ORDER OF THE REFUSALS IS THE ASSERTION ═══
 *
 * SVG, then HEIC, then video-by-mode, then unrecognised, then the declared
 * mismatch. Every one of them refuses the file, so the order changes nothing
 * about WHETHER an upload is stored — it decides what the admin is told and
 * what the log records. An SVG that came back `'declared-mismatch'` would be
 * technically true and operationally useless: it would name a naming problem
 * where the real event is an attempt at stored XSS. `'svg-rejected'` is
 * therefore checked first and unconditionally, before mode and before any
 * agreement between the bytes and the client.
 *
 * ═══ WHY EACH REFUSAL EXISTS ═══
 *
 *   - `'svg-rejected'`: SECURITY.md, "Reject SVG. There is no use for it
 *     here" — an SVG is an HTML document, so one uploaded file becomes stored
 *     XSS with the author's own session attached. Measured aggravation: this
 *     repository's `sharp` build DOES decode SVG, so nothing downstream would
 *     stop one.
 *   - `'heic-unsupported'`: see the HANDOFF-DEVIATION note below.
 *   - `'video-deferred'`: ADR 0004 defers clips. The refusal lives HERE, at
 *     the port, and `apps/web/collections/media.ts` keeps `video/mp4` and
 *     `video/quicktime` exactly as `DATA_MODEL.md` lists them — so enabling
 *     clips stays one configuration change (`MEDIA_PIPELINE=worker`) rather
 *     than a schema change and a migration.
 *   - `'type-not-allowed'`: the default-deny direction. An archive, a PDF, a
 *     truncated upload and a file of noise all arrive here as `'unknown'`,
 *     which discharges SECURITY.md's "reject archives" without a list of
 *     every format that is not a photograph.
 *   - `'declared-mismatch'`: the bytes are acceptable and the client called
 *     them something else. That disagreement is itself a signal — it is what
 *     a renamed file looks like — so it is refused rather than shrugged off,
 *     but only after the dangerous types have been named as themselves. A
 *     client that said `'application/octet-stream'` disagreed with nothing,
 *     and is not refused here (see the invariants).
 *
 * ═══ INVARIANTS A FUTURE EDIT COULD BREAK ═══
 *
 *   - **A client that declared NOTHING is not a client that declared wrong**,
 *     and there are two spellings of nothing. `'application/octet-stream'` is
 *     the one a browser sends; `''` is the one only a hand-rolled multipart
 *     body produces, by omitting the part header altogether. Both are in
 *     {@link NOTHING_DECLARED} and neither is a mismatch — the bytes decide.
 *
 *     WHAT A BROWSER ACTUALLY SENDS, since the first version of this module
 *     guessed and was wrong. Measured in the Task 2 review by driving this
 *     repository's own Chromium through a real multipart post and reading the
 *     part headers off the wire: `holiday.jpg` → `image/jpeg`,
 *     `holiday.JPG` → `image/jpeg`, `pic.png` → `image/png`,
 *     `pic.avif` → `image/avif`, `clip.mp4` → `video/mp4`,
 *     `clip.mov` → `video/quicktime`, `doc.svgz` → `image/svg+xml`,
 *     `archive.zip` → `application/x-zip-compressed`, and — the cases this
 *     invariant exists for — `holiday` with no extension and `photo.heic` on
 *     this Windows machine BOTH → `application/octet-stream`. The type comes
 *     from the NAME, never from the bytes, which is exactly why it can only
 *     ever cost a file its acceptance. An empty string is a shape no browser
 *     produces, so treating it as the only spelling of "nothing declared"
 *     refused a real JPEG dropped in without an extension.
 *   - The comparison of `declared` is otherwise exact: no trimming, no case
 *     folding, no stripping of `; charset=…`. Reading
 *     `'application/octet-stream'` as "nothing declared" is a decision about
 *     one measured value, not a licence to normalise: a type that needs
 *     trimming or case-folding did not come from a browser upload, and
 *     normalising it would be guessing at the intent of a request we did not
 *     expect.
 *   - {@link acceptedIngestTypes} returns a FRESH array per call. The list is
 *     an allowlist; handing callers one shared mutable array would be the
 *     mutable singleton CLAUDE.md §3.3 rejects, holding the one piece of
 *     state where mutation is worst.
 *
 * Depends on: Result, err and ok from ../result; SniffedType from ./sniff.
 */
import type { Result } from '../result'
import { err, ok } from '../result'
import type { SniffedType } from './sniff'

/** Which media pipeline is configured — `MEDIA_PIPELINE`, per ADR 0004. */
export type PipelineMode = 'inline' | 'worker'

/** Why an upload was refused. One name per reason; see this module's header. */
export type IngestRefusal =
  'svg-rejected' | 'video-deferred' | 'heic-unsupported' | 'type-not-allowed' | 'declared-mismatch'

/** A type this pipeline can actually process. Never `image/svg+xml`. */
export type AcceptedType = 'image/jpeg' | 'image/png' | 'video/mp4' | 'video/quicktime'

/** The still formats every mode accepts, in the order the admin is offered them. */
const STILL_TYPES = ['image/jpeg', 'image/png'] as const

/** The clip formats only `worker` accepts (ADR 0004). */
const CLIP_TYPES = ['video/mp4', 'video/quicktime'] as const

/**
 * What the configured pipeline accepts.
 *
 * This is the list an upload form's `accept` attribute and an error message
 * are both built from, so it is one source rather than two.
 * @param mode - The configured `MEDIA_PIPELINE`.
 * @returns A fresh array — stills alone under `inline`, stills and clips
 * under `worker`.
 * @example
 * acceptedIngestTypes('inline') // ['image/jpeg', 'image/png']
 */
export const acceptedIngestTypes = (mode: PipelineMode): readonly AcceptedType[] =>
  mode === 'worker' ? [...STILL_TYPES, ...CLIP_TYPES] : [...STILL_TYPES]

/**
 * Every spelling of "the client declared nothing".
 *
 * `'application/octet-stream'` is what a browser sends for a file whose
 * extension the operating system does not map — measured, see the module
 * header — and `''` is what a multipart body that omits the part header
 * leaves behind. Both say the same thing about the bytes: nothing.
 */
const NOTHING_DECLARED = ['', 'application/octet-stream'] as const

/** Whether the client's `Content-Type` says nothing at all about the bytes. */
const declaresNothing = (declared: string): boolean => NOTHING_DECLARED.some((nothing) => nothing === declared)

/** Whether a sniffed type is one of the two clip formats. */
const isClip = (sniffed: SniffedType): boolean => CLIP_TYPES.some((clip) => clip === sniffed)

/**
 * Whether this file may be ingested, or which refusal it earns.
 *
 * The three inputs travel as one options object rather than three positional
 * arguments, so no call site can transpose the sniffed and declared types —
 * they have the same shape and opposite authority, and getting them the wrong
 * way round would make the client's word decide (CLAUDE.md §3.1).
 * @param candidate - `sniffed`, from {@link sniffMediaType} over the file's
 * own bytes; `declared`, the client's `Content-Type` (a browser sends
 * `'application/octet-stream'` when it has nothing to say, and `''` means
 * the part carried no header at all — see {@link NOTHING_DECLARED}); `mode`,
 * the configured `MEDIA_PIPELINE`.
 * @returns `ok` with the type to process, or `err` naming why the file was
 * refused. Never throws: every input, including nonsense, has a refusal.
 * @example
 * ingestDecision({ sniffed: sniffMediaType(bytes), declared: 'image/jpeg', mode: 'inline' })
 * // { ok: false, error: 'svg-rejected' }, for SVG bytes named holiday.jpg
 */
export const ingestDecision = (candidate: {
  readonly sniffed: SniffedType
  readonly declared: string
  readonly mode: PipelineMode
}): Result<AcceptedType, IngestRefusal> => {
  const { sniffed, declared, mode } = candidate

  // First, and whatever the mode or the client said: SECURITY.md's absolute.
  if (sniffed === 'image/svg+xml') return err('svg-rejected')

  // HANDOFF-DEVIATION: DATA_MODEL.md lists `image/heic` among the accepted
  // upload types and `apps/web/collections/media.ts` keeps it, but this
  // repository's `sharp` (0.35.4) cannot decode one — measured, its `heif`
  // input accepts only `.avif` and its bundled codec is aom rather than HEVC,
  // so ingesting a HEIC would store an original no derivative could ever be
  // made from. Refused here at the port with the schema untouched, which is
  // ADR 0004's shape applied to a second type. See docs/deviations.md §47.
  if (sniffed === 'image/heic') return err('heic-unsupported')

  const accepted = acceptedIngestTypes(mode).find((allowed) => allowed === sniffed)
  if (accepted === undefined) return err(isClip(sniffed) ? 'video-deferred' : 'type-not-allowed')

  if (!declaresNothing(declared) && declared !== accepted) return err('declared-mismatch')

  return ok(accepted)
}
