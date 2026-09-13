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
 * ═══ WHAT THIS DOES NOT BUY, SAID HERE RATHER THAN ASSUMED ═══
 *
 * It fires when a tier IS ADDED and the constant is not widened. It cannot fire
 * when `grid` NEVER ARRIVES — nothing in a repository can notice work that was
 * never done. The brief's permanently-red `7` was buying that second
 * notification, and after Task 9 nothing in this repository buys it.
 *
 * SO IT IS AN OBLIGATION THAT IS OWED, NOT ONE THAT IS DISCHARGED, and this
 * paragraph said otherwise for one commit: it claimed the obligation was
 * "carried in Task 10's brief", which was a promise about a document that did
 * not exist. What is true is that it is recorded — in the phase ledger,
 * `.superpowers/sdd/2026-09-08-phase-3-media-pipeline/progress.md`, and in
 * that phase's Task 9 report — and that whoever writes Task 10 owes either the
 * tier or something that fails without it. A reader who needs `grid` to exist
 * should check that it does rather than trust this file.
 *
 * PATTERN (CLAUDE.md §3.3): none — two file reads and a comparison.
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
