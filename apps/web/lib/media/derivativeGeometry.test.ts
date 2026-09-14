/**
 * derivativeGeometry.test.ts — the ladder keeps an uncropped rung every
 * original can reach, and no consumer that serves a whole photograph names a
 * cropped one.
 *
 * ═══ WHAT THIS FILE IS FOR ═══
 *
 * MED-001 (`docs/qa/2026-09-08-media-pipeline-sweep.md`) was not one wrong
 * constant. It was a CLASS: three ladders that prefer an uncropped derivative
 * and fall back to a square one, against a collection where no uncropped tier
 * was derivable from an original under 1400px — so every ladder's fallback was
 * the normal case and a reader got an 800x800 crop of a 1200x900 photograph.
 * Two halves have to hold for the class to stay closed, and each has its own
 * case below: the collection must OFFER an uncropped tier that any original
 * can produce, and the ladders must not NAME a cropped one.
 *
 * ═══ WHY IT READS THREE MODULES AS TEXT ═══
 *
 * `FULL_TIERS`, `DOWNLOAD_TIERS` and `DERIVATIVE_PREFERENCE` are private to
 * their modules and should stay private — exporting a constant so a test can
 * read it makes the module's surface a function of its tests. They are read as
 * SOURCE instead, the same way `./tierRegistration.test.ts` reads the
 * collection, `../auth/adminGuardRegistration.test.ts` reads route files and
 * `e2e/ciRegistration.test.ts` reads the workflow. A text read also buys the
 * thing an import could not: the extraction FAILING is itself reportable, so a
 * ladder refactored into a shape this file cannot see goes red rather than
 * silently passing against nothing.
 *
 * ═══ IT REFUSES RATHER THAN ENUMERATES ═══
 *
 * The cases below do not list the tiers that would be wrong. They compute the
 * uncropped set from the collection and refuse everything outside it, so a rung
 * added in five years is covered by a case written today (CLAUDE.md §3.3's
 * rejected anti-patterns, and the standing order about enumerations).
 *
 * PATTERN (CLAUDE.md §3.3): none — file reads, one projection and two refusals.
 * Depends on: vitest, node:fs, node:path, node:url, ./derivativeGeometry.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { ConfiguredDerivative } from './derivativeGeometry'
import { configuredDerivatives, isDerivable } from './derivativeGeometry'

/** The repository root, four levels above this directory. */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

/**
 * An original smaller than every rung the ladder configures.
 *
 * 1x1 rather than a plausible photograph on purpose: the invariant is "any
 * original", and a fixture that happened to clear one rung would let the case
 * pass on that rung rather than on the guaranteed one.
 */
const THE_SMALLEST_POSSIBLE_ORIGINAL = { width: 1, height: 1 } as const

/** The three ladders that resolve a media row to ONE whole photograph. */
const UNCROPPED_LADDERS: readonly { readonly file: string; readonly declaration: RegExp }[] = [
  // The lightbox. `object-fit: contain`, one photograph, letterboxed.
  {
    file: 'apps/web/lib/readGalleryBundle.ts',
    declaration: /const FULL_TIERS: readonly DerivativeTier\[\] = \[([^\]]*)\]/,
  },
  // The download. The reader's own copy of that photograph.
  { file: 'apps/web/lib/readGalleryDownload.ts', declaration: /const DOWNLOAD_TIERS = \[([^\]]*)\] as const/ },
  // Every in-book slot. `object-fit: cover` into the slot's own shape, at the
  // slot's own focal point - which can only choose between pixels the
  // derivative still has.
  { file: 'apps/web/lib/readBookBundle.ts', declaration: /const DERIVATIVE_PREFERENCE: [^=]*= \{([\s\S]*?)\n\}/ },
]

/** One single-quoted tier name inside an extracted declaration. */
const QUOTED_TIER = /'([^']+)'/g

/**
 * Every tier name a ladder declaration names.
 * @param ladder - The file to read and the declaration to find in it.
 * @returns The tier names, in the order the source spells them.
 * @throws {Error} When the declaration is no longer in the shape this file can
 *   read — which is the refactor being reported, not a test defect.
 */
