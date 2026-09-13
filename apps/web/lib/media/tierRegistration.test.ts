/**
 * tierRegistration.test.ts — the one thing that goes red when a derivative
 * tier is added to the media collection, asserted to still be a thing.
 *
 * ═══ WHY A TEST ABOUT A TEST ═══
 *
 * Task 9's brief asked for a committed assertion that FAILS until Task 10 adds
 * the `grid` tier. CLAUDE.md §0.5 and §8.2 forbid that — every commit passes
 * its own tests, or `git bisect` stops working — so the notification was bought
 * a different way: `./ingestUpload.integration.test.ts` holds `CONFIGURED_TIERS`
 * as a HARD-CODED list and asserts the collection configures exactly it, so
 * adding a tier goes red until somebody widens the constant deliberately.
 *
 * That mechanism is real, and it rested entirely on nobody noticing that the
 * constant "duplicates" `configuredImageSizes()`. Deleting the duplication is a
 * tidy-up that looks like an improvement, passes `verify:full`, and silently
 * removes the only thing that fires when a tier is added — leaving two module
 * headers arguing for it in prose. This repository has been here: its own
 * `e2e/ciRegistration.test.ts` exists because "twice is enough; the convention
 * is now enforced rather than remembered" (Task 9 review, F2). This is the same
 * move for the same shape.
 *
 * ═══ WHY IT READS BOTH FILES AS TEXT ═══
 *
 * Importing the collection would pull `payload.config.ts`, `pg` and `sharp`
 * into the Docker-free pre-commit pass, which is the one thing
 * `vitest.config.ts`'s split exists to prevent — and importing the integration
 * suite would run it. Both files are read as SOURCE, the same way
 * `../auth/adminGuardRegistration.test.ts` reads route files and
 * `e2e/ciRegistration.test.ts` reads the workflow's `run:` lines. A text read
 * is also what lets the first case below say something an import could not: it
 * fails when `CONFIGURED_TIERS` stops being a literal at all, which is the
 * refactor it exists for.
 *
 * ═══ WHAT THE COMPARISON DOES NOT BUY, AND WHAT THE THIRD CASE DOES ═══
 *
 * The comparison fires when a tier IS ADDED and the constant is not widened. It
 * cannot fire when a tier NEVER ARRIVES: both sides would simply agree on a
 * shorter list. For one tier that mattered — ADR 0013's intermediate rung,
 * owed to this repository since Phase 1 and unnotified through Task 9 — the
 * third case below closes that hole from the other side. It asserts a PROPERTY
 * of the ladder rather than a name: that some rung covers the 658 device pixels
 * ADR 0013 measured a one-column gallery tile to need, below the `tile` width
 * it is a rung underneath. Deleting `grid` from the collection turns it red
 * whether or not `CONFIGURED_TIERS` is narrowed to match, which is the
 * notification Task 9 recorded as owed and Task 10 discharged.
 *
 * It buys that for ONE rung, the one an ADR measured. It still cannot notice a
 * tier nobody has decided on, and nothing can.
 *
 * PATTERN (CLAUDE.md §3.3): none — two file reads, a comparison, and one
 * property assertion over the ladder.
 * Depends on: vitest, node:fs, node:path, node:url.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

/** This directory, and the repository root four levels above it. */
const MEDIA_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(MEDIA_DIR, '../../../..')

/** The suite holding the hard-coded list, relative to the repository root. */
const SUITE_PATH = 'apps/web/lib/media/ingestUpload.integration.test.ts'

/** The collection configuring the tiers, relative to the repository root. */
const COLLECTION_PATH = 'apps/web/collections/media.ts'

/**
 * `CONFIGURED_TIERS`'s declaration, as a LITERAL array and nothing else.
 *
 * A derivation — `const CONFIGURED_TIERS = (await configuredTierNames())`, or
 * a spread of the collection — does not match, which is the whole point: this
 * pattern failing to find anything is the refactor being reported.
 */
const LITERAL_DECLARATION = /const CONFIGURED_TIERS = \[([^\]]*)\] as const/

/** One single-quoted entry inside that array. */
const QUOTED_ENTRY = /'([^']+)'/g

/** The `imageSizes` array in the collection, so the `fields` block's own `name:` keys are out of reach. */
const IMAGE_SIZES_BLOCK = /imageSizes: \[([\s\S]*?)\n\s*\],/

/** One configured size's name. */
const SIZE_NAME = /name: '([^']+)'/g

/**
 * Every string literal `CONFIGURED_TIERS` is declared with, sorted.
 * @returns The tier names as the suite spells them.
 * @throws When the declaration is not a literal array — see
 *   {@link LITERAL_DECLARATION}.
 */
