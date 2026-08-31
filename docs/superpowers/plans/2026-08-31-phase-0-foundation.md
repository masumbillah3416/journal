# Phase 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the monorepo, database, adapters, design tokens, seeded content and the full nine-suite test harness, so every later phase has somewhere to land and a gate to pass.

**Architecture:** An npm-workspaces monorepo. `packages/domain` holds pure logic with no I/O and a 100% coverage gate; `packages/tokens` holds the handoff's design tokens as typed values and CSS variables; `apps/web` is Next 15 with Payload 3 in-process against Postgres. Storage, mail and the transcode queue are ports with local adapters, verified by one contract suite that later runs unchanged against the cloud implementations.

**Tech Stack:** Node 22, TypeScript 5 (strict), npm workspaces, Next.js 15, Payload CMS 3, Postgres 16 (Docker), Vitest, Playwright, axe-core, Lighthouse CI, Husky, lint-staged.

**Spec:** `docs/superpowers/specs/2026-08-31-travel-diary-design.md`

## Global Constraints

Copied verbatim from the spec and `CLAUDE.md`. Every task's requirements implicitly include these.

- TypeScript `strict`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- `any` is banned. No non-null assertions (`!`). Casts require a justifying comment.
- Coverage gates, enforced in config, CI fails below: `packages/domain/**` 100% lines/branches/functions; `apps/web/lib/**` 95%; repository-wide 90%.
- TDD is mandatory: the failing test exists first, and must fail for the expected reason.
- Every module opens with a header comment naming what it does and the pattern it implements.
- Every exported symbol carries TSDoc.
- Documentation ships in the same commit as the code it describes.
- One logical change per commit. Conventional Commits with a body explaining *why*. Every commit ends with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Never `git add -A` without reading the diff. Never `--no-verify`.
- Branded ids: `JourneyId`, `PageId`, `MediaId`, `SlotKey`. A `JourneyId` cannot be passed where a `PageId` belongs.
- Everything author-editable is keyed by journey id. Rows are addressed by id, never by array position.
- Soft delete (`deletedAt`) and drafts exist from the **first** migration.
- Free-text `dates` always travels with sortable `startsOn`.
- Handoff copy is final. Never replace it with lorem ipsum or make it more enthusiastic.
- Design box is exactly **1300×860**. Scale cap **1.7×**.
- Colour tokens are exact hex values from the handoff table — never approximated.

**Branch:** `feat/phase-0-foundation`, cut from `main`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `package.json` | Workspace roots, the `verify` gate, shared scripts |
| `tsconfig.base.json` | Compiler strictness inherited by every package |
| `vitest.config.ts` | Test projects and the per-layer coverage thresholds |
| `eslint.config.js` | Flat config: bans `any`, `!`, and `console` |
| `docker-compose.yml` | Postgres 16 for local development and tests |
| `.github/workflows/ci.yml` | Runs `verify` plus the browser suites |
| `packages/domain/src/ids.ts` | Branded identifier types and their constructors |
| `packages/domain/src/result.ts` | `Result<T, E>` for fallible operations at boundaries |
| `packages/domain/src/contrast.ts` | WCAG relative luminance and contrast ratio |
| `packages/tokens/src/colour.ts` | Every colour token from the handoff table |
| `packages/tokens/src/type.ts` | Font families, sizes, letter-spacing |
| `packages/tokens/src/geometry.ts` | Radii, padding, gaps, the design box |
| `packages/tokens/src/tokens.css` | The same values as CSS custom properties |
| `apps/web/payload.config.ts` | Payload configuration and collection registration |
| `apps/web/collections/*.ts` | One file per collection |
| `apps/web/lib/ports/*.ts` | Storage, mailer and queue interfaces |
| `apps/web/lib/adapters/*.ts` | Local implementations of each port |
| `apps/web/lib/adapters/contract/*.ts` | The shared suite every adapter must pass |
| `apps/web/scripts/placeholder.ts` | Striped SVG data-URI generator |
| `apps/web/scripts/seed.ts` | 10 journeys / 33 pages from the prototype |
| `playwright.config.ts` | Browser projects and viewports |

---

## Task 1: Workspace, toolchain and the verify gate

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc`, `.husky/pre-commit`, `.github/workflows/ci.yml`
- Create: `packages/domain/package.json`, `packages/domain/tsconfig.json`, `packages/domain/src/result.ts`
- Test: `packages/domain/src/result.test.ts`

**Interfaces:**
- Consumes: nothing — this is the first task.
- Produces: `npm run verify` (typecheck + lint + test + coverage gates, exit 0 on success). `Result<T, E>` = `{ ok: true; value: T } | { ok: false; error: E }`, with constructors `ok<T>(value: T): Result<T, never>` and `err<E>(error: E): Result<never, E>`, and a guard `isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T }`.

- [ ] **Step 1: Create the workspace root**

`package.json`:

```json
{
  "name": "travel-diary",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "typecheck": "tsc --build --force",
    "lint": "eslint . --max-warnings 0",
    "format": "prettier --write .",
    "test": "vitest",
    "test:run": "vitest run --coverage",
    "verify": "npm run typecheck && npm run lint && npm run test:run",
    "prepare": "husky"
  }
}
```

- [ ] **Step 2: Create the strict compiler baseline**

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "composite": true,
    "declaration": true
  }
}
```

- [ ] **Step 3: Create the coverage gates**

`vitest.config.ts`. The thresholds are the point of this file — they are what makes the gate real:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts', 'apps/web/lib/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/index.ts'],
      thresholds: {
        // Repository-wide floor.
        lines: 90, branches: 90, functions: 90,
        // Pure logic: every branch is a real behaviour, so every branch is covered.
        'packages/domain/src/**/*.ts': {
          lines: 100, branches: 100, functions: 100,
        },
        'apps/web/lib/**/*.ts': {
          lines: 95, branches: 95, functions: 95,
        },
      },
    },
  },
})
```

- [ ] **Step 4: Create the lint rules that enforce the standards**

`eslint.config.js` — these three rules are the ones `CLAUDE.md` §3.1 makes non-negotiable:

```js
import tseslint from 'typescript-eslint'

