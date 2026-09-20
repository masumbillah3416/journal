/**
 * book.schema.test.ts — the one place SCREENS.md §2.6's two sliders and the
 * `book` global's own column constraints can be compared.
 *
 * ═══ WHY IT IS HERE AND NOT IN `packages/domain` ═══
 *
 * `journeys.schema.test.ts`'s reason, one collection over: SCREENS.md §2.6
 * gives "range 400–1600 step 50" and "140–300 step 10", `apps/web/globals/book.ts`
 * gives `min`/`max` on both columns, and the domain gives the constants the
 * admin's parse and its sliders are written against. The domain package must
 * never import from `apps/` (design spec §3), so the agreement can only be
 * asserted from this side, which may reach both.
 *
 * NEITHER SIDE IS A LITERAL TYPED IN THIS FILE. The left side is read off the
 * Payload config and the right side is the domain constant, so a check written
 * as `expect(...).toBe(400)` would stay green while the two drifted apart — and
 * the slider's `min` is the constant, so an author dragging to the end of the
 * track would then post a value the column refuses, on a screen that draws no
 * error at all (docs/deviations.md §60).
 *
 * `GALLERY_THUMB_SIZE` IS NOT A NEW CONSTANT AND THAT IS THE POINT. The public
 * gallery has clamped `galleryThumbPx` to 140–300 since Phase 1
 * (`packages/domain/src/gallery.ts`), so §2.6's slider reads that range rather
 * than declaring a second one; a range invented here would be the second source
 * of truth CLAUDE.md §2.1 keeps finding.
 *
 * A UNIT TEST, NOT AN INTEGRATION ONE: a global config is a plain object and
 * this file reads it without booting Payload, so the check belongs in the
 * pre-commit gate rather than in CI.
 *
 * Depends on: vitest, payload (types), @travel-diary/domain/bookBundle,
 * @travel-diary/domain/flip, @travel-diary/domain/gallery, ./book.
 */
import { JOURNEY_ORDER_MODES } from '@travel-diary/domain/bookBundle'
import { FLIP_DURATION_MS } from '@travel-diary/domain/flip'
import { GALLERY_THUMB_SIZE } from '@travel-diary/domain/gallery'
import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'
import { Book } from './book'

/**
 * The field the global declares under a name.
 * @param name - The column's name.
 * @returns The field config, or `undefined` when the global has no such field.
 */
const field = (name: string): Field | undefined =>
  Book.fields.find((candidate) => 'name' in candidate && candidate.name === name)

/**
 * A numeric column's own bounds, as the config states them.
 *
 * NARROWED BY `type` RATHER THAN BY `'min' in found`, which is what the sibling
 * collection test does for its own fields: Payload's `Field` union also has
 * `min`/`max` on its ARRAY arm, where both are deprecated aliases of
 * `minRows`/`maxRows`, so an `in` narrowing reads a deprecated member and the
 * lint gate refuses it. `type === 'number'` is also the honest question — a
 * column that stopped being a number has no range for a slider to offer.
 * @param name - The column's name.
 * @returns Its `min` and `max`, or `undefined` when it is not a number column.
 */
const bounds = (name: string): { readonly min: number | undefined; readonly max: number | undefined } | undefined => {
  const found = field(name)
  if (found?.type !== 'number') return undefined
  return { min: found.min, max: found.max }
}

describe('the book global’s schema', () => {
  it('bounds the page turn at the range §2.6’s slider offers', () => {
    expect(bounds('flipDurationMs')).toEqual({ min: FLIP_DURATION_MS.min, max: FLIP_DURATION_MS.max })
  })

  it('bounds the gallery thumbnail at the range the public gallery already clamps to', () => {
    expect(bounds('galleryThumbPx')).toEqual({ min: GALLERY_THUMB_SIZE.min, max: GALLERY_THUMB_SIZE.max })
  })

  it('defaults the page turn to the duration §2.6’s slider shows a book that has never set one', () => {
    // AGAINST THE COLUMN ONLY. `FLIP_DURATION_MS.default` is a transcription of
    // this `defaultValue` and makes no claim about the duration the diary turns
    // at — `useFlip.ts` still says 900, which is the disagreement
    // docs/deviations.md §82 records and deliberately does not settle.
    const found = field('flipDurationMs')

    expect(found?.type === 'number' ? found.defaultValue : undefined).toBe(FLIP_DURATION_MS.default)
  })

  it('defaults the gallery thumbnail to the size a book that has never set one gets', () => {
    const found = field('galleryThumbPx')

    expect(found?.type === 'number' ? found.defaultValue : undefined).toBe(GALLERY_THUMB_SIZE.default)
  })

  it('offers the three journey orders §2.6’s chips offer, and no fourth', () => {
    const mode = field('journeyOrderMode')

    expect(mode?.type === 'select' ? mode.options : undefined).toEqual([...JOURNEY_ORDER_MODES])
  })
})

describe('the two ranges themselves', () => {
  it('are the numbers SCREENS.md §2.6 prints, pinned as literals so the agreement above cannot move quietly', () => {
    // BOTH SIDES OF THE AGREEMENT MOVE TOGETHER, which is what makes the four
    // cases above unable to catch a range changed in both files at once. This
    // is the handoff's own text, written down once: "range 400–1600" and
    // "140–300".
    expect({ flip: FLIP_DURATION_MS, thumb: { min: GALLERY_THUMB_SIZE.min, max: GALLERY_THUMB_SIZE.max } }).toEqual({
      flip: { min: 400, max: 1600, default: 800 },
      thumb: { min: 140, max: 300 },
    })
  })
})
