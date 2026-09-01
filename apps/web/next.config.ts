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
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
