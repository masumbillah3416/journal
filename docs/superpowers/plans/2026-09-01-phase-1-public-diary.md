# Phase 1 — Public Diary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public diary — a book of 33 pages turned by a CSS-3D page flip, plus per-journey galleries, a lightbox, and a separate mobile reading mode — rendering from the seeded Phase 0 data.

**Architecture:** The server assembles one typed `BookBundle` from Payload and statically renders every page's content, so the deep links are indexable. The client takes over for scaling and flipping. The flip is a pure reducer over an injected clock, so its timing, latch and face-swap logic are unit-tested with no browser; Playwright's job narrows to proving the DOM reflects the machine.

**Tech Stack:** Next.js 15 App Router, React 19, Payload 3 Local API, TypeScript strict, Vitest, Playwright + axe-core, CSS 3D transforms (no animation library).

**Spec:** `docs/superpowers/specs/2026-08-31-travel-diary-design.md`
**Design source of record:** `handoff/design_handoff_travel_diary/SCREENS.md` §1, and `README.md`'s "The book — geometry and flip".

## Global Constraints

Copied verbatim from the spec, `CLAUDE.md`, and the handoff. Every task's requirements implicitly include these.

- TypeScript `strict`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- `any` is banned. No non-null assertions (`!`). Casts require a justifying comment.
- Coverage gates: `packages/domain/**` 100% lines/branches/functions; `apps/web/lib/**` 95%; repository-wide 90%. **No source file may be absent from every coverage `include`** (`CLAUDE.md` §2.1) — adding a directory means adding it to an include, with a real threshold, in the same commit.
- TDD is mandatory: the failing test exists first and must fail for the expected reason.
- **Every timing or concurrency assertion must be proven to FAIL when the mechanism it guards is removed.** Phase 0 shipped three tests that passed with their mechanism deleted. Paste both runs.
- Every module opens with a header naming what it does and the pattern it implements. Every exported symbol carries TSDoc.
- Repository content never leaves the machine (`CLAUDE.md` §7.1). An unavailable local tool means the verification is UNRESOLVED, not routed elsewhere.
- One logical change per commit, Conventional Commits with a _why_ body, ending `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **The design box is exactly 1300×860.** Every measurement in `SCREENS.md` §1 is absolute inside that box — the box scales, content never reflows.
- **Scale cap is 1.7×** (`MAX_SCALE` in `@travel-diary/tokens`).
- Colour, type and geometry values come from `@travel-diary/tokens`. Never hardcode a hex that exists there.
- **Handoff copy is final.** Never paraphrase, expand, correct, or make it more enthusiastic.
- Only `transform` and `opacity` are animated. Never a layout property.
- Diary route JS ≤180KB gzipped; LCP ≤2.5s; CLS ≤0.1; INP ≤200ms.

**Branch:** `feat/phase-1-public-diary`, cut from `main`.

## Explicitly out of scope, and why

**Motion clips in diary page slots.** Spec §8.1 specifies that any photo slot can hold a looping clip — the still as `poster`, the video over it with `autoplay muted loop playsinline preload="none"`, no controls and no play badge, playback started on `canplay` with the rejected promise swallowed. That is not built here.

The reason is a recorded decision, not an oversight: video is deferred (`docs/adr/0004-media-pipeline-mode.md`), `MEDIA_PIPELINE` defaults to `inline`, and no clip can enter the system until it flips to `worker`. Building a renderer for content that cannot exist would be untestable and unverifiable.

`PhotoMount` (Task 11) must therefore be built so a clip variant slots in later without restructuring: keep the mount, caption, washi and rotation independent of what fills the frame. When video is enabled, diary-slot clip rendering lands with it — and note the inversion it must respect, since it is easy to get backwards: **diary slots show no play badge and no controls; gallery tiles show both.**

---

## File Structure

| Path                                                | Responsibility                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| `packages/domain/src/flip.ts`                       | The flip state machine — pure reducer, injected clock                       |
| `packages/domain/src/bookScale.ts`                  | `min(w/1300, h/860)` capped at 1.7                                          |
| `packages/domain/src/bookBundle.ts`                 | Types + derivation: page numbers, counter, contents entries, bookmark spans |
| `packages/domain/src/pageStack.ts`                  | Derived z-index / visibility / pointer-events per leaf                      |
| `apps/web/lib/readBookBundle.ts`                    | Payload rows → `BookBundle` (the only serialization boundary)               |
| `apps/web/app/(diary)/layout.tsx`                   | Diary shell                                                                 |
| `apps/web/app/(diary)/p/[n]/page.tsx`               | Server-rendered page route                                                  |
| `apps/web/app/(diary)/gallery/[slug]/page.tsx`      | Gallery route                                                               |
| `apps/web/components/book/Book.tsx`                 | Frame, scaling, page stack container                                        |
| `apps/web/components/book/Leaf.tsx`                 | One leaf: front face, back face, travelling shade                           |
| `apps/web/components/book/useFlip.ts`               | Binds `flipMachine` to React + real clock                                   |
| `apps/web/components/pages/Cover.tsx` … `About.tsx` | The six page types                                                          |
| `apps/web/components/chrome/*`                      | Bookmark rail, bottom bar, ribbon                                           |
| `apps/web/components/gallery/*`                     | Grid, tile, lightbox                                                        |
| `apps/web/components/mobile/*`                      | Mobile reading mode — a separate tree, not media queries                    |

---

## Task 1: Carry-forward test infrastructure

Phase 0's final reviews recorded four requirements that become non-optional the moment real pages exist. They land first, so every later task is measured and guarded from its first commit.

**Files:**

- Modify: `playwright.config.ts`, `.github/workflows/ci.yml`, `lighthouserc.json`, `vitest.config.ts`, `vitest.integration.config.ts`
- Create: `e2e/support/axe.ts`, `docs/testing.md` (update)

**Interfaces:**

- Produces: `expectNoAxeViolations(page: Page, options?: { allow?: string[] }): Promise<void>` — defaults to the FULL ruleset with no exclusions.

- [ ] **Step 1: Move visual regression into a pinned Playwright Docker image**

Windows-generated `-win32.png` baselines cannot honestly compare against an Ubuntu runner. Both baseline generation and CI comparison must happen in one environment. Use `mcr.microsoft.com/playwright:v<version>` matching the installed Playwright version exactly — read it from `package-lock.json`, do not guess.

Delete the existing `e2e/visual.spec.ts-snapshots/*-win32.png` baselines and regenerate inside the image.

If the image pull fails in this environment, STOP and report it as unresolved. Do not fall back to committing Windows baselines.

- [ ] **Step 2: Take Lighthouse off `continue-on-error`**

In `.github/workflows/ci.yml`, remove `continue-on-error` from the Lighthouse step. In `lighthouserc.json`, point `collect.url` at the diary route `/p/1` (which Task 13 creates — until then it will fail, which is correct and is why this task runs before the pages exist rather than after).

Give the admin its own budget entry rather than sharing the diary's. `CLAUDE.md` §6 scopes LCP ≤2500ms to "diary, 4G" only; holding Payload's admin bundle to it was the reason the budget was informational.

- [ ] **Step 3: Add `apps/web/app/**` and `apps/web/components/**` to a coverage include**

Phase 1's server components and mappers land there. Phase 0 had three separate incidents of permanently-unmeasured code; `CLAUDE.md` §2.1 now forbids a file being in neither include. Add both directories to `vitest.config.ts`'s unit coverage include with honest thresholds.

Note `apps/web/lib/**`'s unit include currently widens to `.tsx` only under `lib/` — a `components/` tree would otherwise be unmeasured. This step is what closes that.

- [ ] **Step 4: Write the axe helper**

```ts
/**
 * axe — shared accessibility assertion for Playwright specs.
 *
 * Defaults to the FULL ruleset. The `/cms` spec disables two rules for
 * Payload's own generated markup; that exclusion is local to that spec and
 * must never be inherited here. Diary routes are held to everything.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/**
 * Asserts a page has zero axe violations.
 * @param page - The Playwright page to analyse.
 * @param options.allow - Rule ids to disable. Each requires a comment at the
 *   call site justifying it with evidence, never to silence an inconvenience.
 */