const laddersTiers = (ladder: { readonly file: string; readonly declaration: RegExp }): readonly string[] => {
  const source = readFileSync(path.join(REPO_ROOT, ladder.file), 'utf8')
  const found = ladder.declaration.exec(source)
  if (found?.[1] === undefined) {
    throw new Error(`${ladder.file} no longer declares its tier ladder in a shape this case can read`)
  }
  return [...found[1].matchAll(QUOTED_TIER)].map(([, tier]) => tier ?? '')
}

describe('the configured derivative ladder', () => {
  it('offers an uncropped tier that an original of any size can produce', () => {
    const alwaysThere = configuredDerivatives().filter(
      (tier) => tier.geometry === 'uncropped' && isDerivable(tier, THE_SMALLEST_POSSIBLE_ORIGINAL),
    )

    expect(
      alwaysThere.map((tier) => tier.name),
      'apps/web/collections/media.ts configures no uncropped tier that every original yields, so a photograph narrower than the width-only rungs has nothing uncropped to be served — MED-001.',
    ).not.toEqual([])
  })

  it('still configures cropped tiers, so the refusals below are refusing something', () => {
    // THE SENTINEL for both cases in the next block. A ladder of nothing but
    // uncropped tiers would satisfy them while proving nothing, and it would
    // also mean the square gallery grid had lost its rungs.
    expect(configuredDerivatives().filter((tier) => tier.geometry === 'cropped')).not.toEqual([])
  })
})

describe('every ladder that serves one whole photograph', () => {
  const uncropped = new Set(
    configuredDerivatives()
      .filter((tier) => tier.geometry === 'uncropped')
      .map((tier) => tier.name),
  )

  it.each(UNCROPPED_LADDERS)('names only uncropped tiers in $file', (ladder) => {
    const tiers = laddersTiers(ladder)

    // The sentinel on this side: an empty extraction would pass the refusal
    // below against no tiers at all.
    expect(tiers.length, `${ladder.file}'s ladder parsed to no tiers`).toBeGreaterThan(0)
    expect(
      tiers.filter((tier) => !uncropped.has(tier)),
      `${ladder.file} names a tier the media collection crops. A reader who asked for this photograph gets part of it — MED-001. Either the tier belongs in the uncropped set or it does not belong in this ladder.`,
    ).toEqual([])
  })
})

describe('isDerivable', () => {
  /**
   * A tier as the collection would configure it.
   * @param overrides - The fields this case cares about.
   * @returns A configured tier with defaults for the rest.
   */
  const aTier = (overrides: Partial<ConfiguredDerivative>): ConfiguredDerivative => ({
    name: 'probe',
    geometry: 'uncropped',
    width: undefined,
    height: undefined,
    withoutEnlargement: undefined,
    ...overrides,
  })

  it('generates a width-only tier from an original exactly that wide', () => {
    expect(isDerivable(aTier({ width: 1400 }), { width: 1400, height: 100 })).toBe(true)
  })

  it('omits a width-only tier from an original one pixel narrower', () => {
    expect(isDerivable(aTier({ width: 1400 }), { width: 1399, height: 4000 })).toBe(false)
  })

  it('generates a height-only tier from an original exactly that tall', () => {
    expect(isDerivable(aTier({ height: 1400 }), { width: 10, height: 1400 })).toBe(true)
  })

  it('omits a height-only tier from an original one pixel shorter', () => {
    expect(isDerivable(aTier({ height: 1400 }), { width: 4000, height: 1399 })).toBe(false)
  })

  it('generates a two-dimension tier from an original too small on only one axis', () => {
    // Payload omits a `cover` tier only when the original is smaller on BOTH
    // axes, which is why a width-axis test of one would be wrong.
    expect(isDerivable(aTier({ width: 800, height: 800, geometry: 'cropped' }), { width: 700, height: 900 })).toBe(true)
  })

  it('omits a two-dimension tier from an original too small on both axes', () => {
    expect(isDerivable(aTier({ width: 800, height: 800, geometry: 'cropped' }), { width: 799, height: 799 })).toBe(
      false,
    )
  })

  it('generates a tier that declines to enlarge, however small the original is', () => {
    expect(isDerivable(aTier({ width: 1400, withoutEnlargement: true }), THE_SMALLEST_POSSIBLE_ORIGINAL)).toBe(true)
  })

  it('generates a tier that insists on enlarging, however small the original is', () => {
    expect(isDerivable(aTier({ width: 1400, withoutEnlargement: false }), THE_SMALLEST_POSSIBLE_ORIGINAL)).toBe(true)
  })
})
