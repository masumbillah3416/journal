/**
 * route.ts — GraphQL Playground, mounted at `/api/graphql-playground`.
 * Depends on: `@payloadcms/next/routes`, `payload.config.ts`.
 */
/* c8 ignore start -- a single re-exported Payload handler; no logic of ours,
 * and only reachable from a real Next.js route request. Wraps the imports
 * too, not just the export: this file is never imported by any test, so
 * every top-level statement (including the imports) would otherwise show as
 * an uncovered line. See vitest.config.ts's coverage include comment for
 * apps/web/app/**. */
import config from '@payload-config'
import { GRAPHQL_PLAYGROUND_GET } from '@payloadcms/next/routes'

export const GET = GRAPHQL_PLAYGROUND_GET(config)
/* c8 ignore stop */
