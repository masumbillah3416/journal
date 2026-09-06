/**
 * route.ts — Payload's REST API, mounted at `/api/**` (`routes.api` default).
 * Depends on: `@payloadcms/next/routes`, `payload.config.ts`.
 *
 * Six re-exported Payload handlers; no logic of ours, and only reachable
 * from a real Next.js route request. Excluded from vitest.config.ts's
 * coverage (not a `c8 ignore` comment here — see that file's own comment for
 * why the in-source directive does not apply cleanly to this path).
 */
import config from '@payload-config'
import { REST_DELETE, REST_GET, REST_OPTIONS, REST_PATCH, REST_POST, REST_PUT } from '@payloadcms/next/routes'

export const GET = REST_GET(config)
export const POST = REST_POST(config)
export const DELETE = REST_DELETE(config)
export const PATCH = REST_PATCH(config)
export const PUT = REST_PUT(config)
export const OPTIONS = REST_OPTIONS(config)