export default tseslint.config(
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-console': 'error',
    },
  },
  { ignores: ['**/dist/**', '**/.next/**', 'handoff/**', 'coverage/**'] },
)
```

- [ ] **Step 5: Write the failing test**

`packages/domain/src/result.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { err, isOk, ok } from './result.js'

describe('Result', () => {
  it('carries a value when the operation succeeded', () => {
    const result = ok(42)

    expect(isOk(result)).toBe(true)
    expect(result).toEqual({ ok: true, value: 42 })
  })

  it('carries an error when the operation failed', () => {
    const result = err('no such journey')

    expect(isOk(result)).toBe(false)
    expect(result).toEqual({ ok: false, error: 'no such journey' })
  })

  it('narrows to the success branch through the guard', () => {
    const result = ok('tokyo') as ReturnType<typeof ok<string>> | ReturnType<typeof err<string>>

    // The guard must narrow, or every caller needs a cast — which is banned.
    expect(isOk(result) ? result.value : null).toBe('tokyo')
  })
})
```

- [ ] **Step 6: Run the test and watch it fail**

Run: `npx vitest run packages/domain/src/result.test.ts`
Expected: FAIL — `Cannot find module './result.js'`.

- [ ] **Step 7: Write the minimal implementation**

`packages/domain/src/result.ts`:

```ts
/**
 * Result — the Result type pattern.
 *
 * Fallible operations at module boundaries return a Result rather than throwing,
 * so callers must handle failure to reach the value. Exceptions stay reserved for
 * genuinely exceptional conditions. Depends on nothing.
 */

/** A successful outcome carrying a value, or a failed one carrying an error. */
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E }

/**
 * Wraps a value as a successful Result.
 * @param value - The value the operation produced.
 */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

/**
 * Wraps an error as a failed Result.
 * @param error - What went wrong.
 */
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

/**
 * Narrows a Result to its success branch.
 * @param result - The Result to inspect.
 * @returns True when the operation succeeded, narrowing `result.value` for the caller.
 */
export const isOk = <T, E>(result: Result<T, E>): result is { readonly ok: true; readonly value: T } => result.ok
```

- [ ] **Step 8: Run the test and watch it pass**

Run: `npx vitest run packages/domain/src/result.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 9: Prove the coverage gate actually fails**

The gate is worthless if it has never rejected anything. Temporarily append an uncovered branch to `result.ts`:

```ts
export const unwrapOr = <T, E>(result: Result<T, E>, fallback: T): T => (result.ok ? result.value : fallback)
```

Run: `npm run test:run`
Expected: FAIL — coverage for `packages/domain/src/**` below the 100% threshold.

Now delete `unwrapOr` again (YAGNI — nothing calls it) and re-run.
Expected: PASS.

Record in the commit body that the gate was verified to fail. A gate you have not watched reject something is a hypothesis.

- [ ] **Step 10: Add the pre-commit hook and CI**

`.husky/pre-commit`:

```sh
npm run verify
```

`.github/workflows/ci.yml`:

```yaml
name: CI
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run verify
```

- [ ] **Step 11: Write the README**

`README.md` covering: what this is, prerequisites (Node 22, Docker), setup as copy-pasteable commands, and the command table from `CLAUDE.md` §11.

- [ ] **Step 12: Run the full gate and commit**

Run: `npm run verify`
Expected: PASS.

```bash
git add package.json tsconfig.base.json vitest.config.ts eslint.config.js .prettierrc .husky .github README.md packages/domain
git diff --staged
git commit
```

Commit message:

```
build(infra): scaffold workspace with enforced coverage gates

Standards only hold if something rejects violations automatically. This
lands the workspace together with the gate that enforces it, rather than
adding enforcement later once there is code that would fail it.

The domain layer carries a 100% threshold because every branch there is a
real behaviour; framework glue sits at 90-95% because chasing the last
percent produces tests that assert the framework. The gate was verified by
adding an uncovered export, watching the run fail, and removing it again.

Result is the first domain module: fallible boundary operations return
values rather than throwing, which keeps error handling reachable by the
type system instead of by convention.

Tests: Result construction and guard narrowing; coverage gate verified to reject.
Refs: CLAUDE.md sections 2.1 and 3.1

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

## Task 2: Standing documentation and ADRs

**Files:**
- Create: `docs/architecture.md`, `docs/testing.md`, `docs/deviations.md`, `docs/runbook.md`, `docs/security.md`, `docs/api.md`, `docs/data-model.md`
- Create: `docs/adr/0001-hosting-and-cost.md`, `docs/adr/0002-auth-mechanism.md`, `docs/adr/0003-derivative-generation.md`

**Interfaces:**
- Consumes: the spec's §2.1–2.3, §10, §13.
- Produces: the documentation set `CLAUDE.md` §1.2 requires to exist. Later tasks append to these rather than creating them.

- [ ] **Step 1: Write the three ADRs**

Each uses Context / Options considered / Decision / Consequences. Content comes from spec §2.1, §2.2, §13. `0001` must record that figures are August 2026 list prices needing re-verification, and that serving media through Vercel is the one cost trap.

- [ ] **Step 2: Write `docs/architecture.md`**

Include a Mermaid diagram of the four seams from spec §6, and state the rule that `packages/domain` never imports from `apps/`.

- [ ] **Step 3: Write `docs/deviations.md`**

The four deviations from spec §15, each with its rationale.

- [ ] **Step 4: Write `docs/security.md`**

Copy the 23-row table from spec §10 verbatim, with a "Discharged in" column left as `Phase N` until the code exists — these are forward references to planned work, not placeholders.

- [ ] **Step 5: Write `docs/testing.md`, `docs/runbook.md`, `docs/api.md`, `docs/data-model.md`**

`testing.md`: the nine suites, how to run each, how to add each. `runbook.md`: local setup, migrations, seeding, and a **restore drill** section — `SECURITY.md` calls an untested backup a hypothesis. `api.md` and `data-model.md` start with their structure and the collections from spec §5.

- [ ] **Step 6: Commit**

```bash
git add docs/
git commit -m "docs: add architecture, ADRs and the standing document set"
```

Use the full body format from `CLAUDE.md` §8.2.

---

## Task 3: Design tokens with contrast enforcement

**Files:**
- Create: `packages/tokens/package.json`, `packages/tokens/src/colour.ts`, `packages/tokens/src/type.ts`, `packages/tokens/src/geometry.ts`, `packages/tokens/src/tokens.css`
- Create: `packages/domain/src/contrast.ts`
- Test: `packages/domain/src/contrast.test.ts`, `packages/tokens/src/colour.test.ts`

**Interfaces:**
- Consumes: `Result` from Task 1 (not required, but available).
- Produces: `contrastRatio(foreground: string, background: string): number` and `composite(overlay: string, alpha: number, base: string): string`, both taking `#rrggbb`. `colour` — a frozen record whose keys are the handoff token names in camelCase (`paper`, `paperMount`, `inkMuted`, `creamDim`, `accent`, …). `DESIGN_BOX = { width: 1300, height: 860 }` and `MAX_SCALE = 1.7` from `geometry.ts`.

