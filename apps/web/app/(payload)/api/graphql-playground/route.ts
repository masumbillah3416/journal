/**
 * route.ts — GraphQL Playground, mounted at `/api/graphql-playground`.
 * Depends on: `@payloadcms/next/routes`, `payload.config.ts`.
 */
import config from '@payload-config'
import { GRAPHQL_PLAYGROUND_GET } from '@payloadcms/next/routes'

export const GET = GRAPHQL_PLAYGROUND_GET(config)
