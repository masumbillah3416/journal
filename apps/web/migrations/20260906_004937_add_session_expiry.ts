import { sql } from '@payloadcms/db-postgres'
// Payload's `migrate:create` generates this import without `type` on
// MigrateUpArgs/MigrateDownArgs, which are interfaces with no runtime export.
// Node's built-in TypeScript type-stripping (unlike esbuild/tsx) does not
// infer that on its own, so the file as generated fails to load under plain
// `node`/the Payload CLI. Hand-fixed to a type-only import, and the unused
// `payload`/`req` destructured parameters below are underscore-prefixed for
// `noUnusedParameters`. See docs/data-model.md — this recurs for every
// migration this generator emits.
//
// The generated `up()` is also hand-fixed, for a reason the previous
// migrations did not have: as generated it was a single
// `ADD COLUMN "expires_at" ... NOT NULL` with no default, which succeeds only
// against a `sessions` table with no rows. That is true of every database
// today — nothing has ever written a session row — but it makes the migration
// irreversible in practice the moment one exists: `down()` drops the column,
// and the re-apply CLAUDE.md §7 requires would then fail on the surviving
// rows. Split into add-nullable, backfill, set-not-null so that up-down-up
// holds whatever the table contains.
//
// The backfill is `created_at`, which makes every row that predates the
// column expired the instant the column exists. That is the fail-closed
// choice and it is deliberate: a row with no recorded lifetime is a row whose
// lifetime is unknown, and inventing a generous one would hand a session an
// expiry nobody ever granted it. The cost is that such a reader signs in
// again; the alternative cost is a session that outlives the policy.
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db, payload: _payload, req: _req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sessions" ADD COLUMN "expires_at" timestamp(3) with time zone;
  UPDATE "sessions" SET "expires_at" = "created_at" WHERE "expires_at" IS NULL;
  ALTER TABLE "sessions" ALTER COLUMN "expires_at" SET NOT NULL;
  CREATE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");`)
}

export async function down({ db, payload: _payload, req: _req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "sessions_token_hash_idx";
  ALTER TABLE "sessions" DROP COLUMN "expires_at";`)
}