- [ ] **Step 1: Write the failing contrast test**

`packages/domain/src/contrast.test.ts`. The reference values are from WCAG 2.1:

```ts
import { describe, expect, it } from 'vitest'
import { composite, contrastRatio } from './contrast.js'

describe('contrastRatio', () => {
  it('reports the maximum ratio for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2)
  })

  it('reports the minimum ratio for a colour against itself', () => {
    expect(contrastRatio('#736247', '#736247')).toBeCloseTo(1, 2)
  })

  it('is symmetric — order of the pair does not change the ratio', () => {
    expect(contrastRatio('#736247', '#fbf6e9')).toBeCloseTo(contrastRatio('#fbf6e9', '#736247'), 6)
  })
})

describe('composite', () => {
  it('flattens a translucent overlay onto its base', () => {
    // 50% black over white is mid grey.
    expect(composite('#000000', 0.5, '#ffffff')).toBe('#808080')
  })

  it('returns the base when the overlay is fully transparent', () => {
    expect(composite('#000000', 0, '#fbf6e9')).toBe('#fbf6e9')
  })

  it('returns the overlay when it is fully opaque', () => {
    expect(composite('#a34434', 1, '#fbf6e9')).toBe('#a34434')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/domain/src/contrast.test.ts`
Expected: FAIL — `Cannot find module './contrast.js'`.

- [ ] **Step 3: Implement contrast**

`packages/domain/src/contrast.ts`:

```ts
/**
 * contrast — WCAG 2.1 relative luminance and contrast ratio.
 *
 * Pure functions over #rrggbb strings. Exists so the handoff's accessibility
 * claims about specific tokens are asserted by tests rather than trusted.
 * Depends on nothing.
 */

const parseChannels = (hex: string): readonly [number, number, number] => {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return [r, g, b]
}

/** Converts one 0-255 sRGB channel to its linear-light value, per WCAG 2.1. */
const linearise = (channel: number): number => {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * Relative luminance of a colour, per WCAG 2.1.
 * @param hex - Colour as `#rrggbb`.
 * @returns Luminance between 0 (black) and 1 (white).
 */
export const relativeLuminance = (hex: string): number => {
  const [r, g, b] = parseChannels(hex)
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b)
}

/**
 * Contrast ratio between two colours, per WCAG 2.1. Symmetric.
 * @returns A ratio from 1 (identical) to 21 (black on white).
 */
