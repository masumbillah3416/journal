/**
 * payload.config.ts — Payload CMS configuration.
 *
 * The single source of truth for collections, globals and the Postgres adapter,
 * consumed by both the Payload Local API (`lib/payload.ts`) and the Payload CLI
 * (`npm run db:migrate*`, invoked with this file as its working directory).
 *
 * Payload's own admin UI is moved to `/cms` and disabled outright in production:
 * the bespoke admin panel from the design handoff owns `/admin` in a later phase,
 * so Payload's stock admin is a development scaffolding tool here, not the product.
 *
 * Collections and globals are registered in Task 6; this file starts with none.
 * Depends on: `@payloadcms/db-postgres`, `@payloadcms/richtext-lexical`, `payload`,
 * `sharp`, the validated `env` from `./lib/env.js`.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { env } from './lib/env'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: {
    // Deprecated in favour of deleting the Next.js `/admin` route directory
    // in production, per Payload's own guidance — kept anyway because this
    // config has no route directory yet (Task 5 predates the Next.js app
    // router wiring) and a config-level guarantee is the only one available
    // until that wiring exists.
    disable: process.env.NODE_ENV === 'production',
    importMap: { baseDir: dirname },
  },
  // `routes.admin` (not `admin.routes.admin`) sets the base path Payload's
  // own generated admin binds to. The design's bespoke panel owns `/admin`,
  // so Payload's stock admin moves to `/cms` and the two never collide.
  routes: { admin: '/cms' },
  collections: [],
  globals: [],
  editor: lexicalEditor(),
  secret: env.PAYLOAD_SECRET,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({
    pool: { connectionString: env.DATABASE_URL },
  }),
  sharp,
})
