import { sql } from '@payloadcms/db-postgres'
// Payload's `migrate:create` generates this import without `type` on
// MigrateUpArgs/MigrateDownArgs, which are interfaces with no runtime export.
// Node's built-in TypeScript type-stripping (unlike esbuild/tsx) does not
// infer that on its own, so the file as generated fails to load under plain
// `node`/the Payload CLI. Hand-fixed to a type-only import, and the unused
// `payload`/`req` destructured parameters below are underscore-prefixed for
// `noUnusedParameters`. See docs/data-model.md — this is expected to recur
// for every migration this generator emits.
//
// The `DELETE FROM "otp_challenges"` line below is added by hand; the
// generated `ALTER`/`CREATE INDEX`/`DROP` statements are untouched. See the
// comment on it for why.
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db, payload: _payload, req: _req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM "otp_challenges";
  ALTER TABLE "otp_challenges" ADD COLUMN "session_hash" varchar NOT NULL;
  CREATE INDEX "otp_challenges_session_hash_idx" ON "otp_challenges" USING btree ("session_hash");`)
}

export async function down({ db, payload: _payload, req: _req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "otp_challenges_session_hash_idx";
  ALTER TABLE "otp_challenges" DROP COLUMN "session_hash";`)
}
