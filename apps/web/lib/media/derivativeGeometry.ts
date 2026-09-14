/**
 * derivativeGeometry — what each configured derivative tier does to a
 * photograph's SHAPE, read off the media collection rather than restated.
 *
 * A tier declared with a width AND a height is a `cover` crop: Payload hands
 * the pair straight to `sharp(...).resize(...)`, which fills the box and
 * discards whatever does not fit. A tier declared with one dimension keeps
 * the whole frame. MED-001 (`docs/qa/2026-09-08-media-pipeline-sweep.md`) is
 * what a reader gets when the first kind is served where the second was
 * meant, and this module is the one place that answers which is which — so a
 * rung added later cannot be swept into an uncropped ladder by a fallback
 * nobody re-read.
 *
 * A TIER WITH BOTH DIMENSIONS IS CALLED CROPPED WHATEVER ITS `fit` IS, and
 * that is deliberate rather than incomplete. `fit: 'inside'` would preserve
 * the frame, and the collection configures no `fit` today; calling such a
 * tier cropped makes `./derivativeGeometry.test.ts` refuse it from an
 * uncropped ladder rather than admit it on a rule nobody has measured. Refuse
 * what you do not recognise (`eslint-rules/guarded-server-actions.js` is this
 * repository's worked example of the same move).
 *
 * INVARIANT, relied on by every ladder that serves a WHOLE photograph: at
 * least one uncropped tier is derivable from an original of any size, so no
 * consumer has to fall through to a square crop. `frame` is that tier,
 * through `withoutEnlargement: true`. `./derivativeGeometry.test.ts` goes red
 * the moment it stops being true.
 *
 * PATTERN (CLAUDE.md §3.3): none — a projection of one configuration object
 * and the omit rule Payload applies to it.
 * Depends on: `../../collections/media` for the configured ladder (a type-only
 * dependency on `payload` — nothing here touches sharp or a database).
 */
import { Media } from '../../collections/media'

/** What a derivative tier does to the frame it is generated from. */
export type DerivativeGeometry = 'cropped' | 'uncropped'

/** One configured derivative tier, reduced to what shape questions need. */
export interface ConfiguredDerivative {
  /** The tier's name, exactly as `media.sizes` keys it. */
  readonly name: string
  /** Whether generating it discards part of the frame. */
  readonly geometry: DerivativeGeometry
  /** The configured target width, or `undefined` for a height-only tier. */
  readonly width: number | undefined
  /** The configured target height, or `undefined` for a width-only tier. */
  readonly height: number | undefined
  /** The tier's `withoutEnlargement`, which is what decides whether Payload may omit it. */
  readonly withoutEnlargement: boolean | undefined
}

/** An original's own pixel dimensions, as the `media` row records them. */
export interface SourceDimensions {
  /** The original's width in pixels. */
  readonly width: number
  /** The original's height in pixels. */
  readonly height: number
}

/**
 * Every derivative tier `apps/web/collections/media.ts` configures.
 *
 * @returns One entry per configured tier, in the collection's own order.
 * @throws {Error} When the collection configures no image sizes — which would
 *   mean it had stopped deriving tiers at all, and every caller here was
 *   asking a question about a ladder that no longer exists.
 * @example
 * configuredDerivatives().filter((tier) => tier.geometry === 'uncropped')
 */
export const configuredDerivatives = (): readonly ConfiguredDerivative[] => {
  const upload = Media.upload
  /* c8 ignore next -- no organic trigger: `media.ts` is an upload collection that configures image sizes, and a change removing them fails `./tierRegistration.test.ts` and every derivative case long before this line. The throw stays so the absence is named rather than read as an empty ladder. */
  if (typeof upload !== 'object' || upload.imageSizes === undefined)
    throw new Error('the media collection configures no image sizes')

  return upload.imageSizes.map((size) => ({
    name: size.name,
    geometry: size.width !== undefined && size.height !== undefined ? 'cropped' : 'uncropped',
    width: size.width,
    height: size.height,
    withoutEnlargement: size.withoutEnlargement,
  }))
}

/**
 * Whether Payload generates `tier` from an original of these dimensions.
 *
 * Transcribed from Payload 3.88.0's own `getImageResizeAction`, which is the
 * only thing that decides it: a tier is omitted ONLY when its
 * `withoutEnlargement` is left undefined and the original is too small — for
 * a two-dimension tier, too small on BOTH axes; for a one-dimension tier, too
 * small on that one. Any other setting of `withoutEnlargement` — `true` (leave
 * a small original at its own size) or `false` (enlarge it) — means the tier
 * is always generated.
 *
 * INVARIANT: this mirrors a dependency's branch table, so it is checked
 * against a real Payload rather than only against itself —
 * `../../scripts/rederive-media.integration.test.ts` and
 * `./ingestUpload.integration.test.ts` both drive real uploads through it.
 * @param tier - The configured tier, from {@link configuredDerivatives}.
 * @param source - The original's own dimensions.
 * @returns `true` when the row will carry this tier.
 * @example
 * isDerivable({ name: 'hero', geometry: 'uncropped', width: 2000, height: undefined, withoutEnlargement: undefined }, { width: 1200, height: 900 }) // false
 */
export const isDerivable = (tier: ConfiguredDerivative, source: SourceDimensions): boolean => {
  if (tier.withoutEnlargement !== undefined) return true
  if (tier.width !== undefined && tier.height !== undefined) {
    return !(source.width < tier.width && source.height < tier.height)
  }
  if (tier.width !== undefined) return source.width >= tier.width
  if (tier.height !== undefined) return source.height >= tier.height
  /* c8 ignore next -- unreachable through `configuredDerivatives()`: a size with neither dimension resizes nothing, and the collection configures none. Written as the honest answer rather than omitted, so a dimensionless tier reads as "always present" instead of falling off the end of the function. */
  return true
}
