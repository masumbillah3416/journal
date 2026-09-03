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
 * Collections and globals (Task 6) are transcribed from DATA_MODEL.md in their
 * own modules and registered here. `jobs` (Task 9) is this repository's own
 * addition, not part of DATA_MODEL.md - it backs the Postgres `QueuePort`
 * adapter and must be registered here for the Local API to reach it at all.
 * Depends on: `@payloadcms/db-postgres`, `@payloadcms/richtext-lexical`, `payload`,
 * `sharp`, the validated `env` from `./lib/env`, `./collections/*`, `./globals/*`.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { Media } from './collections/media'
import { Journeys } from './collections/journeys'
import { Pages } from './collections/pages'
import { Users } from './collections/users'
import { OtpChallenges } from './collections/otpChallenges'
import { Sessions } from './collections/sessions'
import { Jobs } from './collections/jobs'
import { About } from './globals/about'
import { Book } from './globals/book'
import { Site } from './globals/site'
import { env } from './lib/env'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: {
    user: Users.slug,
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
  collections: [Media, Journeys, Pages, Users, OtpChallenges, Sessions, Jobs],
  globals: [Book, About, Site],
  editor: lexicalEditor(),
  secret: env.PAYLOAD_SECRET,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({
    pool: { connectionString: env.DATABASE_URL },
    // Resolved from this file's own directory, not `process.cwd()` — the
    // Payload CLI runs from `apps/web` (`-w apps/web`) while Vitest's
    // integration project runs from the repo root, and both must resolve
    // to the same `apps/web/migrations` directory.
    migrationDir: path.resolve(dirname, 'migrations'),
    // Migrations are the only sanctioned way this schema changes (CLAUDE.md §7:
    // "All migrations are reversible and tested in both directions"). Dev-mode
    // schema "push" would let the Local API silently reconcile the database to
    // match this file on every boot, bypassing the migration that's supposed to
    // be the single, reviewed, reversible record of every schema change.
    push: false,
  }),
  sharp,
})
