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
// The generated `down()` statement order is also hand-fixed, exactly as
// `20260831_161951_add_jobs` was and for exactly the same reason (see the
// comment there): the `up()` SQL itself is untouched.
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db, payload: _payload, req: _req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sign_in_attempts_dimension" AS ENUM('ip', 'account');
  CREATE TYPE "public"."enum_sign_in_attempts_endpoint" AS ENUM('password', 'code');
  CREATE TABLE "sign_in_attempts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"dimension" "enum_sign_in_attempts_dimension" NOT NULL,
  	"endpoint" "enum_sign_in_attempts_endpoint" NOT NULL,
  	"subject" varchar NOT NULL,
  	"attempted_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sign_in_attempts_id" integer;
  CREATE INDEX "sign_in_attempts_updated_at_idx" ON "sign_in_attempts" USING btree ("updated_at");
  CREATE INDEX "sign_in_attempts_created_at_idx" ON "sign_in_attempts" USING btree ("created_at");
  CREATE INDEX "dimension_endpoint_subject_attemptedAt_idx" ON "sign_in_attempts" USING btree ("dimension","endpoint","subject","attempted_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sign_in_attempts_fk" FOREIGN KEY ("sign_in_attempts_id") REFERENCES "public"."sign_in_attempts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_sign_in_attempts_id_idx" ON "payload_locked_documents_rels" USING btree ("sign_in_attempts_id");`)
}

export async function down({ db, payload: _payload, req: _req }: MigrateDownArgs): Promise<void> {
  // Hand-fixed statement order, the same fix `20260831_161951_add_jobs`
  // carries: as generated, `DROP TABLE "sign_in_attempts" CASCADE` ran first
  // and (correctly) cascade-dropped `payload_locked_documents_rels`'s foreign
  // key to it as a side effect - which then made the generator's own next
  // statement, an explicit `DROP CONSTRAINT` naming that same already-gone
  // constraint, fail with "constraint ... does not exist". Dropping the
  // constraint (and its dependent index and column) before dropping the table
  // it references avoids relying on CASCADE's side-effect order.
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_sign_in_attempts_fk";
  DROP INDEX "payload_locked_documents_rels_sign_in_attempts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "sign_in_attempts_id";
  ALTER TABLE "sign_in_attempts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "sign_in_attempts" CASCADE;
  DROP TYPE "public"."enum_sign_in_attempts_dimension";
  DROP TYPE "public"."enum_sign_in_attempts_endpoint";`)
}
