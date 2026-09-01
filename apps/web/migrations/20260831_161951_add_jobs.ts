import { sql } from '@payloadcms/db-postgres'
// Payload's `migrate:create` generates this import without `type` on
// MigrateUpArgs/MigrateDownArgs, which are interfaces with no runtime export.
// Node's built-in TypeScript type-stripping (unlike esbuild/tsx) does not
// infer that on its own, so the file as generated fails to load under plain
// `node`/the Payload CLI. Hand-fixed to a type-only import, and the unused
// `payload`/`req` destructured parameters below are underscore-prefixed for
// `noUnusedParameters`.
//
// The generated `down()` statement order is also hand-fixed (see the comment
// there): the up() SQL itself is untouched.
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db, payload: _payload, req: _req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_jobs_kind" AS ENUM('transcode');
  CREATE TYPE "public"."enum_jobs_status" AS ENUM('queued', 'claimed', 'completed', 'failed');
  CREATE TABLE "jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "enum_jobs_kind" NOT NULL,
  	"media_id" varchar NOT NULL,
  	"status" "enum_jobs_status" DEFAULT 'queued' NOT NULL,
  	"reason" varchar,
  	"claimed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "jobs_id" integer;
  CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");
  CREATE INDEX "jobs_updated_at_idx" ON "jobs" USING btree ("updated_at");
  CREATE INDEX "jobs_created_at_idx" ON "jobs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_jobs_fk" FOREIGN KEY ("jobs_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_jobs_id_idx" ON "payload_locked_documents_rels" USING btree ("jobs_id");`)
}

export async function down({ db, payload: _payload, req: _req }: MigrateDownArgs): Promise<void> {
  // Hand-fixed statement order: as generated, `DROP TABLE "jobs" CASCADE` ran
  // first and (correctly) cascade-dropped `payload_locked_documents_rels`'s
  // foreign key to `jobs` as a side effect - which then made the generator's
  // own next statement, an explicit `DROP CONSTRAINT` naming that same
  // already-gone constraint, fail with "constraint ... does not exist".
  // Dropping the constraint (and its dependent index/column) before dropping
  // the table it references avoids relying on CASCADE's side effect order.
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_jobs_fk";
  DROP INDEX "payload_locked_documents_rels_jobs_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "jobs_id";
  ALTER TABLE "jobs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "jobs" CASCADE;
  DROP TYPE "public"."enum_jobs_kind";
  DROP TYPE "public"."enum_jobs_status";`)
}
