/**
 * journeys.schema.test.ts — the one place the admin's highlight cap and the
 * database's can be compared.
 *
 * ═══ WHY IT IS HERE AND NOT IN `packages/domain` ═══
 *
 * `DATA_MODEL.md` caps `highlights` at four "in the schema, not just the UI",
 * SCREENS.md §2.3 prints "four maximum — they set the page rhythm", and
 * `@travel-diary/domain/admin/highlights` is the third place that number is
 * written. The domain package must never import from `apps/` (design spec §3),
 * so the agreement can only be asserted from this side, which may reach both.
 *
 * NEITHER SIDE IS A LITERAL `4` TYPED IN THIS FILE, and that is the whole
 * point: the left side is read off the Payload config, the right side is the
 * domain constant, and a check written as `expect(...).toBe(4)` would stay
 * green while the two drifted apart.
 *
 * A UNIT TEST, NOT AN INTEGRATION ONE: a collection config is a plain object
 * and this file reads it without booting Payload, so the check belongs in the
 * pre-commit gate rather than in CI (`users.lockout.test.ts` next door is the
 * same argument).
 *
 * Depends on: vitest, @travel-diary/domain/admin/highlights, ./journeys.
 */
import { MAX_HIGHLIGHTS } from '@travel-diary/domain/admin/highlights'
import { describe, expect, it } from 'vitest'
import { Journeys } from './journeys'

describe('the journeys schema', () => {
  it('caps highlights at the number the admin’s own editor caps them at', () => {
    const highlights = Journeys.fields.find((field) => 'name' in field && field.name === 'highlights')

    expect(highlights && 'maxRows' in highlights ? highlights.maxRows : undefined).toBe(MAX_HIGHLIGHTS)
  })
})