export const contrastRatio = (foreground: string, background: string): number => {
  const a = relativeLuminance(foreground)
  const b = relativeLuminance(background)
  const [lighter, darker] = a > b ? [a, b] : [b, a]
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Flattens a translucent overlay onto an opaque base, so an rgba() token can be
 * measured for contrast the same way an opaque one is.
 * @param overlay - Overlay colour as `#rrggbb`.
 * @param alpha - Overlay opacity, 0 to 1.
 * @param base - The opaque colour beneath it, as `#rrggbb`.
 */
export const composite = (overlay: string, alpha: number, base: string): string => {
  const front = parseChannels(overlay)
  const back = parseChannels(base)
  const blend = (i: 0 | 1 | 2): string =>
    Math.round(front[i] * alpha + back[i] * (1 - alpha))
      .toString(16)
      .padStart(2, '0')
  return `#${blend(0)}${blend(1)}${blend(2)}`
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run packages/domain/src/contrast.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing token accessibility test**

This is the test that makes the token file trustworthy. `packages/tokens/src/colour.test.ts`:

```ts
import { composite, contrastRatio } from '@travel-diary/domain/contrast'
import { describe, expect, it } from 'vitest'
import { colour } from './colour.js'

const WCAG_BODY_TEXT = 4.5

describe('colour tokens meet the handoff accessibility claims', () => {
  it('renders muted labels on paper above the body-text threshold', () => {
    // Handoff: ink-muted is "opaque - never an alpha of rgba(120,98,60,...)".
    // Measured 5.45:1. If this drops below 4.5, report it - do not lower the threshold.
    expect(contrastRatio(colour.inkMuted, colour.paper)).toBeGreaterThanOrEqual(WCAG_BODY_TEXT)
  })

  it('shows why the muted label must not be an alpha of the same brown', () => {
    // This is the mistake the handoff explicitly forbids. Measured 2.46:1.
    const asAlpha = composite('#78623c', 0.6, colour.paper)

    expect(contrastRatio(asAlpha, colour.paper)).toBeLessThan(WCAG_BODY_TEXT)
  })

  it('renders secondary sidebar text above the threshold at the lightest gradient stop', () => {
    // Handoff: cream-dim is "6.5:1 - do not lower". The sidebar is a gradient,
    // so the lightest stop is the worst case. Measured 6.09:1 there.
    const flattened = composite('#f3e7cd', 0.72, colour.sidebarFrom)

    expect(contrastRatio(flattened, colour.sidebarFrom)).toBeGreaterThanOrEqual(6)
  })

  it('renders body copy on paper above the body-text threshold', () => {
    expect(contrastRatio(colour.inkBody, colour.paper)).toBeGreaterThanOrEqual(WCAG_BODY_TEXT)
  })

  it('renders text on the accent fill above the body-text threshold', () => {
    expect(contrastRatio(colour.creamAlt, colour.accent)).toBeGreaterThanOrEqual(WCAG_BODY_TEXT)
  })
})
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run packages/tokens`
Expected: FAIL — `Cannot find module './colour.js'`.

- [ ] **Step 7: Write the token files**

`packages/tokens/src/colour.ts` — transcribe **every** row of the handoff's colour table exactly. Gradients become their stops (`paperFrom`/`paperTo`, `sidebarFrom`/`sidebarTo`). Include `journeyAccents` as a readonly tuple of the five tints and `coverCloths` as the four options.

```ts
/**
 * colour — the handoff's colour tokens, verbatim.
 *
 * Single source of truth for every colour in the product. Values are exact hex
 * from `handoff/design_handoff_travel_diary/README.md`, never approximated.
 * Accessibility claims about these values are asserted in colour.test.ts.
 */
export const colour = Object.freeze({
  paperFrom: '#fbf6e9',
  paperTo: '#f7f0df',
  paper: '#fbf6e9',
  paperMount: '#fffdf6',
  // ... every remaining row of the handoff table
  inkMuted: '#736247',
  creamAlt: '#fdf8ec',
  accent: '#a34434',
  accentHover: '#8c3327',
  sidebarFrom: '#3b332a',
  sidebarTo: '#2c251e',
} as const)
```

Also write `type.ts` (the three families, the diary and admin size scales, the `.14em`–`.42em` letter-spacing range) and `geometry.ts`:

```ts
/** The book is authored at this exact size and scaled to fit. Never change these. */
export const DESIGN_BOX = Object.freeze({ width: 1300, height: 860 } as const)

/**
 * Upper bound on book scaling. Uncapped, a 4K display scales the book ~2.4x while
 * the bookmark rail and bottom bar stay at fixed size outside the transform.
 */
export const MAX_SCALE = 1.7
```

- [ ] **Step 8: Run it and watch it pass**

Run: `npx vitest run packages/tokens`
Expected: PASS, 5 tests.

**If any assertion fails, stop and report the measured value.** Do not lower a threshold to make a test pass — the handoff states these ratios as requirements.

- [ ] **Step 9: Generate the CSS custom properties**

`packages/tokens/src/tokens.css` — the same values as `--td-*` custom properties. Values must match `colour.ts` exactly.

- [ ] **Step 10: Run the gate and commit**

Run: `npm run verify`

```
feat(tokens): add design tokens with asserted contrast ratios

The handoff states two accessibility requirements as prose - that ink-muted
must be opaque because alpha versions measure below 4.5:1, and that cream-dim
must not drop below its measured ratio. Prose does not survive a refactor, so
both are now tests over the real token values.

The second test deliberately constructs the mistake the handoff forbids and
asserts it fails, so the reason the rule exists stays visible to whoever next
wonders why the token is not simply an rgba.

Contrast maths lives in the domain package rather than in tokens, so it stays
pure and reusable when Phase 4 checks admin surfaces.

Tests: contrast ratio and compositing; five token pairs asserted against WCAG.
Refs: handoff README "Colour"; spec section 3

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

## Task 4: Branded identifiers

**Files:**
- Create: `packages/domain/src/ids.ts`
- Test: `packages/domain/src/ids.test.ts`

**Interfaces:**
- Consumes: `Result` from Task 1.
- Produces: types `JourneyId`, `PageId`, `MediaId`, `SlotKey`, each a `string & { readonly __brand: '<name>' }`. Constructors `journeyId(raw: string): Result<JourneyId, string>` and the same shape for the rest — they reject empty and whitespace-only input.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { journeyId, mediaId, pageId } from './ids.js'

describe('branded identifiers', () => {
  it('accepts a non-empty identifier', () => {
    const id = journeyId('tokyo-2025')

    expect(id).toEqual({ ok: true, value: 'tokyo-2025' })
  })

  it('rejects an empty identifier', () => {
    expect(journeyId('')).toEqual({ ok: false, error: 'JourneyId cannot be empty' })
  })

  it('rejects a whitespace-only identifier', () => {
    expect(pageId('   ')).toEqual({ ok: false, error: 'PageId cannot be empty' })
  })

  it('names the brand in its error, so the wrong constructor is obvious', () => {
    expect(mediaId('')).toEqual({ ok: false, error: 'MediaId cannot be empty' })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/domain/src/ids.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`ids.ts` uses a shared private factory so each brand's constructor is one line, and each carries TSDoc naming what it identifies. The brands must be distinct types — a `JourneyId` assigned to a `PageId` is a compile error.

- [ ] **Step 4: Add the compile-time assertion**

Type-level guarantees need a type-level test. In `ids.test.ts`:

```ts
it('does not permit one brand where another is expected', () => {
  // @ts-expect-error - a JourneyId is not a PageId, which is the entire point
  const wrong: PageId = 'tokyo-2025' as JourneyId
  expect(wrong).toBe('tokyo-2025')
})
```

`@ts-expect-error` fails the typecheck if the error stops occurring — so the branding cannot silently degrade.

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run packages/domain/src/ids.test.ts && npm run typecheck`
Expected: PASS, and typecheck clean.

- [ ] **Step 6: Commit**

```
feat(domain): add branded identifiers for journeys, pages and media
```

with a body explaining that the handoff records five defects from per-journey state held globally, and that distinct types make the confusion a compile error rather than a runtime surprise.

---

## Task 5: Postgres and Payload configuration

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `apps/web/package.json`, `apps/web/payload.config.ts`, `apps/web/lib/env.ts`, `apps/web/lib/payload.ts`
- Test: `apps/web/lib/env.test.ts`

**Interfaces:**
- Consumes: `Result` from Task 1.
- Produces: `parseEnv(raw: Record<string, string | undefined>): Result<Env, string>` and a module-level validated `env` with `DATABASE_URL`, `PAYLOAD_SECRET`, `MEDIA_ORIGIN`. From `apps/web/lib/payload.ts`: `getPayload(): Promise<Payload>`, memoised so repeated calls in tests reuse one connection.

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: diary
      POSTGRES_PASSWORD: diary
      POSTGRES_DB: diary
    ports: ['5432:5432']
    volumes: ['./.postgres-data:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U diary']
      interval: 5s
```

- [ ] **Step 2: Write the failing env validation test**

Environment variables are a trust boundary, so they are validated, and the validation is tested:

```ts
import { describe, expect, it } from 'vitest'
import { parseEnv } from './env.js'

describe('parseEnv', () => {
  it('accepts a complete environment', () => {
    const result = parseEnv({
      DATABASE_URL: 'postgres://diary:diary@localhost:5432/diary',
      PAYLOAD_SECRET: 'a'.repeat(32),
      MEDIA_ORIGIN: 'http://localhost:3001',
    })

    expect(result.ok).toBe(true)
  })

  it('rejects a missing database url rather than failing later at connect time', () => {
    const result = parseEnv({ PAYLOAD_SECRET: 'a'.repeat(32), MEDIA_ORIGIN: 'http://x' })

    expect(result).toEqual({ ok: false, error: expect.stringContaining('DATABASE_URL') })
  })

  it('rejects a short secret, which would weaken every session token', () => {
    const result = parseEnv({
      DATABASE_URL: 'postgres://x',
      PAYLOAD_SECRET: 'short',
      MEDIA_ORIGIN: 'http://x',
    })

    expect(result).toEqual({ ok: false, error: expect.stringContaining('PAYLOAD_SECRET') })
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run apps/web/lib/env.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `env.ts` with Zod**

Returns `Result<Env, string>` from `parseEnv`, and a module-level `env` that throws on import if invalid — failing at boot is correct here, because a mis-set secret must not reach a request.

- [ ] **Step 5: Write `payload.config.ts`**

Register `postgresAdapter` against `env.DATABASE_URL`, set `secret`, and move Payload's own admin to `/cms` with `admin: { disable: process.env.NODE_ENV === 'production' }`. Collections are added in Task 6.

- [ ] **Step 6: Verify the stack boots**

Run: `docker compose up -d && npm run dev -w apps/web`
Expected: Next serves, Payload initialises, `/cms` loads.

- [ ] **Step 7: Commit**

```
feat(db): add Postgres, Payload configuration and validated environment
```

Body must record that Payload's stock admin is moved to `/cms` and disabled in production because the bespoke panel from the design owns `/admin`.

---

## Task 6: Collections and the first migration

**Files:**
- Create: `apps/web/collections/media.ts`, `journeys.ts`, `pages.ts`, `users.ts`, `otpChallenges.ts`, `sessions.ts`
- Create: `apps/web/globals/book.ts`, `about.ts`, `site.ts`
- Modify: `apps/web/payload.config.ts`
- Test: `apps/web/collections/collections.test.ts` (integration, against the Docker database)

**Interfaces:**
- Consumes: `getPayload()` from Task 5.
- Produces: all collections registered and migrated. Later tasks query them by slug: `media`, `journeys`, `pages`, `users`, `otpChallenges`, `sessions`.

- [ ] **Step 1: Write the failing integration test**

These four assertions encode the structural rules from spec §5.1 that are painful to retrofit:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from '../lib/payload.js'

describe('collections', () => {
  let payload: Awaited<ReturnType<typeof getPayload>>
  beforeAll(async () => { payload = await getPayload() })

  it('soft-deletes journeys rather than removing rows', async () => {
    const created = await payload.create({
      collection: 'journeys',
      data: { name: 'Tokyo', place: 'Japan', slug: 'tokyo', dates: '12 - 24 March 2025' },
    })

    await payload.update({
      collection: 'journeys',
      id: created.id,
      data: { deletedAt: new Date().toISOString() },
    })
    const found = await payload.findByID({ collection: 'journeys', id: created.id })

    expect(found.deletedAt).not.toBeNull()
  })

  it('keeps drafts separate from published versions', async () => {
    const created = await payload.create({
      collection: 'journeys',
      data: { name: 'Bergen', place: 'Norway', slug: 'bergen', dates: '3 - 9 June 2025' },
      draft: true,
    })

    expect(created._status).toBe('draft')
  })

  it('caps highlights at four, because a fifth breaks the notes page rhythm', async () => {
    const attempt = payload.create({
      collection: 'journeys',
      data: {
        name: 'Marrakech', place: 'Morocco', slug: 'marrakech', dates: '1 - 8 May 2025',
        highlights: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }, { text: 'e' }],
      },
    })

    await expect(attempt).rejects.toThrow()
  })

  it('stores tally values as text, because several journeys say "plenty"', async () => {
    const created = await payload.create({
      collection: 'journeys',
      data: {
        name: 'Lisbon', place: 'Portugal', slug: 'lisbon', dates: '2 - 11 April 2025',
        tally: [
          { key: 'PASTEIS', value: 'nineteen' }, { key: 'TRAMS', value: 'plenty' },
          { key: 'STEPS', value: 'uncounted' }, { key: 'RAIN', value: 'none' },
        ],
      },
    })

    expect(created.tally?.[1]?.value).toBe('plenty')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run apps/web/collections`
Expected: FAIL — the `journeys` collection does not exist.

- [ ] **Step 3: Write the collections**

Transcribe `DATA_MODEL.md` exactly. Every field, every default, every index. Notably: `highlights` `maxRows: 4` in the schema not just the UI; `tally` `minRows: 4, maxRows: 4` with `value` as `text`; `deletedAt` indexed; `versions: { drafts: true }` on `journeys` and `pages`; `otpChallenges` access all `() => false` because it is server-only; `slots` carrying `focalX`/`focalY` because focal point belongs to the slot, not the media item.

- [ ] **Step 4: Generate and run the first migration**

Run: `npm run db:migrate:create -w apps/web -- initial` then `npm run db:migrate -w apps/web`

Read the generated SQL before committing it. Confirm `deletedAt` and the draft columns are present — spec §5.1 requires them in the **first** migration.

- [ ] **Step 5: Write the migration reversibility test**

First add the two helpers this needs, in `apps/web/lib/migrate.ts`:

```ts
/**
 * migrate — thin wrappers over Payload's migration runner.
 *
 * Exists so migration reversibility can be asserted by a test rather than
 * discovered during an incident. Depends on the Payload instance.
 */
import { getPayload } from './payload.js'

/** Rolls the most recent migration back. */
export const runMigrateDown = async (): Promise<void> => {
  const payload = await getPayload()
  await payload.db.migrateDown()
}

/** Applies all pending migrations. */
export const runMigrateUp = async (): Promise<void> => {
  const payload = await getPayload()
  await payload.db.migrate()
}
```

Then the test, in `apps/web/collections/collections.test.ts`:

```ts
import { runMigrateDown, runMigrateUp } from '../lib/migrate.js'

it('runs down and up again without loss', async () => {
  // A migration that cannot be reversed cannot be rolled back in an incident.
  await expect(runMigrateDown()).resolves.not.toThrow()
  await expect(runMigrateUp()).resolves.not.toThrow()

  const journeys = await payload.find({ collection: 'journeys', limit: 1 })
  expect(journeys).toBeDefined()
})
```

- [ ] **Step 6: Run it and watch it pass**

Run: `npx vitest run apps/web/collections`
Expected: PASS, 5 tests.

- [ ] **Step 7: Update `docs/data-model.md` and commit**

```
feat(db): add collections and the initial migration
```

Body must state that soft delete and drafts are in the first migration deliberately, per the handoff's warning that both are painful to retrofit.

---

## Task 7: Storage port and local adapter

**Files:**
- Create: `apps/web/lib/ports/storage.ts`, `apps/web/lib/adapters/local-storage.ts`
- Create: `apps/web/lib/adapters/contract/storage-contract.ts`
- Test: `apps/web/lib/adapters/local-storage.test.ts`

**Interfaces:**
- Consumes: `Result` from Task 1.
- Produces:

```ts
export interface StoragePort {
  put(key: string, body: Uint8Array, contentType: string): Promise<Result<void, string>>
  get(key: string): Promise<Result<Uint8Array, string>>
  delete(key: string): Promise<Result<void, string>>
  exists(key: string): Promise<boolean>
  signedUrl(key: string, expiresInSeconds: number): Promise<Result<string, string>>
}
```

and `storageContract(name: string, makeAdapter: () => Promise<StoragePort>): void` — a `describe` block later reused unchanged for the R2 adapter.

- [ ] **Step 1: Write the contract suite as the failing test**

The contract is written once and run against every adapter. That is the whole point of the port.

```ts
import { describe, expect, it } from 'vitest'
import type { StoragePort } from '../../ports/storage.js'

export const storageContract = (name: string, makeAdapter: () => Promise<StoragePort>): void => {
  describe(`StoragePort contract: ${name}`, () => {
    it('returns what was stored', async () => {
      const storage = await makeAdapter()
      const body = new TextEncoder().encode('tokyo')

      await storage.put('a/b.jpg', body, 'image/jpeg')
      const read = await storage.get('a/b.jpg')

      expect(read).toEqual({ ok: true, value: body })
    })

    it('fails rather than throwing when the key is absent', async () => {
      const storage = await makeAdapter()

      const read = await storage.get('missing.jpg')

      expect(read.ok).toBe(false)
    })

    it('reports absence before a write and presence after it', async () => {
      const storage = await makeAdapter()

      expect(await storage.exists('c.jpg')).toBe(false)
      await storage.put('c.jpg', new Uint8Array([1]), 'image/jpeg')
      expect(await storage.exists('c.jpg')).toBe(true)
    })

    it('removes an object so it is no longer readable', async () => {
      const storage = await makeAdapter()
      await storage.put('d.jpg', new Uint8Array([1]), 'image/jpeg')

      await storage.delete('d.jpg')

      expect(await storage.exists('d.jpg')).toBe(false)
    })

    it('rejects a key that escapes the namespace', async () => {
      const storage = await makeAdapter()

      // Path traversal must fail at the port, not at whichever adapter happens
      // to be configured - the R2 adapter will not have a filesystem to protect.
      const written = await storage.put('../escape.jpg', new Uint8Array([1]), 'image/jpeg')

      expect(written.ok).toBe(false)
    })
  })
}
```

`local-storage.test.ts` is then three lines calling `storageContract('local disk', ...)` against a temporary directory.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run apps/web/lib/adapters`
Expected: FAIL — port and adapter modules not found.

- [ ] **Step 3: Write the port**

`storage.ts` — the interface above, with TSDoc on every method, and a header naming the Ports & Adapters pattern.

- [ ] **Step 4: Write the local adapter**

`local-storage.ts` writes under a configured root. It must normalise and reject any key resolving outside that root — the traversal test is what proves it.

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run apps/web/lib/adapters`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```
feat(media): add storage port with a local disk adapter
```

Body: the contract suite exists so the R2 adapter in Phase 3 is verified by the same tests rather than by hope.

---

## Task 8: Mailer port and console adapter

**Files:**
- Create: `apps/web/lib/ports/mailer.ts`, `apps/web/lib/adapters/console-mailer.ts`, `apps/web/lib/adapters/contract/mailer-contract.ts`
- Test: `apps/web/lib/adapters/console-mailer.test.ts`

**Interfaces:**
- Produces:

```ts
export interface SentMessage { readonly to: string; readonly subject: string; readonly text: string }

export interface MailerPort {
  send(message: SentMessage): Promise<Result<void, string>>
  /** Full messages, for tests to read the code out of. Never printed. */
  readonly sent: readonly SentMessage[]
  /** Exactly what was written to the terminal — masked, and never carrying the body. */
  readonly logLines: readonly string[]
}
```

and `mailerContract(name: string, makeAdapter: () => Promise<MailerPort>): void`.

- [ ] **Step 1: Write the contract suite as the failing test**

One assertion here is a security requirement, not a convenience:

```ts
it('never records a full recipient address in its log output', async () => {
  const mailer = await makeAdapter()

  await mailer.send({ to: 'masum@example.com', subject: 'Your code', text: '123456' })

  // CLAUDE.md section 7: never log secrets, tokens, OTP codes or full addresses.
  expect(mailer.logLines.join('\n')).not.toContain('masum@example.com')
  expect(mailer.logLines.join('\n')).toContain('m***@example.com')
})

it('never records the message body, which carries the code', async () => {
  const mailer = await makeAdapter()

  await mailer.send({ to: 'a@b.com', subject: 'Your code', text: '123456' })

  expect(mailer.logLines.join('\n')).not.toContain('123456')
})
```

Plus: delivers to the recorded outbox, rejects a malformed address.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run apps/web/lib/adapters/console-mailer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the port and the console adapter**

The adapter keeps full messages in an in-memory outbox for tests, but its printed lines mask the address and omit the body. The OTP code must be retrievable by tests from the outbox and by the developer from the terminal — so the terminal line prints the code **only** when `NODE_ENV === 'development'`, and that branch is covered by a test.

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```
feat(auth): add mailer port with a masking console adapter
```

---

## Task 9: Queue port and Postgres adapter

**Files:**
- Create: `apps/web/lib/ports/queue.ts`, `apps/web/lib/adapters/postgres-queue.ts`, `apps/web/lib/adapters/contract/queue-contract.ts`
- Create: `apps/web/collections/jobs.ts`
- Test: `apps/web/lib/adapters/postgres-queue.test.ts`

**Interfaces:**
- Produces:

```ts
export interface QueuePort {
  enqueue(job: { kind: 'transcode'; mediaId: MediaId }): Promise<Result<string, string>>
  claim(): Promise<Result<ClaimedJob | null, string>>
  complete(jobId: string): Promise<Result<void, string>>
  fail(jobId: string, reason: string): Promise<Result<void, string>>
}
```

- [ ] **Step 1: Write the two fixtures the contract needs**

`apps/web/lib/adapters/contract/queue-fixtures.ts`:

```ts
/**
 * queue-fixtures — factories for the queue contract suite.
 *
 * Factories with overridable defaults, never shared mutable objects, per
 * CLAUDE.md section 2.3. Depends on the domain ids and the Payload instance.
 */
import { mediaId, type MediaId } from '@travel-diary/domain/ids'
import { getPayload } from '../../payload.js'

let counter = 0

/** A distinct MediaId per call, so parallel tests never collide. */
export const aMediaId = (): MediaId => {
  counter += 1
  const built = mediaId(`test-media-${String(counter)}`)
  if (!built.ok) throw new Error(built.error)
  return built.value
}

/** Reads a job row directly, to assert what the adapter persisted. */
export const jobRow = async (id: string): Promise<{ status: string; reason: string | null }> => {
  const payload = await getPayload()
  const row = await payload.findByID({ collection: 'jobs', id })
  return { status: row.status, reason: row.reason ?? null }
}
```

- [ ] **Step 2: Write the contract suite as the failing test**

The concurrency assertion is the one that matters — two workers must never process the same upload twice:

```ts
it('hands a job to exactly one claimant', async () => {
  const queue = await makeAdapter()
  await queue.enqueue({ kind: 'transcode', mediaId: aMediaId() })

  const [first, second] = await Promise.all([queue.claim(), queue.claim()])

  const claimed = [first, second].filter((r) => r.ok && r.value !== null)
  expect(claimed).toHaveLength(1)
})

it('returns null rather than blocking when nothing is queued', async () => {
  const queue = await makeAdapter()

  expect(await queue.claim()).toEqual({ ok: true, value: null })
})

it('records the reason a job failed, so the Media screen can show it', async () => {
  const queue = await makeAdapter()
  await queue.enqueue({ kind: 'transcode', mediaId: aMediaId() })
  const claim = await queue.claim()
  const job = claim.ok && claim.value !== null ? claim.value : null
  if (job === null) throw new Error('expected a claimable job')

  await queue.fail(job.id, 'ffprobe found no video stream')

  expect(await jobRow(job.id)).toMatchObject({ status: 'failed', reason: 'ffprobe found no video stream' })
})
```

- [ ] **Step 3: Run it and watch it fail**

Expected: FAIL — the `jobs` collection does not exist.

- [ ] **Step 4: Implement**

`claim()` uses `SELECT ... FOR UPDATE SKIP LOCKED` inside a transaction. That single clause is what makes the concurrency test pass, and it is why a Postgres table is sufficient here instead of a managed queue.

- [ ] **Step 5: Run it and watch it pass**

Expected: PASS, 3 tests.

- [ ] **Step 6: Add the migration for `jobs`, then commit**

```
feat(media): add queue port backed by a Postgres job table
```

Body: `FOR UPDATE SKIP LOCKED` gives single-claim semantics without a managed queue, which is unearned complexity for one author's bursty uploads.

---

## Task 10: Placeholder imagery

**Files:**
- Create: `apps/web/scripts/placeholder.ts`
- Test: `apps/web/scripts/placeholder.test.ts`

**Interfaces:**
- Produces: `stripedPlaceholder(options: { label: string; tint: string; width: number; height: number }): string` — an SVG data-URI of 45° stripes with a centred monospace label.

- [ ] **Step 1: Write the failing test**

```ts
describe('stripedPlaceholder', () => {
  it('names the slot it stands in for, so a missing photo is identifiable on the page', () => {
    const uri = stripedPlaceholder({ label: 'TOKYO A1', tint: '#3d817e', width: 800, height: 600 })

    expect(decodeURIComponent(uri)).toContain('TOKYO A1')
  })

  it('produces a data URI a browser will render directly', () => {
    const uri = stripedPlaceholder({ label: 'BERGEN HERO', tint: '#5a72a8', width: 400, height: 400 })

    expect(uri.startsWith('data:image/svg+xml,')).toBe(true)
  })

  it('uses the journey tint it was given', () => {
    const uri = stripedPlaceholder({ label: 'X', tint: '#a06b3e', width: 10, height: 10 })

    expect(decodeURIComponent(uri)).toContain('#a06b3e')
  })

  it('escapes a label containing markup characters', () => {
    // Labels come from seed data today, but this generator must not be the
    // thing that makes user-supplied text dangerous later.
    const uri = stripedPlaceholder({ label: '<script>', tint: '#736247', width: 10, height: 10 })

    expect(decodeURIComponent(uri)).not.toContain('<script>')
    expect(decodeURIComponent(uri)).toContain('&lt;script&gt;')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

45° stripes via `<pattern>`, the tint plus a lighter companion derived from it, and the label in a monospace face at the centre. Escape `&`, `<`, `>`, `"` before interpolation.

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```
feat(media): add striped placeholder generator for seed imagery
```

---

## Task 11: Seed data — 10 journeys, 33 pages

**Files:**
- Create: `apps/web/scripts/seed.ts`, `apps/web/scripts/seed-data.ts`
- Test: `apps/web/scripts/seed.test.ts`

**Interfaces:**
- Consumes: collections from Task 6, `stripedPlaceholder` from Task 10, ids from Task 4.
- Produces: `npm run db:seed`. Seeded content later relied on by Phase 1's rendering tests.

- [ ] **Step 1: Write the failing test**

The page arithmetic is the assertion that matters — 33 is not arbitrary:

```ts
describe('seed', () => {
  it('creates the ten journeys the prototype ships with', async () => {
    await seed(payload)

    const journeys = await payload.find({ collection: 'journeys', limit: 100 })
    expect(journeys.totalDocs).toBe(10)
  })

  it('creates thirty-three pages - Cover, Contents, About, and three per journey', async () => {
    await seed(payload)

    const pages = await payload.find({ collection: 'pages', limit: 200 })
    // 3 global + (10 journeys x 3) = 33, matching the handoff's stated scale.
    expect(pages.totalDocs).toBe(3 + 10 * 3)
  })

  it('gives every journey exactly four tally metrics', async () => {
    await seed(payload)

    const journeys = await payload.find({ collection: 'journeys', limit: 100 })
    for (const journey of journeys.docs) {
      expect(journey.tally).toHaveLength(4)
    }
  })

  it('keeps the handoff copy verbatim', async () => {
    await seed(payload)

    const lisbon = await payload.find({
      collection: 'journeys', where: { slug: { equals: 'lisbon' } },
    })
    // The voice is deliberate and final. If this ever needs changing, the
    // handoff changed - not the seed.
    expect(lisbon.docs[0]?.tally?.[0]).toMatchObject({ value: 'nineteen' })
  })

  it('is idempotent, so re-seeding does not duplicate a journey', async () => {
    await seed(payload)
    await seed(payload)

    const journeys = await payload.find({ collection: 'journeys', limit: 100 })
    expect(journeys.totalDocs).toBe(10)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — module not found.

- [ ] **Step 3: Extract the seed content from the prototype**

Read `handoff/design_handoff_travel_diary/Travel Diary.dc.html` and lift the journey data verbatim into `seed-data.ts` as a typed constant: name, place, slug, dates, weather, mood, glyph, stamp, accent, sign-off, highlights, note, tally.

**Copy is transcribed exactly.** "nineteen tarts, no regrets" and "the map was wrong by evening" are content. Do not paraphrase, expand, or make anything more enthusiastic.

- [ ] **Step 4: Implement the seed**

Upserts by slug so it is idempotent. Assigns the five journey accent tints round-robin. Creates three pages per journey — Notes, Frames I, Frames II — plus the global Cover, Contents and About. Slots get `stripedPlaceholder` URIs labelled with their slot name.

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run apps/web/scripts/seed.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```
feat(db): seed ten journeys and thirty-three pages from the prototype
```

Body: the seed is idempotent so it can be re-run during development, and the copy is transcribed verbatim because the handoff states the voice is final.

---

## Task 12: Browser test harness

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`, `e2e/a11y.spec.ts`, `lighthouserc.json`
- Modify: `package.json` (browser scripts), `.github/workflows/ci.yml`
- Create: `docs/qa/.gitkeep`

**Interfaces:**
- Consumes: the running app from Tasks 5, 6, 11.
- Produces: `npm run test:e2e`, `test:e2e:headed`, `test:visual`, `test:a11y`, `test:perf`. Viewport projects named `desktop` (1440×900), `mid` (1000×800), `mobile` (390×844) — the breakpoints from spec §8.2.

- [ ] **Step 1: Write the failing smoke test**

```ts
import { expect, test } from '@playwright/test'

test('serves the diary without console errors', async ({ page }) => {
  const errors: string[] = []
  // Most defects in this design are silent - a swallowed click, a missing
  // derivative. A sweep that only looks at pixels misses them.
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')

  expect(errors).toEqual([])
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx playwright test e2e/smoke.spec.ts`
Expected: FAIL — no Playwright config.

- [ ] **Step 3: Write `playwright.config.ts`**

Three viewport projects, `webServer` booting the dev server, traces retained on failure, and `toHaveScreenshot` configured with a small `maxDiffPixelRatio` — the design is high-fidelity, so drift is a defect.

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS across all three projects.

- [ ] **Step 5: Add the accessibility suite**

```ts
test('has no axe violations on the diary', async ({ page }) => {
  await page.goto('/')

  const results = await new AxeBuilder({ page }).analyze()

  expect(results.violations).toEqual([])
})
```

- [ ] **Step 6: Add Lighthouse budgets**

`lighthouserc.json` asserting the §12 budgets: LCP ≤2500ms, CLS ≤0.1, and the diary route JS budget.

- [ ] **Step 7: Wire all five into CI**

Extend `.github/workflows/ci.yml` with a second job running the browser suites against a built app with a seeded database.

- [ ] **Step 8: Update `docs/testing.md` and commit**

```
test(infra): add browser, accessibility and performance harnesses
```

Body: every suite instruments console and pageerror because the handoff's defect log is mostly silent failures that a screenshot cannot show.

---

## Phase 0 exit criteria

- [ ] `npm run verify` passes — output pasted
- [ ] Coverage report shows 100% on `packages/domain/**` — pasted
- [ ] All five browser suites pass — output pasted
- [ ] `docker compose up` then `npm run db:migrate && npm run db:seed` produces 10 journeys and 33 pages from a clean database
- [ ] Migration verified to run down and up again
- [ ] Every document in `CLAUDE.md` §1.2 exists with real content — no placeholders
- [ ] Three ADRs written
- [ ] The coverage gate has been watched to reject an uncovered file
- [ ] Every commit builds and passes on its own (`git bisect` stays useful)

When these hold, Phase 1 gets its own plan.