export const expectNoAxeViolations = async (page: Page, options: { allow?: readonly string[] } = {}): Promise<void> => {
  const builder = new AxeBuilder({ page })
  const scoped = options.allow ? builder.disableRules([...options.allow]) : builder
  const results = await scoped.analyze()

  expect(results.violations).toEqual([])
}
```

- [ ] **Step 5: Run the gate and commit**

Run: `npm run verify:full`
Expected: PASS. Lighthouse will fail in CI until Task 13 — note that in the commit body as intentional.

```
test(infra): land Phase 1's test carry-forwards before the code they guard

Phase 0's reviews recorded four requirements that only bind once real pages
exist. Landing them first means every page task is measured and guarded from
its first commit rather than retrofitted, which is how Phase 0 accumulated
three separate incidents of permanently-unmeasured code.

Visual regression moves into a pinned Playwright image because Windows
baselines cannot honestly compare against an Ubuntu runner. Lighthouse stops
being informational and gains a separate admin budget, since CLAUDE.md §6
scopes the 2500ms LCP target to the diary alone. The axe helper defaults to
the full ruleset so the /cms exclusions cannot be inherited by a diary route.

Tests: existing suites; Lighthouse intentionally red until the diary route lands.
Refs: Phase 0 final review carry-forwards
```

---

## Task 2: `bookScale`

**Files:**

- Create: `packages/domain/src/bookScale.ts`, `packages/domain/src/bookScale.test.ts`

**Interfaces:**

- Consumes: `DESIGN_BOX`, `MAX_SCALE` from `@travel-diary/tokens`.
- Produces: `bookScale(area: { width: number; height: number }): number`

- [ ] **Step 1: Write the failing test**

```ts
import { DESIGN_BOX, MAX_SCALE } from '@travel-diary/tokens/geometry'
import { describe, expect, it } from 'vitest'
import { bookScale } from './bookScale.js'

