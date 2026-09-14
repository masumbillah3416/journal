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
 * THREE halves have to hold for the class to stay closed, and each has its own
 * case below: the collection must OFFER an uncropped tier that any original can
 * produce; the ladders must not NAME a cropped one; and the SET OF LADDERS must
 * be the set of files that actually read a derivative tier, so a fourth
 * consumer cannot arrive unclassified. The third was added after the first
 * review of this file pointed out that it inverted on tiers and enumerated on
 * ladders — and that the consumer this round found, `readBookBundle.ts`, is
 * exactly what a hand-written list of files misses.
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
 * rejected anti-patterns, and the standing order about enumerations). The
 * census does the same on the other axis: it reads the POPULATION of consumers
 * off the filesystem rather than trusting a list, so the failure mode is "you
 * have not said what this file draws", not silence.
 *
 * PATTERN (CLAUDE.md §3.3): none — file reads, one projection and three refusals.
 * Depends on: vitest, node:fs, node:path, node:url, ./derivativeGeometry.
 */
import { readdirSync, readFileSync } from 'node:fs'
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

/**
 * The ladders that resolve a media row to a SQUARE derivative on purpose.
 *
 * They are declared rather than asserted on: a grid tile is square by design
 * (SCREENS.md §1.8), and its `srcset` legitimately offers uncropped candidates
 * too, so there is no tier rule to check here. What this list exists for is the
 * census below — a file that walks tiers must appear in one of the two lists,
 * and this is how a deliberate square consumer says so out loud.
 */
const SQUARE_BY_DESIGN: readonly { readonly file: string; readonly declaration: RegExp }[] = [
  // The gallery grid. Square tiles, drawn at `object-fit: cover` with the
  // frame's own focal point.
  {
    file: 'apps/web/lib/readGalleryBundle.ts',
    declaration: /const TILE_TIERS: readonly DerivativeTier\[\] = \[([^\]]*)\]/,
  },
]

/**
 * Where a module that serves a media row could live. Every source root under
 * `apps/web`, because `media.sizes` is a Payload GENERATED type and nothing
 * outside this workspace has it.
 */
const SOURCE_ROOTS = ['lib', 'app', 'components', 'collections', 'globals', 'scripts'] as const

/** One single-quoted tier name inside an extracted declaration. */
const QUOTED_TIER = /'([^']+)'/g

/**
 * Every `.ts`/`.tsx` file under `apps/web`'s source roots that is not a test.
 * @returns Repository-relative paths, forward-slashed.
 */
const sourceFiles = (): readonly string[] => {
  const walk = (directory: string): readonly string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name)
      return entry.isDirectory() ? walk(full) : [full]
    })

  return SOURCE_ROOTS.flatMap((root) => walk(path.join(REPO_ROOT, 'apps/web', root)))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => path.relative(REPO_ROOT, file).split(path.sep).join('/'))
}

/**
 * A module's source with its comments removed.
 *
 * Comments are stripped because the census below asks whether a file READS a
 * derivative tier, and prose that merely names one is not a read: a sentence
 * mentioning `sizes.hero2x` in `lib/media/testing/ingestProbes.ts` matched the
 * pattern before this. Stripping can only remove text, so it cannot hide a real
 * read — the one shape it would miss is a string literal containing a comment
 * opener, which no file here has. The `[^:]` in the line-comment pattern is
 * what keeps `https://` from being read as one.
 * @param file - A repository-relative path.
 * @returns The file's source, comments blanked.
 */
const codeOf = (file: string): string =>
  readFileSync(path.join(REPO_ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Every source file that reads a media row's derivative map BY TIER — which is
 * the one shape a ladder walk takes, whether it indexes with a variable
 * (`sizes?.[tier]`) or names a rung outright (`sizes?.frame`).
 *
 * THE TIER NAMES COME FROM THE COLLECTION, not from a literal here, so the
 * census inverts on the same axis the rest of this file does: a rung added in
 * five years widens what counts as a read without anybody editing this.
 * @returns Repository-relative paths of every consumer.
 */
const derivativeReaders = (): readonly string[] => {
  const tiers = configuredDerivatives().map((tier) => tier.name)
  const readsATier = new RegExp(`sizes\\??\\.(\\[|${tiers.join('|')})`)
  return sourceFiles().filter((file) => readsATier.test(codeOf(file)))
}

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

describe('the census of derivative consumers', () => {
  it('classifies every file that reads a derivative tier, so a fourth consumer cannot arrive unnoticed', () => {
    // THE LADDER AXIS, INVERTED - and it is inverted because of what this
    // round found. The tier axis above refuses any rung the collection crops,
    // computed from the collection, so a rung added later is covered. The
    // LADDER axis was a hand-written list of three files, which is exactly the
    // shape that let MED-001 hide: the browser sweep named the lightbox and
    // the download, and `readBookBundle.ts` - a THIRD consumer of the same
    // fall-through, serving every in-book slot - was found only because
    // somebody went looking for one. A fourth would have passed a guard that
    // had never been told it existed.
    //
    // So the population is read off the filesystem instead. Every file under
    // `apps/web`'s source roots that reads `media.sizes` BY TIER must be
    // classified: either its ladder serves one whole photograph (checked
    // above) or it is square on purpose and says so. A fifth file cannot pass
    // silently - it fails here, by name, and somebody has to decide which it
    // is.
    const classified = new Set([...UNCROPPED_LADDERS, ...SQUARE_BY_DESIGN].map((ladder) => ladder.file))
    const readers = derivativeReaders()

    // THE SENTINEL, and it is the one that matters most here: a walk that
    // found nothing, or a pattern that matched nothing, would make the
    // comparison below pass against an empty set - a census that cannot see
    // its own population is worse than no census, because it reports "all
    // classified".
    expect(readers.length, 'the census found no consumer of media.sizes at all').toBeGreaterThan(0)
    expect(
      [...readers].sort(),
      'a file reads a media row by derivative tier and no list here says what it draws. If it serves ONE WHOLE PHOTOGRAPH, add it to UNCROPPED_LADDERS and its ladder will be checked; if it is square on purpose, add it to SQUARE_BY_DESIGN with the reason. Silence is how MED-001 reached a third consumer.',
    ).toEqual([...classified].sort())
  })

  it.each(SQUARE_BY_DESIGN)('finds the square-by-design ladder it claims is in $file', (ladder) => {
    // Without this, `SQUARE_BY_DESIGN` would be a free pass keyed on a
    // filename: a file could be classified square while carrying no such
    // declaration at all, and the census above would still be satisfied.
    expect(ladder.declaration.test(readFileSync(path.join(REPO_ROOT, ladder.file), 'utf8'))).toBe(true)
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
