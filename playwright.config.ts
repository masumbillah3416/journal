/**
 * playwright.config.ts — browser test harness configuration.
 *
 * Backs four of CLAUDE.md §2's required suites: end-to-end (`e2e/*.spec.ts`
 * other than the ones named below), accessibility (`e2e/a11y.spec.ts`),
 * smoke/console instrumentation (`e2e/smoke.spec.ts`), and visual regression
 * (`e2e/visual.spec.ts`, via `toHaveScreenshot`). Also the engine
 * `test:e2e:headed` gives `sweeping-for-browser-defects`
 * (`.claude/skills/sweeping-for-browser-defects/SKILL.md`) for scripted,
 * repeatable sweeps.
 *
 * Three viewport projects — `desktop`, `mid`, `mobile` — match the
 * breakpoints named in the Task 12 brief (design spec §8.2): 1440×900,
 * 1000×800 and 390×844. All three run Chromium rather than mixing engines:
 * this environment's WebKit/Firefox binaries are an unverified download in
 * CI and are not needed to catch the class of defect this harness targets
 * (silent console/pageerror failures, a11y violations, pixel drift) — see
 * docs/testing.md's End-to-end section for the explicit scope note.
 *
 * `webServer` boots the real Next/Payload app (not a mock) against whatever
 * `DATABASE_URL` the environment provides — `apps/web/lib/env.ts` validates
 * it and throws at boot if it is missing, so a misconfigured environment
 * fails loudly here rather than producing a confusing navigation timeout.
 * Locally this is `npm run dev`, hitting the developer's own `diary`
 * database on port 5433; in CI (Task 12's second workflow job) it is
 * `npm run build && npm run start` against the job's migrated, seeded
 * Postgres service on port 5432 — a built app is what actually ships, and
 * `next start` is required for Lighthouse's production-mode assumptions
 * anyway (see lighthouserc.json).
 *
 * `toHaveScreenshot`'s `maxDiffPixelRatio` is deliberately small: the
 * handoff is a high-fidelity design (CLAUDE.md §2, visual regression row),
 * so pixel drift is treated as a defect, not tolerated as noise.
 * Depends on: @playwright/test.
 */
import { defineConfig, devices } from '@playwright/test'

const PORT = 3000
const baseURL = `http://localhost:${PORT}`

/** Shared browser test configuration for CI, local runs and headed sweeps. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // A test.only left in by accident must fail CI, not silently narrow the run.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  outputDir: 'test-results',
  use: {
    baseURL,
    // Kept only on failure — a passing run should not carry megabytes of
    // trace data, but a failing one needs full replay, not a screenshot.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  expect: {
    toHaveScreenshot: {
      // The design is high-fidelity (CLAUDE.md §2); a fraction of a percent
      // of drifted pixels is real drift, not anti-aliasing noise.
      maxDiffPixelRatio: 0.01,
    },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mid',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1000, height: 800 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],
  webServer: {
    command: process.env.CI
      ? 'npm run build -w apps/web && npm run start -w apps/web -- --port 3000'
      : 'npm run dev -w apps/web -- --port 3000',
    // `/` is not a route yet (only Phase 1 adds one) and 404s, which
    // Playwright's readiness poll does not treat as "up" — it waits for a
    // 2xx/3xx response. `/cms` (Payload's own admin) is the one route that
    // exists today, so it is what proves the server is actually serving
    // requests, not just that the process has started.
    url: `${baseURL}/cms`,
    // Next/Payload's first compile is slow; CI's production build is slower
    // still. reuseExistingServer lets a developer keep `npm run dev` running
    // in another terminal and iterate without Playwright restarting it.
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