describe('bookScale', () => {
  it('is 1 when the area is exactly the design box', () => {
    expect(bookScale({ width: 1300, height: 860 })).toBe(1)
  })

  it('fits by width when the area is proportionally wider than tall', () => {
    // 650/1300 = 0.5, 860/860 = 1 -> the smaller wins, so the book fits.
    expect(bookScale({ width: 650, height: 860 })).toBeCloseTo(0.5, 6)
  })

  it('fits by height when the area is proportionally taller than wide', () => {
    expect(bookScale({ width: 1300, height: 430 })).toBeCloseTo(0.5, 6)
  })

  it('caps at 1.7 so the chrome outside the transform does not look undersized', () => {
    // A 4K viewport would otherwise scale the book ~2.4x while the bookmark
    // rail and bottom bar stay at fixed size.
    expect(bookScale({ width: 3840, height: 2160 })).toBe(MAX_SCALE)
  })

  it('never returns a negative or zero scale for a degenerate area', () => {
    expect(bookScale({ width: 0, height: 0 })).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/domain/src/bookScale.test.ts`
Expected: FAIL — `Cannot find module './bookScale.js'`.

- [ ] **Step 3: Implement**

```ts
/**
 * bookScale — resolution-independent sizing for the book.
 *
 * Pure function. The book is authored at exactly 1300x860 and scaled to fit
 * its container, so every page measurement in SCREENS.md is absolute and the
 * layout never reflows — it behaves like a printed page. Depends on tokens.
 */
import { DESIGN_BOX, MAX_SCALE } from '@travel-diary/tokens/geometry'

/** Smallest scale we will ever apply, so a zero-sized area cannot hide the book. */
const MIN_SCALE = 0.05

/**
 * The scale factor that fits the design box inside the given area.
 * @param area - Available space in CSS pixels.
 * @returns A factor between MIN_SCALE and MAX_SCALE.
 */
export const bookScale = (area: { width: number; height: number }): number => {
  const fit = Math.min(area.width / DESIGN_BOX.width, area.height / DESIGN_BOX.height)
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit))
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 5 tests, 100% coverage on the file.

- [ ] **Step 5: Commit**

```
feat(diary): add capped book scaling
```

Body must record that the 1.7 cap closes a gap the handoff lists as known: uncapped, a 3840px viewport scales the book ~2.4× while the bookmark rail and bottom bar sit outside the transform at fixed size.

---

## Task 3: The flip state machine

The single most important module in the project. Pure, clock-injected, so the latch and timing are testable without a browser.

**Files:**

- Create: `packages/domain/src/flip.ts`, `packages/domain/src/flip.test.ts`

**Interfaces:**

- Produces:

```ts
export type FlipPhase = 'idle' | 'arming' | 'turning' | 'swapped' | 'committing'
export type FlipDirection = 'forward' | 'backward'

export interface FlipState {
  readonly phase: FlipPhase
  readonly index: number
  readonly from: number | null
  readonly to: number | null
  readonly dir: FlipDirection | null
  readonly go: boolean
  readonly half: boolean
  readonly busy: boolean
  readonly startedAt: number | null
}

export type FlipEvent =
  | { readonly type: 'start'; readonly to: number; readonly now: number }
  | { readonly type: 'tick'; readonly now: number }

export interface FlipConfig {
  readonly durationMs: number
  readonly reducedMotion: boolean
}

export const ARM_MS = 30
export const SETTLE_MS = 40
export const initialFlipState: (index: number) => FlipState
export const flipReducer: (state: FlipState, event: FlipEvent, config: FlipConfig) => FlipState
```

Timings, from the handoff's flip sequence table, measured from `startedAt`:

| Offset                          | Transition                                                            |
| ------------------------------- | --------------------------------------------------------------------- |
| `0`                             | `arming` — `go: false`, `half: false`, `busy: true`                   |
| `ARM_MS` (30)                   | `turning` — `go: true`, CSS transition begins                         |
| `ARM_MS + duration/2`           | `swapped` — `half: true`, faces swap opacity                          |
| `ARM_MS + duration + SETTLE_MS` | `committing` → `idle` — `index = to`, flip cleared, **`busy: false`** |

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { ARM_MS, SETTLE_MS, flipReducer, initialFlipState, type FlipState } from './flip.js'

const config = { durationMs: 900, reducedMotion: false }
const start = (state: FlipState, to: number, now = 0): FlipState =>
  flipReducer(state, { type: 'start', to, now }, config)
const tick = (state: FlipState, now: number): FlipState => flipReducer(state, { type: 'tick', now }, config)

describe('flipReducer', () => {
  it('arms without moving, so the CSS transition has a frame to attach to', () => {
    const armed = start(initialFlipState(3), 4)

    expect(armed).toMatchObject({ phase: 'arming', go: false, half: false, busy: true, dir: 'forward' })
    expect(armed.index).toBe(3)
  })

  it('sets go at the arm boundary, which is what starts the transition', () => {
    const turning = tick(start(initialFlipState(3), 4), ARM_MS)

    expect(turning).toMatchObject({ phase: 'turning', go: true, half: false })
  })

  it('swaps the faces at the midpoint, because backface-visibility produced blank pages', () => {
    let state = tick(start(initialFlipState(3), 4), ARM_MS)
    state = tick(state, ARM_MS + config.durationMs / 2)

    expect(state).toMatchObject({ phase: 'swapped', half: true })
  })

  it('commits the index and RELEASES THE LATCH at the end', () => {
    let state = start(initialFlipState(3), 4)
    state = tick(state, ARM_MS + config.durationMs + SETTLE_MS)

    expect(state).toMatchObject({ phase: 'idle', index: 4, busy: false, from: null, to: null, dir: null })
  })

  it('ignores a second start while busy, so the book cannot be double-turned', () => {
    const armed = start(initialFlipState(3), 4)
    const ignored = start(armed, 9, 10)

    expect(ignored).toBe(armed)
  })

  it('accepts a new start once the latch has released', () => {
    let state = start(initialFlipState(3), 4)
    state = tick(state, ARM_MS + config.durationMs + SETTLE_MS)

    expect(start(state, 5, 2000)).toMatchObject({ phase: 'arming', from: 4, to: 5, busy: true })
  })

  it('records a backward direction when turning back', () => {
    expect(start(initialFlipState(5), 4)).toMatchObject({ dir: 'backward' })
  })

  it('releases the latch for ANY tick at or beyond the commit point', () => {
    // The handoff requires a latch that "always releases". A tick that
    // overshoots — a backgrounded tab, a slow frame — must still commit.
    for (const overshoot of [0, 1, 500, 10_000, 1_000_000]) {
      let state = start(initialFlipState(3), 4)
      state = tick(state, ARM_MS + config.durationMs + SETTLE_MS + overshoot)

      expect(state.busy, `overshoot ${String(overshoot)}ms left the book seized`).toBe(false)
      expect(state.index).toBe(4)
    }
  })

  it('is idempotent once idle, so stray ticks cannot corrupt the index', () => {
    let state = start(initialFlipState(3), 4)
    state = tick(state, ARM_MS + config.durationMs + SETTLE_MS)
    const settled = state

    expect(tick(settled, 99_999)).toBe(settled)
  })

  it('commits immediately with no rotation when reduced motion is requested', () => {
    const reduced = flipReducer(
      initialFlipState(3),
      { type: 'start', to: 4, now: 0 },
      {
        durationMs: 900,
        reducedMotion: true,
      },
    )

    expect(reduced).toMatchObject({ phase: 'idle', index: 4, busy: false, go: false, half: false })
  })

  it('honours a short duration without reordering the phases', () => {
    const fast = { durationMs: 400, reducedMotion: false }
    let state = flipReducer(initialFlipState(0), { type: 'start', to: 1, now: 0 }, fast)
    state = flipReducer(state, { type: 'tick', now: ARM_MS + 200 }, fast)

    expect(state).toMatchObject({ phase: 'swapped', half: true })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/domain/src/flip.test.ts`
Expected: FAIL — `Cannot find module './flip.js'`.

- [ ] **Step 3: Implement**

```ts
/**
 * flip — the page-turn state machine.
 *
 * State machine pattern: a pure reducer over an injected clock, so the timing,
 * the face swap and the busy latch are unit-tested with no browser and no
 * timers. The handoff specifies four explicit timers and "a `_busy` latch that
 * always releases"; expressing that as phases derived from elapsed time makes a
 * seized book unrepresentable rather than a bug to hunt. Depends on nothing.
 */

/** Delay before `go` flips true, so the browser has a frame to attach the transition to. */
export const ARM_MS = 30
/** Grace after the transition ends, before the index commits. */
export const SETTLE_MS = 40

/** Where a turn currently is in its lifecycle. */
export type FlipPhase = 'idle' | 'arming' | 'turning' | 'swapped' | 'committing'
/** Which way the leaf is travelling. */
export type FlipDirection = 'forward' | 'backward'

/** The complete state of the page stack at one instant. */
export interface FlipState {
  readonly phase: FlipPhase
  readonly index: number
  readonly from: number | null
  readonly to: number | null
  readonly dir: FlipDirection | null
  /** Drives the CSS transform; false during `arming` so the transition animates. */
  readonly go: boolean
  /** True past the midpoint: front and back faces swap opacity here. */
  readonly half: boolean
  /** The latch. True from `start` until the turn commits. */
  readonly busy: boolean
  readonly startedAt: number | null
}

/** What can happen to the machine. */
export type FlipEvent =
  | { readonly type: 'start'; readonly to: number; readonly now: number }
  | { readonly type: 'tick'; readonly now: number }

/** Reader-configurable behaviour. */
export interface FlipConfig {
  /** 400-1600, default 900, from the `book` global. */
  readonly durationMs: number
  /** When true, the page changes instantly with no rotation and no shade. */
  readonly reducedMotion: boolean
}

/** A settled machine resting on `index`. */
export const initialFlipState = (index: number): FlipState => ({
  phase: 'idle',
  index,
  from: null,
  to: null,
  dir: null,
  go: false,
  half: false,
  busy: false,
  startedAt: null,
})

const settled = (index: number): FlipState => initialFlipState(index)

/**
 * Advances the machine.
 * @param state - Current state.
 * @param event - A `start` request or a clock tick.
 * @param config - Duration and reduced-motion preference.
 * @returns The next state, or the same object when nothing changes.
 */
export const flipReducer = (state: FlipState, event: FlipEvent, config: FlipConfig): FlipState => {
  if (event.type === 'start') {
    // The latch. A turn in flight swallows further requests, which is what
    // stops a fast reader double-turning past a page.
    if (state.busy || event.to === state.index) return state
    if (config.reducedMotion) return settled(event.to)

    return {
      phase: 'arming',
      index: state.index,
      from: state.index,
      to: event.to,
      dir: event.to > state.index ? 'forward' : 'backward',
      go: false,
      half: false,
      busy: true,
      startedAt: event.now,
    }
  }

  if (state.startedAt === null || state.to === null) return state

  const elapsed = event.now - state.startedAt
  const halfAt = ARM_MS + config.durationMs / 2
  const commitAt = ARM_MS + config.durationMs + SETTLE_MS

  // Ordered latest-first so an overshooting tick — a backgrounded tab, a
  // dropped frame — still commits rather than stranding the latch.
  if (elapsed >= commitAt) return settled(state.to)
  if (elapsed >= halfAt) return state.half ? state : { ...state, phase: 'swapped', half: true }
  if (elapsed >= ARM_MS) return state.go ? state : { ...state, phase: 'turning', go: true }
  return state
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 11 tests, 100% lines/branches/functions.

- [ ] **Step 5: PROVE the latch test can fail**

A test that has never failed is unproven, and this is the assertion the whole book rests on. Temporarily change the commit branch to `if (elapsed >= commitAt) return { ...state, index: state.to }` — committing the index but leaving `busy` true.

Run: `npx vitest run packages/domain/src/flip.test.ts`
Expected: FAIL on "releases the latch for ANY tick at or beyond the commit point", with the overshoot message naming which overshoot seized the book.

Restore, re-run, confirm green. Paste both runs in the commit body.

- [ ] **Step 6: Commit**

```
feat(diary): add the page-flip state machine
```

Body must record: why it is a pure reducer (the latch and timing become unit-testable, and the handoff's "always releases" becomes a property rather than a hope); why phases derive from elapsed time rather than from chained timers (an overshooting tick still commits); and that the latch test was proven by breaking it.

---

## Task 4: Page-stack derivation

**Files:**

- Create: `packages/domain/src/pageStack.ts`, `packages/domain/src/pageStack.test.ts`

**Interfaces:**

- Consumes: `FlipState` from `./flip.js`.
- Produces: `leafPresentation(leafIndex: number, state: FlipState, totalPages: number): LeafPresentation` where

```ts
export interface LeafPresentation {
  readonly rotateDeg: number
  readonly zIndex: number
  readonly visible: boolean
  readonly interactive: boolean
  readonly frontOpacity: number
  readonly backOpacity: number
}
```

- [ ] **Step 1: Write the failing test**

These encode three defects the handoff records as having actually happened.

```ts
import { describe, expect, it } from 'vitest'
import { flipReducer, initialFlipState } from './flip.js'
import { leafPresentation } from './pageStack.js'

const config = { durationMs: 900, reducedMotion: false }
const TOTAL = 33

describe('leafPresentation', () => {
  it('rests turned pages at -180deg and untouched pages at 0deg', () => {
    const state = initialFlipState(3)

    expect(leafPresentation(2, state, TOTAL).rotateDeg).toBe(-180)
    expect(leafPresentation(5, state, TOTAL).rotateDeg).toBe(0)
  })

  it('stacks turned pages ascending and untouched pages descending', () => {
    const state = initialFlipState(3)

    expect(leafPresentation(0, state, TOTAL).zIndex).toBeLessThan(leafPresentation(1, state, TOTAL).zIndex)
    expect(leafPresentation(5, state, TOTAL).zIndex).toBeGreaterThan(leafPresentation(6, state, TOTAL).zIndex)
  })

  it('lifts the actively turning leaf above every other', () => {
    const turning = flipReducer(initialFlipState(3), { type: 'start', to: 4, now: 0 }, config)

    const others = [0, 1, 2, 5, 6].map((i) => leafPresentation(i, turning, TOTAL).zIndex)
    expect(leafPresentation(3, turning, TOTAL).zIndex).toBeGreaterThan(Math.max(...others))
  })

  it('hides every page that is not current, turning, or being revealed', () => {
    // Without this the reader sees stranded mirrored content from pages that
    // are neither here nor gone.
    const state = initialFlipState(3)

    expect(leafPresentation(3, state, TOTAL).visible).toBe(true)
    expect(leafPresentation(9, state, TOTAL).visible).toBe(false)
  })

  it('reveals the destination page while a turn is in flight', () => {
    const turning = flipReducer(initialFlipState(3), { type: 'start', to: 4, now: 0 }, config)

    expect(leafPresentation(4, turning, TOTAL).visible).toBe(true)
  })

  it('makes only the current page interactive, and never mid-flip', () => {
    // The handoff records a back face silently swallowing every click on page
    // content: Contents links and gallery buttons looked dead while their
    // handlers were fine.
    const idle = initialFlipState(3)
    const turning = flipReducer(idle, { type: 'start', to: 4, now: 0 }, config)

    expect(leafPresentation(3, idle, TOTAL).interactive).toBe(true)
    expect(leafPresentation(4, idle, TOTAL).interactive).toBe(false)
    expect(leafPresentation(3, turning, TOTAL).interactive).toBe(false)
  })

  it('swaps face opacity at the midpoint rather than using backface-visibility', () => {
    let state = flipReducer(initialFlipState(3), { type: 'start', to: 4, now: 0 }, config)
    expect(leafPresentation(3, state, TOTAL)).toMatchObject({ frontOpacity: 1, backOpacity: 0 })

    state = flipReducer(state, { type: 'tick', now: 30 + 450 }, config)
    expect(leafPresentation(3, state, TOTAL)).toMatchObject({ frontOpacity: 0, backOpacity: 1 })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`pageStack.ts` computes each field from `(leafIndex, state, totalPages)`:

- `rotateDeg`: `-180` when the leaf is before the current index or is the leaf turning forward past its midpoint; otherwise `0`.
- `zIndex`: turned `leafIndex + 1`; untouched `1000 - leafIndex`; the actively turning leaf `2000`.
- `visible`: `leafIndex === state.index`, or `leafIndex === state.from`, or `leafIndex === state.to`.
- `interactive`: `leafIndex === state.index && !state.busy`.
- `frontOpacity` / `backOpacity`: `state.half ? 0 : 1` and its inverse, for the turning leaf; `1` / `0` otherwise.

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 7 tests, 100% coverage.

- [ ] **Step 5: Commit**

```
feat(diary): derive leaf z-order, visibility and face opacity
```

Body must name the three handoff defects these rules prevent: swallowed clicks from an interactive back face, stranded mirrored content from unhidden pages, and blank pages from `backface-visibility`.

---

## Task 5: `BookBundle` — types and derivation

**Files:**

- Create: `packages/domain/src/bookBundle.ts`, `packages/domain/src/bookBundle.test.ts`

**Interfaces:**

- Consumes: branded ids from `./ids.js`.
- Produces: the `BookBundle`, `BookPage`, `ContentsEntry`, `BookmarkTab` types, plus `derivePages`, `deriveContents`, `deriveBookmarks`, `pageLabel`, `pageCounter`.

Everything the spec lists as derived is computed here and **never stored**: page numbers, the `03 / 33` counter, contents entries and their page numbers, bookmark tab spans, and media counts.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { deriveBookmarks, deriveContents, derivePages, pageCounter } from './bookBundle.js'
import { aJourney } from './testing/factories.js'

describe('derivePages', () => {
  it('assembles the reading sequence as Cover, Contents, journey pages, About', () => {
    const journeys = [aJourney({ slug: 'tokyo' }), aJourney({ slug: 'lisbon' })]

    const pages = derivePages(journeys)

    expect(pages.map((p) => p.kind)).toEqual([
      'cover',
      'contents',
      'notes',
      'frames-i',
      'frames-ii',
      'notes',
      'frames-i',
      'frames-ii',
      'about',
    ])
  })

  it('produces thirty-three pages for the seeded ten journeys', () => {
    // Cover + Contents + (10 x 3) + About. This is the handoff's "33 pages",
    // and it is derived here rather than stored — the database holds 30 rows.
    const journeys = Array.from({ length: 10 }, (_, i) => aJourney({ slug: `j${String(i)}` }))

    expect(derivePages(journeys)).toHaveLength(33)
  })
})

describe('deriveContents', () => {
  it('numbers each journey with the page its notes page occupies', () => {
    const journeys = [aJourney({ slug: 'tokyo' }), aJourney({ slug: 'lisbon' })]

    const entries = deriveContents(derivePages(journeys))

    // Cover is 1, Contents is 2, so the first journey's notes page is 3.
    expect(entries.map((e) => e.pageNumber)).toEqual([3, 6])
  })
})

describe('deriveBookmarks', () => {
  it('spans a journey tab across all three of its pages', () => {
    const journeys = [aJourney({ slug: 'tokyo' })]
    const tabs = deriveBookmarks(derivePages(journeys))
    const tokyo = tabs.find((t) => t.slug === 'tokyo')

    expect(tokyo).toMatchObject({ startIndex: 2, span: 3 })
  })

  it('gives Cover, Contents and About a span of one', () => {
    const tabs = deriveBookmarks(derivePages([aJourney({ slug: 'tokyo' })]))

    expect(tabs.filter((t) => t.span === 1).map((t) => t.kind)).toEqual(['cover', 'contents', 'about'])
  })

  it('omits a journey flagged hiddenFromBookmarks but keeps its pages', () => {
    const journeys = [aJourney({ slug: 'tokyo', hiddenFromBookmarks: true })]

    expect(deriveBookmarks(derivePages(journeys)).some((t) => t.slug === 'tokyo')).toBe(false)
    expect(derivePages(journeys)).toHaveLength(5)
  })
})

describe('pageCounter', () => {
  it('zero-pads both halves to the width of the total', () => {
    expect(pageCounter(3, 33)).toBe('03 / 33')
    expect(pageCounter(7, 120)).toBe('007 / 120')
  })
})
```

- [ ] **Step 2: Write the factory the tests consume**

`packages/domain/src/testing/factories.ts` — `aJourney(overrides?: Partial<Journey>): Journey`, a factory with overridable defaults, never a shared mutable object (`CLAUDE.md` §2.3).

- [ ] **Step 3: Run it and watch it fail**

Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

- [ ] **Step 5: Run it and watch it pass**

Expected: PASS, 8 tests, 100% coverage.

- [ ] **Step 6: Commit**

```
feat(diary): derive the reading sequence, contents and bookmark spans
```

Body must record that the 33-page reading sequence is derived from 30 stored rows plus the `book` and `about` globals, per `docs/deviations.md` §5, and that nothing here is persisted.

---

## Task 6: `readBookBundle` — the serialization boundary

**Files:**

- Create: `apps/web/lib/readBookBundle.ts`, `apps/web/lib/readBookBundle.integration.test.ts`

**Interfaces:**

- Consumes: `getPayload` from `./payload.js`; the derivation functions from Task 5.
- Produces: `readBookBundle(): Promise<BookBundle>` — the only place Payload rows become diary data. The diary client reads nothing else.

- [ ] **Step 1: Write the failing integration test**

Runs against `diary_test` via `getTestPayload()`, seeded by the Phase 0 seed.

```ts
it('returns the seeded ten journeys as thirty-three reading-sequence pages', async () => {
  const bundle = await readBookBundle()

  expect(bundle.pages).toHaveLength(33)
  expect(bundle.journeys).toHaveLength(10)
})

it('resolves each slot to a derivative URL, never an original', async () => {
  const bundle = await readBookBundle()
  const slots = bundle.pages.flatMap((page) => (page.kind === 'notes' ? page.slots : []))

  for (const slot of slots) {
    expect(slot.src).toMatch(/\/(thumb|tile|frame|hero|hero2x)\//)
  }
})

it('carries the focal point of each slot through, so a portrait is not cropped through the head', async () => {
  const bundle = await readBookBundle()
  const slot = bundle.pages.flatMap((p) => (p.kind === 'notes' ? p.slots : []))[0]

  expect(slot).toMatchObject({ focalX: expect.any(Number), focalY: expect.any(Number) })
})

it('sets depth explicitly rather than letting Payload walk the graph', async () => {
  // CLAUDE.md §7: select only the fields needed, set depth explicitly. A
  // default depth here pulls every relationship on every page load.
  const spy = vi.spyOn(await getPayload(), 'find')
  await readBookBundle()

  for (const call of spy.mock.calls) {
    expect(call[0]).toHaveProperty('depth')
  }
})

it('excludes soft-deleted and archived journeys from the book', async () => {
  // ... create a journey with deletedAt set, assert it is absent
})
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run it and watch it pass**

- [ ] **Step 5: Commit**

```
feat(diary): assemble the BookBundle from Payload
```

---

## Task 7: Book frame, scaling and the page stack

**Files:**

- Create: `apps/web/components/book/Book.tsx`, `Leaf.tsx`, `useFlip.ts`, `book.module.css`
- Test: `apps/web/components/book/useFlip.test.tsx`, `e2e/book.spec.ts`

**Interfaces:**

- Consumes: `flipReducer`, `leafPresentation`, `bookScale`, `BookBundle`.
- Produces: `<Book bundle={BookBundle} initialIndex={number} />`; `useFlip(initialIndex, config)` returning `{ state, turnTo, canGoBack, canGoForward }`.

Geometry, from the handoff — all inside the 1300×860 box:

- Dark board full bleed; 36px spine strip on the left with dashed stitch lines at x=9 and x=27
- 11px fore-edge page-stack strip on the right: `repeating-linear-gradient(90deg, #f2ebda 0 2px, #d9cdb4 2px 3px)`
- Page area inset `14px 18px 14px 36px`
- Container `perspective: 2800px`, `perspective-origin: 35% 50%`
- Each leaf `transform-origin: left center`, `transform-style: preserve-3d`
- **No `backface-visibility`** — it produced blank pages. Front and back faces swap opacity at the midpoint.
- **Back faces are always `pointer-events: none`.**
- Travelling shade: `linear-gradient(270deg, rgba(44,32,16,.42), rgba(44,32,16,.14) 26%, transparent 62%)`, `opacity {duration}ms ease-in-out`
- Transition: `transform {duration}ms cubic-bezier(.55,.06,.28,1)`

`useFlip` drives the reducer from `requestAnimationFrame`, not `setTimeout` — the machine is time-based, so a single rAF loop feeding `{ type: 'tick', now }` covers every transition and survives dropped frames.

Scaling: measure on mount, on `resize`, via `ResizeObserver` on the container, and after returning from a gallery. Apply `transform: scale(k)` with `transform-origin: center` on an element with explicit `width: 1300px; height: 860px`.

- [ ] **Step 1: Write the failing e2e test**

```ts
test('a click on page content is not swallowed by a back face', async ({ page }) => {
  // The handoff records this exact defect: Contents links and gallery buttons
  // appeared dead while their handlers were fine.
  await page.goto('/p/2')
  const link = page.getByRole('link', { name: /Tokyo/ })

  await link.click()

  await expect(page).toHaveURL(/\/p\/3/)
})

test('holds 60fps by animating only transform and opacity', async ({ page }) => {
  await page.goto('/p/1')
  const animated = await page.evaluate(() => {
    const leaf = document.querySelector('[data-leaf]')
    if (leaf === null) return []
    return getComputedStyle(leaf)
      .transitionProperty.split(',')
      .map((s) => s.trim())
  })

  expect(animated.every((p) => p === 'transform' || p === 'opacity' || p === 'none')).toBe(true)
})

test('the book rescales when the viewport changes', async ({ page }) => {
  await page.goto('/p/1')
  const before = await page.locator('[data-design-box]').evaluate((el) => getComputedStyle(el).transform)

  await page.setViewportSize({ width: 900, height: 700 })
  const after = await page.locator('[data-design-box]').evaluate((el) => getComputedStyle(el).transform)

  expect(after).not.toBe(before)
})
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — no such route yet.

- [ ] **Step 3: Implement the frame, scaling and stack**

- [ ] **Step 4: Run it and watch it pass**

- [ ] **Step 5: PROVE the click test can fail**

Remove `pointer-events: none` from the back face. Run the e2e suite. Expected: the Contents-link test FAILS. Restore, re-run, confirm pass. Paste both.

This is the assertion that most needs proving: the handoff records that when this was wrong, every handler looked broken and the cause took a debugging session to find.

- [ ] **Step 6: Commit**

```
feat(diary): render the book frame, scaling and page stack
```

---

## Task 8: Flip triggers, keyboard and reduced motion

**Files:**

- Modify: `apps/web/components/book/Book.tsx`
- Create: `apps/web/components/book/EdgeStrip.tsx`
- Test: `e2e/flip.spec.ts`

Triggers, from the handoff: the 44px right page-edge strip (`z-index: 900`), the 30px left strip, the bottom prev/next arrows, `ArrowLeft`/`ArrowRight`, `PageUp`/`PageDown`, and bookmark tabs.

**Bookmark jumps set an anchor page one step from the target, then flip**, so the animation always plays in the correct direction rather than spinning through the whole book.

- [ ] **Step 1: Write the failing tests**

```ts
test('turns forward on the right edge strip and back on the left', async ({ page }) => {
  await page.goto('/p/3')
  await page.locator('[data-edge="right"]').click()
  await expect(page).toHaveURL(/\/p\/4/)

  await page.locator('[data-edge="left"]').click()
  await expect(page).toHaveURL(/\/p\/3/)
})

test('turns with the keyboard', async ({ page }) => {
  await page.goto('/p/3')
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/\/p\/4/)
  await page.keyboard.press('PageUp')
  await expect(page).toHaveURL(/\/p\/3/)
})

test('a bookmark jump animates in the direction of travel', async ({ page }) => {
  await page.goto('/p/30')
  await page.getByRole('button', { name: /Tokyo/ }).click()

  await expect(page).toHaveURL(/\/p\/3/)
})

test('changes page instantly under prefers-reduced-motion', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('/p/3')

  await page.keyboard.press('ArrowRight')

  // No transition to wait out — the URL and content are correct immediately.
  await expect(page).toHaveURL(/\/p\/4/, { timeout: 200 })
})

test('rapid repeated turns cannot seize the book', async ({ page }) => {
  await page.goto('/p/1')
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowRight')

  // The latch swallows mid-flip requests; the book must still be usable.
  await page.waitForTimeout(1500)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-counter]')).not.toHaveText('01 / 33')
})
```

- [ ] **Step 2–4: Red, implement, green**

- [ ] **Step 5: Commit**

```
feat(diary): add flip triggers, keyboard control and reduced motion
```

---

## Task 9: Cover and Contents pages

**Files:**

- Create: `apps/web/components/pages/Cover.tsx`, `Contents.tsx`, and their CSS modules
- Test: `e2e/pages.spec.ts` + visual snapshots

Every measurement from `SCREENS.md` §1.1 and §1.2 is absolute. Two behaviours are logic, not styling, and get unit tests:

**Cover title fitting** — `fontSize = clamp(min, floor(0.9 × available / (titleLength × 0.4)), max)`. Caveat runs ~0.40em per character. The title must fit, never truncate; an ellipsis is a last-resort floor only. Put `fitTitleSize(text, availablePx)` in `packages/domain` and unit-test it, including a very long title and a one-word title.

**Contents column flow** — `columns = ceil(entryCount / 11)`, `gridTemplateRows: repeat(ceil(count / columns), 1fr)`, `columnGap: 34px`. Meta text is **hidden** in multi-column mode. Put `contentsLayout(entryCount)` in `packages/domain` and unit-test it: 11 entries → 1 column; 12 → 2; **31 → 4 columns × 8 rows** (the handoff's verified case).

- [ ] **Step 1: Write the failing unit tests for `fitTitleSize` and `contentsLayout`**
- [ ] **Step 2: Run, watch fail**
- [ ] **Step 3: Implement both, plus the two components**
- [ ] **Step 4: Run, watch pass**
- [ ] **Step 5: Add visual snapshots at all three viewports, and `expectNoAxeViolations` with NO exclusions**
- [ ] **Step 6: Commit** — `feat(diary): add the Cover and Contents pages`

---

## Task 10: Notes page

The most intricate page. `SCREENS.md` §1.3 is the source; follow it exactly.

**Files:**

- Create: `apps/web/components/pages/Notes.tsx`, `TallyTicket.tsx`, `EphemeraSlot.tsx`, `WeatherBadge.tsx`, `MoodBadge.tsx`

**The ephemera slot is load-bearing, not decoration.** The handoff explains why it exists: fixed content plus leftover height produced a dead band, and `justify-content: space-between` on the highlight list dumped 232px into two gaps when a journey had three highlights instead of four. The fix is a _media element_ taking the elastic space — `flex: 1`, `min-height: 54px` — that can absorb 54px or 300px without breaking. **Highlights are `flex: 0 0 auto` and sized to content; never distribute leftover space among them.**

- [ ] **Step 1: Write a failing layout test that encodes the defect**

```ts
test('a three-highlight journey does not open gaps between highlights', async ({ page }) => {
  await page.goto('/p/3')
  const highlights = page.locator('[data-highlight]')
  const count = await highlights.count()

  const gaps: number[] = []
  for (let i = 1; i < count; i += 1) {
    const prev = await highlights.nth(i - 1).boundingBox()
    const next = await highlights.nth(i).boundingBox()
    if (prev === null || next === null) throw new Error('highlight not laid out')
    gaps.push(next.y - (prev.y + prev.height))
  }

  // Spec: gap 13px. The recorded defect dumped 232px into two gaps.
  for (const gap of gaps) expect(gap).toBeLessThan(30)
})
```

- [ ] **Step 2–4: Red, implement, green**
- [ ] **Step 5: Visual snapshots + axe with no exclusions**
- [ ] **Step 6: Commit** — `feat(diary): add the Notes page`

---

## Task 11: Frames I, Frames II and About

**Files:**

- Create: `apps/web/components/pages/FramesI.tsx`, `FramesII.tsx`, `About.tsx`, `PhotoMount.tsx`, `WashiTape.tsx`, `PostageStamp.tsx`

Exact grids from `SCREENS.md` §1.4–1.6, including every rotation (−1.4° to +1.5°) — the rotations are specified per photo, not random.

`PhotoMount` applies the slot's focal point as `object-position: {focalX}% {focalY}%`. **If this is not wired through, the admin's focal-point picker is decorative** — the spec makes it a Phase 4 exit criterion for that reason, and the wiring lands here.

- [ ] **Step 1: Write the failing focal-point test**

```ts
test('a slot focal point moves the crop', async ({ page }) => {
  await page.goto('/p/4')
  const position = await page.locator('[data-slot="hero"] img').evaluate((el) => getComputedStyle(el).objectPosition)

  expect(position).not.toBe('50% 50%')
})
```

Seed a non-default focal point in the fixture so this asserts something real.

- [ ] **Step 2–4: Red, implement, green**
- [ ] **Step 5: Visual snapshots + axe**
- [ ] **Step 6: Commit** — `feat(diary): add the Frames and About pages`

---

## Task 12: Chrome — bookmark rail, bottom bar, ribbon

**Files:**

- Create: `apps/web/components/chrome/BookmarkRail.tsx`, `BottomBar.tsx`, `Ribbon.tsx`

Per `SCREENS.md` §1.7. The rail is 158px, scrollable, active tab shifts `translateX(-6px)` onto the page. **A journey tab is active when `index ∈ [start, start + 3)`**; Cover, Contents and About span 1. The bottom bar shows the `03 / 33` counter over the page label. The ribbon is `pointer-events: none` — it sits over the page and must never intercept a click.

Scrollbars are hidden throughout the diary (`scrollbar-width: none` plus the WebKit pseudo-element) — a visible scrollbar breaks the paper illusion. Content still scrolls.

- [ ] **Step 1: Write failing tests** — active-tab spanning across all three of a journey's pages; the ribbon not intercepting clicks; the counter matching the route.
- [ ] **Step 2–4: Red, implement, green**
- [ ] **Step 5: Commit** — `feat(diary): add the bookmark rail, bottom bar and ribbon`

---

## Task 13: Routing and static rendering

**Files:**

- Create: `apps/web/app/(diary)/layout.tsx`, `p/[n]/page.tsx`, `not-found.tsx`
- Modify: `lighthouserc.json` (the budget from Task 1 now binds)

Real paths, not hashes — the deep links must be indexable. `/p/<n>` is 1-indexed. `generateStaticParams` renders all 33; the client takes over for scaling and flipping. The URL is written on every turn: flip commit, mobile step, bookmark jump.

**Returning from a gallery restores `/p/<n>`, not `/`** — a reader who browses a gallery and copies the URL should still be sharing the page they were reading.

- [ ] **Step 1: Write the failing tests**

```ts
test('every page is server-rendered for indexability', async ({ request }) => {
  const html = await (await request.get('/p/3')).text()

  // Content must be in the HTML, not injected by script.
  expect(html).toContain('Tokyo')
})

test('an out-of-range page is a 404, not a crash', async ({ request }) => {
  expect((await request.get('/p/999')).status()).toBe(404)
})

test('returning from a gallery restores the page, not the cover', async ({ page }) => {
  await page.goto('/p/3')
  await page.getByRole('link', { name: /See full gallery/ }).click()
  await page.goBack()

  await expect(page).toHaveURL(/\/p\/3/)
})
```

- [ ] **Step 2–4: Red, implement, green**
- [ ] **Step 5: Confirm Lighthouse now passes against `/p/1`.** If LCP exceeds 2500ms, report the measurement — do NOT raise the budget.
- [ ] **Step 6: Commit** — `feat(diary): add diary routing and static rendering`

---

## Task 14: Gallery and lightbox

**Files:**

- Create: `apps/web/app/(diary)/gallery/[slug]/page.tsx`, `apps/web/components/gallery/Grid.tsx`, `Tile.tsx`, `Lightbox.tsx`

Per `SCREENS.md` §1.8–1.9. Grid `repeat(auto-fill, minmax({thumbSize}px, 1fr))`, `thumbSize` 140–300 default 200, tiles `aspect-ratio: 1/1`, `loading="lazy"`. **Virtualize past 100 tiles** (`CLAUDE.md` §6); the design tops out around 100 assets per journey, which is exactly where a naive grid starts to hurt.

Clips in the gallery **do** show a play badge and duration — the opposite of the diary pages, because here the reader is choosing what to open.

Lightbox: Escape closes, arrows step, Download must serve a derivative **through our own handler, never a bucket URL** (`SECURITY.md` — direct URLs invite enumeration of everything in the bucket, including hidden items). Share uses the Web Share API with a clipboard fallback and a toast.

- [ ] **Step 1: Write failing tests** — 61 tiles stay square and unsqueezed; Escape closes; arrows step; the download href is not a bucket URL; **selection is by id, so sorting does not desync the lightbox from the grid** (the handoff records this defect).
- [ ] **Step 2–4: Red, implement, green**
- [ ] **Step 5: Commit** — `feat(diary): add the gallery grid and lightbox`

---

## Task 15: Mobile reading mode

**Files:**

- Create: `apps/web/components/mobile/MobileDiary.tsx`, `MobileHeader.tsx`, `BookmarkDrawer.tsx`, `useSwipe.ts`
- Create: `packages/domain/src/swipe.ts`, `swipe.test.ts`

**A separate component tree, not media queries over the book.** The handoff says mobile mode replaces the book entirely — no flip, no scaling. Sharing DOM produces a scaled book fighting a scrolling column.

Breakpoint `< 860px`, measured into state on mount, on `resize`, and via `ResizeObserver`.

**Swipe commits only when `|dx| ≥ 60` AND `|dx| ≥ 1.4 × |dy|`**, so vertical scrolling never turns a page. That rule is pure logic — put it in `packages/domain/src/swipe.ts` and unit-test it exhaustively, including the diagonal cases either side of the 1.4 ratio.

- [ ] **Step 1: Write the failing swipe unit test**

```ts
describe('shouldTurnPage', () => {
  it('turns on a clear horizontal swipe', () => {
    expect(shouldTurnPage({ dx: -80, dy: 10 })).toBe('forward')
  })

  it('ignores a swipe shorter than the 60px threshold', () => {
    expect(shouldTurnPage({ dx: -59, dy: 0 })).toBe(null)
  })

  it('ignores a mostly-vertical drag, so scrolling never turns a page', () => {
    // 80px across but 60px down: 80 < 1.4 x 60, so it is a scroll.
    expect(shouldTurnPage({ dx: -80, dy: 60 })).toBe(null)
  })

  it('turns on a diagonal that clears the 1.4 ratio', () => {
    expect(shouldTurnPage({ dx: -80, dy: 40 })).toBe('forward')
  })

  it('turns backward on a rightward swipe', () => {
    expect(shouldTurnPage({ dx: 80, dy: 10 })).toBe('backward')
  })
})
```

- [ ] **Step 2–4: Red, implement, green**
- [ ] **Step 5: Add the mobile e2e suite at the 390×844 viewport** — drawer opens and closes, "Start reading" advances from the cover, swipe turns, vertical scroll does not.
- [ ] **Step 6: Visual snapshots at the mobile viewport + axe with no exclusions**
- [ ] **Step 7: Commit** — `feat(diary): add mobile reading mode`

---

## Phase 1 exit criteria

- [ ] `npm run verify:full` passes — output pasted
- [ ] `packages/domain/**` at 100% — report pasted
- [ ] All five browser suites pass, including visual regression **in the pinned Docker image**
- [ ] Lighthouse passes against `/p/1` with `continue-on-error` removed
- [ ] Every page type renders from seeded data at all three viewports
- [ ] The flip holds 60fps, animating only `transform` and `opacity`
- [ ] The latch test and the back-face click test have each been proven to fail when their mechanism is removed — both runs pasted
- [ ] A focal point set in the data visibly moves the crop
- [ ] Returning from a gallery restores `/p/<n>`
- [ ] A browser QA sweep is committed to `docs/qa/` per `CLAUDE.md` §10
- [ ] Every document in `CLAUDE.md` §1.2 affected by this phase is updated
