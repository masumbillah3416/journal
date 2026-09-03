/**
 * next.config.ts — Next.js configuration.
 *
 * Wrapped with Payload's `withPayload`, which wires Payload's webpack/turbopack
 * aliases and the `@payload-config` import used by the admin/API route handlers
 * under `app/(payload)/`. Depends on: `@payloadcms/next/withPayload`.
 */
import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Next 16 otherwise writes its own AGENTS.md/CLAUDE.md into apps/web on every
  // `next dev`, colliding in spirit with this repo's own CLAUDE.md (the actual
  // binding standards, at the repo root) and re-appearing after every deletion.
  agentRules: false,
  // THE DEV OVERLAY SITS ON TOP OF A PRODUCT CONTROL AT PHONE WIDTHS. Next's
  // development indicator is a fixed element at the bottom-left of the
  // viewport, which at 390px is exactly where SCREENS.md §1.10 puts the mobile
  // reading mode's 52px previous-page arrow - `<nextjs-portal>` intercepted
  // every click on it, so `e2e/mobile.spec.ts` and `e2e/layout.spec.ts` could
  // not be run locally at all while the same cases passed in CI, which builds
  // and serves with `next start` and has no overlay. A suite that only passes
  // on the runner is a suite a developer learns to skip (CLAUDE.md §11's
  // reasoning about gates), so the indicator is turned off rather than the
  // cases being taught to click around it.
  devIndicators: false,
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
