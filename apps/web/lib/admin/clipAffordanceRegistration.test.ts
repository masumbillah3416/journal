/**
 * clipAffordanceRegistration.test.ts — the journey editor hands its pool the
 * `MEDIA_PIPELINE` flag, and not a constant.
 *
 * ═══ WHY THE JOIN NEEDS A CASE OF ITS OWN ═══
 *
 * Design spec §9.3 puts "whether the admin shows clip-specific affordances
 * (video upload picker, poster field, duration display)" behind
 * `MEDIA_PIPELINE`. Phase 4 Task 7 built the journey pool's duration chip and
 * left the flag out; it was caught by somebody writing prose, not by a gate.
 * The fix (`a96fd50`) made two of the three links testable and left the third
 * where nothing could see it:
 *
 *   - `showsClipAffordances` — `packages/domain/src/media/ingestPolicy.test.ts`,
 *     including the case that pins it to `acceptedIngestTypes` rather than to
 *     the mode's name.
 *   - `JourneyPool`'s use of the prop — `JourneyPool.test.tsx`'s "draws no
 *     duration chip where this deployment cannot take a clip at all".
 *   - **The wire between them** — one line in
 *     `app/(admin)/admin/journeys/[id]/page.tsx`, inside that file's whole-file
 *     `c8 ignore`. A later task simplifying `showsClips={true}` while tidying an
 *     import leaves `verify:full` green and an `inline` deployment drawing
 *     duration chips for a file type it cannot accept: the original defect
 *     back, found the original way.
 *
 * That is this task's own doctrine turned on itself. `actions.ts` and
 * `slotMutations.ts` both say "a decision taken behind this file's `c8 ignore`
 * is a decision nothing measures", and `page.tsx` says the same about
 * `selectedSlot`, which is why that lives in the domain.
 *
 * ═══ WHY A FILE READ, AND WHAT IT IS NOT ═══
 *
 * The shape `lib/auth/adminGuardRegistration.test.ts` and
 * `e2e/ciRegistration.test.ts` already use twice: the honest subject is "what
 * does this route pass", and a route component cannot be rendered by either
 * Vitest project. Reading the source is reading the wire.
 *
 * IT IS NOT A SUBSTITUTE FOR BOOTING THE APP UNDER `MEDIA_PIPELINE=inline` and
 * asserting no `[data-pool-duration]` — that would be stronger, and it is more
 * than one prop join warrants. This case fails on the edit that would cause the
 * defect, which is what it is for.
 *
 * THE EXTRACTION FAILING IS ITSELF REPORTABLE, which is the other reason to
 * read text rather than to grep for a substring: a refactor that moves the prop
 * somewhere this file cannot see goes red rather than passing against nothing.
 *
 * Depends on: node:fs, node:path, node:url, vitest.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Where the route below is resolved from — `apps/web`. */
const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** The route that draws SCREENS.md §2.3, relative to {@link APP}. */
const EDITOR_ROUTE = 'app/(admin)/admin/journeys/[id]/page.tsx'

/**
 * The expression the editor route hands `JourneyPool`'s `showsClips` prop.
 *
 * @returns Whatever is inside the braces, whitespace collapsed.
 * @throws {Error} When the route no longer passes the prop in a shape this
 *   case can read — which is the refactor being reported, not a test defect.
 */
const showsClipsExpression = (): string => {
  const source = readFileSync(path.join(APP, EDITOR_ROUTE), 'utf8')
  const found = /showsClips=\{([^}]*)\}/u.exec(source)
  if (found?.[1] === undefined) {
    throw new Error(`${EDITOR_ROUTE} no longer passes showsClips in a shape this case can read`)
  }
  return found[1].replace(/\s+/gu, ' ').trim()
}

describe('the journey editor’s clip affordances', () => {
  it('hands the pool the configured pipeline, not a constant', () => {
    // THE WHOLE FINDING IN ONE ASSERTION. `showsClips={true}` — or `{false}`,
    // or any literal a tidy-up might leave behind — fails here, and nothing
    // else in the repository would notice.
    expect(showsClipsExpression()).toBe('showsClipAffordances(env.MEDIA_PIPELINE)')
  })

  it('reads the flag through the validated env module rather than out of the environment', () => {
    // `lib/env.ts` is where `MEDIA_PIPELINE` is parsed AND where `worker` is
    // refused at boot (the first of the two controls `collections/media.ts`'s
    // access rule is the second of). A route reaching into `process.env`
    // directly would walk past both.
    //
    // COMMENTS ARE STRIPPED FIRST, because this file's own prose says "never
    // `process.env` in a component" and a scan of the raw text finds it there.
    // `derivativeGeometry.test.ts` strips for the same reason and states it:
    // stripping can only REMOVE text, so it cannot hide a real read.
    const source = readFileSync(path.join(APP, EDITOR_ROUTE), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1')

    expect(source).toContain("from '../../../../../lib/env'")
    expect(code).not.toContain('process.env')
  })
})
