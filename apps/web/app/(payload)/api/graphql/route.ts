/**
 * route.ts — Payload's GraphQL endpoint, mounted at `/api/graphql`.
 * Depends on: `@payloadcms/next/routes`, `payload.config.ts`.
 */
import config from '@payload-config'
import { GRAPHQL_POST } from '@payloadcms/next/routes'

export const POST = GRAPHQL_POST(config)