const hardCodedTiers = (): readonly string[] => {
  const source = readFileSync(path.join(REPO_ROOT, SUITE_PATH), 'utf8')
  const declaration = LITERAL_DECLARATION.exec(source)
  if (declaration?.[1] === undefined) {
    throw new Error(`${SUITE_PATH} no longer declares CONFIGURED_TIERS as a literal array`)
  }
  return [...declaration[1].matchAll(QUOTED_ENTRY)].map(([, tier]) => tier ?? '').sort()
}

/**
 * Every tier name the media collection configures, sorted.
 * @returns The tier names as the collection spells them.
 * @throws When the collection configures no `imageSizes` block.
 */
const collectionTiers = (): readonly string[] => {
  const source = readFileSync(path.join(REPO_ROOT, COLLECTION_PATH), 'utf8')
  const block = IMAGE_SIZES_BLOCK.exec(source)
  if (block?.[1] === undefined) throw new Error(`${COLLECTION_PATH} has no imageSizes block to read`)
  return [...block[1].matchAll(SIZE_NAME)].map(([, name]) => name ?? '').sort()
}

test('keeps CONFIGURED_TIERS a hard-coded list, because a derived one notifies nobody', () => {
  const tiers = hardCodedTiers()

  // THE SENTINEL. A pattern that matched nothing would satisfy the comparison
  // below against a collection that configured nothing, so the list has to be
  // non-empty before its contents mean anything.
  expect(tiers.length, `${SUITE_PATH}'s CONFIGURED_TIERS parsed to no entries`).toBeGreaterThan(0)
  expect(tiers.every((tier) => tier.length > 0)).toBe(true)
})

test('finds the media collection’s own tier names, so the comparison is not against nothing', () => {
  // The same sentinel, on the other side. Both lists being empty is the one
  // way the case below could pass while guarding nothing at all.
  expect(collectionTiers().length, `${COLLECTION_PATH}'s imageSizes parsed to no entries`).toBeGreaterThan(0)
})

test('fails the moment a derivative tier is added to the collection and not to the suite', () => {
  expect(
    hardCodedTiers(),
    `${COLLECTION_PATH} and ${SUITE_PATH}'s CONFIGURED_TIERS disagree. Widen the constant deliberately — it is what goes red when a tier is added, and the only thing that does.`,
  ).toEqual(collectionTiers())
})

/**
 * The device pixels ADR 0013 measured a gallery tile to need: one column at
 * Lighthouse's 412 CSS px emulated viewport is a 376px tile, and at DPR 1.75
 * that is 658. Written here as the NUMBER THE DECISION RESTS ON rather than as
 * the 700 the collection answers it with, so the case below asks whether the
 * ladder still covers the need and not whether one literal still equals
 * another.
 */
const ADR_0013_DEVICE_PIXELS = 658

/** The width declared immediately after a configured size's name. */
const SIZE_NAME_AND_WIDTH = /name: '([^']+)',\s*width: (\d+)/g

/**
 * Every configured tier's name with the width the collection gives it.
 * @returns A name-to-width map, as the collection spells both.
 * @throws When the collection configures no `imageSizes` block.
 */
const collectionTierWidths = (): ReadonlyMap<string, number> => {
  const source = readFileSync(path.join(REPO_ROOT, COLLECTION_PATH), 'utf8')
  const block = IMAGE_SIZES_BLOCK.exec(source)
  if (block?.[1] === undefined) throw new Error(`${COLLECTION_PATH} has no imageSizes block to read`)
  const declared: [string, number][] = [...block[1].matchAll(SIZE_NAME_AND_WIDTH)].map(([, name, width]) => [
    name ?? '',
    Number(width),
  ])
  return new Map(declared)
}

test('keeps a derivative rung covering the gallery tile ADR 0013 measured, so the phone does not pay for the tile', () => {
  const widths = collectionTierWidths()
  const tile = widths.get('tile')

  // THE SENTINEL, and it is load-bearing rather than decorative: without a
  // `tile` width there is no ceiling, the filter below would admit `hero` and
  // `hero2x`, and this case would pass against a ladder with no rung at all.
  expect(tile, `${COLLECTION_PATH} configures no 'tile' tier to measure a rung against`).toBeGreaterThan(
    ADR_0013_DEVICE_PIXELS,
  )

  const rungs = [...widths].filter(([, width]) => width >= ADR_0013_DEVICE_PIXELS && width < (tile ?? 0))

  expect(
    rungs,
    `${COLLECTION_PATH} has no derivative tier between ${String(ADR_0013_DEVICE_PIXELS)} and ${String(tile)} pixels. ADR 0013 Option 3: a one-column gallery tile at 412 CSS px and DPR 1.75 needs ${String(ADR_0013_DEVICE_PIXELS)} device pixels, and without a rung here the browser correctly takes the ${String(tile)}px tile and the gallery pays for it. Removing that rung is a decision, not a tidy-up.`,
  ).not.toEqual([])
})
