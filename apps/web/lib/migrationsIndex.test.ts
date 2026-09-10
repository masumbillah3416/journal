/**
 * migrationsIndex.test.ts — unit coverage for the generated migrations barrel.
 *
 * `apps/web/migrations/index.ts` is a `payload migrate:create` barrel with
 * zero authored logic of its own: one import per migration and an array
 * literal wiring
 * each migration file's `up()`/`down()` to its own name. Nothing in this
 * repository imports it at runtime - Payload's own `readMigrationFiles`
 * explicitly filters `index.ts`/`index.js` out and reads every OTHER file
 * in `migrationDir` off disk directly (see
 * `node_modules/payload/dist/database/migrations/readMigrationFiles.js`),
 * so no integration test that runs a real migration ever executes this file
 * either. Left alone, it would be absent from both coverage passes' measured
 * set, which is exactly the failure CLAUDE.md §2.1 names ("an unmeasured
 * file looks exactly like a fully-covered one").
 *
 * This is that file's only test, and its only job is to prove the array is
 * right - the same function references, in the same order, under the same
 * names, as the migration files beside it. It needs neither Docker nor
 * a real Postgres connection (the migration files' own `up()`/`down()` are
 * never called here, only referenced), so it runs in the Docker-free `unit`
 * project, matched by that project's existing `apps/web/lib` test glob (no
 * new glob needed) - see `vitest.config.ts`'s coverage `include` for where
 * the barrel itself is measured.
 *
 * THIS FILE DELIBERATELY DOES NOT LIVE BESIDE THE BARREL IT TESTS, in
 * `apps/web/migrations/`. `readMigrationFiles` treats every file in
 * `migrationDir` ending `.ts`/`.js` as a migration to dynamically import,
 * UNLESS its name is exactly `index.ts`/`index.js` - it does not recognise
 * `*.test.ts` as anything special. A colocated `index.test.ts` was tried
 * first and broke every integration test that bootstraps Payload (each
 * self-migrates on first connect): `readMigrationFiles` picked the test file
 * up as if it were a migration and tried to `dynamicImport` it, which failed
 * resolving the test file's own extension-less `./index` import outside
 * Vitest's module resolution. Reproduced, not assumed - see
 * `vitest.integration.config.ts`'s coverage `exclude` comment for the same
 * note at the point a reader would look for it.
 */
import { describe, expect, it } from 'vitest'
import { migrations } from '../migrations/index'
import * as initial from '../migrations/20260831_154311_initial'
import * as addJobs from '../migrations/20260831_161951_add_jobs'
import * as addOtpSessionHash from '../migrations/20260905_202028_add_otp_session_hash'
import * as addSignInAttempts from '../migrations/20260905_230601_add_sign_in_attempts'
import * as addSessionExpiry from '../migrations/20260906_004937_add_session_expiry'
import * as addMediaState from '../migrations/20260910_171154_add_media_state'

describe('migrations barrel', () => {
  it('lists every migration, in order, wired to the right module', () => {
    expect(migrations).toEqual([
      { up: initial.up, down: initial.down, name: '20260831_154311_initial' },
      { up: addJobs.up, down: addJobs.down, name: '20260831_161951_add_jobs' },
      {
        up: addOtpSessionHash.up,
        down: addOtpSessionHash.down,
        name: '20260905_202028_add_otp_session_hash',
      },
      {
        up: addSignInAttempts.up,
        down: addSignInAttempts.down,
        name: '20260905_230601_add_sign_in_attempts',
      },
      {
        up: addSessionExpiry.up,
        down: addSessionExpiry.down,
        name: '20260906_004937_add_session_expiry',
      },
      {
        up: addMediaState.up,
        down: addMediaState.down,
        name: '20260910_171154_add_media_state',
      },
    ])
  })
})
