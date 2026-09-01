import { sql } from '@payloadcms/db-postgres'
// Payload's `migrate:create` generates this import without `type` on
// MigrateUpArgs/MigrateDownArgs, which are interfaces with no runtime export.
// Node's built-in TypeScript type-stripping (unlike esbuild/tsx) does not
// infer that on its own, so the file as generated fails to load under plain
// `node`/the Payload CLI. Hand-fixed to a type-only import, and the unused
// `payload`/`req` destructured parameters below are underscore-prefixed for
// `noUnusedParameters`. The generated SQL itself is untouched.
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db, payload: _payload, req: _req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_media_kind" AS ENUM('still', 'clip');
  CREATE TYPE "public"."enum_journeys_weather_glyph" AS ENUM('sun', 'haze', 'wind');
  CREATE TYPE "public"."enum_journeys_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__journeys_v_version_weather_glyph" AS ENUM('sun', 'haze', 'wind');
  CREATE TYPE "public"."enum__journeys_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_pages_slots_role" AS ENUM('hero', 'ephemera', 'frame');
  CREATE TYPE "public"."enum_pages_kind" AS ENUM('notes', 'frames');
  CREATE TYPE "public"."enum_pages_layout" AS ENUM('three-up', 'four-up', 'full-bleed', 'text-spread');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_version_slots_role" AS ENUM('hero', 'ephemera', 'frame');
  CREATE TYPE "public"."enum__pages_v_version_kind" AS ENUM('notes', 'frames');
  CREATE TYPE "public"."enum__pages_v_version_layout" AS ENUM('three-up', 'four-up', 'full-bleed', 'text-spread');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_book_journey_order_mode" AS ENUM('manual', 'newest', 'oldest');
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"journey_id" integer,
  	"kind" "enum_media_kind",
  	"caption" varchar,
  	"alt" varchar,
  	"captured_at" timestamp(3) with time zone,
  	"poster_at" numeric,
  	"poster_image_id" integer,
  	"duration_sec" numeric,
  	"in_book" boolean DEFAULT false,
  	"hidden" boolean DEFAULT false,
  	"is_cover" boolean DEFAULT false,
  	"allow_download" boolean DEFAULT true,
  	"order" numeric,
  	"content_hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumb_url" varchar,
  	"sizes_thumb_width" numeric,
  	"sizes_thumb_height" numeric,
  	"sizes_thumb_mime_type" varchar,
  	"sizes_thumb_filesize" numeric,
  	"sizes_thumb_filename" varchar,
  	"sizes_tile_url" varchar,
  	"sizes_tile_width" numeric,
  	"sizes_tile_height" numeric,
  	"sizes_tile_mime_type" varchar,
  	"sizes_tile_filesize" numeric,
  	"sizes_tile_filename" varchar,
  	"sizes_frame_url" varchar,
  	"sizes_frame_width" numeric,
  	"sizes_frame_height" numeric,
  	"sizes_frame_mime_type" varchar,
  	"sizes_frame_filesize" numeric,
  	"sizes_frame_filename" varchar,
  	"sizes_hero_url" varchar,
  	"sizes_hero_width" numeric,
  	"sizes_hero_height" numeric,
  	"sizes_hero_mime_type" varchar,
  	"sizes_hero_filesize" numeric,
  	"sizes_hero_filename" varchar,
  	"sizes_hero2x_url" varchar,
  	"sizes_hero2x_width" numeric,
  	"sizes_hero2x_height" numeric,
  	"sizes_hero2x_mime_type" varchar,
  	"sizes_hero2x_filesize" numeric,
  	"sizes_hero2x_filename" varchar
  );
  
  CREATE TABLE "journeys_highlights" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "journeys_tally" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" varchar
  );
  
  CREATE TABLE "journeys" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"place" varchar,
  	"slug" varchar,
  	"dates" varchar,
  	"starts_on" timestamp(3) with time zone,
  	"order" numeric,
  	"hidden_from_bookmarks" boolean DEFAULT false,
  	"archived" boolean DEFAULT false,
  	"deleted_at" timestamp(3) with time zone,
  	"weather" varchar,
  	"mood" varchar,
  	"weather_glyph" "enum_journeys_weather_glyph" DEFAULT 'sun',
  	"furniture_signoff" varchar,
  	"furniture_stamp_country" varchar,
  	"furniture_stamp_value" varchar,
  	"furniture_accent" varchar DEFAULT '#3d817e',
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_journeys_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_journeys_v_version_highlights" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_journeys_v_version_tally" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_journeys_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_place" varchar,
  	"version_slug" varchar,
  	"version_dates" varchar,
  	"version_starts_on" timestamp(3) with time zone,
  	"version_order" numeric,
  	"version_hidden_from_bookmarks" boolean DEFAULT false,
  	"version_archived" boolean DEFAULT false,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version_weather" varchar,
  	"version_mood" varchar,
  	"version_weather_glyph" "enum__journeys_v_version_weather_glyph" DEFAULT 'sun',
  	"version_furniture_signoff" varchar,
  	"version_furniture_stamp_country" varchar,
  	"version_furniture_stamp_value" varchar,
  	"version_furniture_accent" varchar DEFAULT '#3d817e',
  	"version_note" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__journeys_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "pages_slots" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"role" "enum_pages_slots_role",
  	"media_id" integer,
  	"caption" varchar,
  	"alt" varchar,
  	"focal_x" numeric DEFAULT 50,
  	"focal_y" numeric DEFAULT 50
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"journey_id" integer,
  	"kind" "enum_pages_kind",
  	"title" varchar,
  	"order" numeric,
  	"layout" "enum_pages_layout",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_pages_v_version_slots" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"role" "enum__pages_v_version_slots_role",
  	"media_id" integer,
  	"caption" varchar,
  	"alt" varchar,
  	"focal_x" numeric DEFAULT 50,
  	"focal_y" numeric DEFAULT 50,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_journey_id" integer,
  	"version_kind" "enum__pages_v_version_kind",
  	"version_title" varchar,
  	"version_order" numeric,
  	"version_layout" "enum__pages_v_version_layout",
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"display_name" varchar,
  	"signoff_default" varchar,
  	"time_zone" varchar,
  	"otp_required" boolean DEFAULT true,
  	"notify_on_publish" boolean DEFAULT true,
  	"notify_weekly" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "otp_challenges" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"code_hash" varchar NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"attempts" numeric DEFAULT 0,
  	"consumed_at" timestamp(3) with time zone,
  	"ip" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sessions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"token_hash" varchar NOT NULL,
  	"device" varchar,
  	"location" varchar,
  	"last_seen_at" timestamp(3) with time zone,
  	"revoked_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer,
  	"journeys_id" integer,
  	"pages_id" integer,
  	"users_id" integer,
  	"otp_challenges_id" integer,
  	"sessions_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "book" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"subtitle" varchar,
  	"owner" varchar,
  	"cover_cloth" varchar,
  	"years_shown" varchar,
  	"contents_note" varchar,
  	"flip_duration_ms" numeric DEFAULT 800,
  	"gallery_thumb_px" numeric DEFAULT 200,
  	"show_decorations" boolean DEFAULT true,
  	"show_ribbon" boolean DEFAULT true,
  	"show_counter" boolean DEFAULT true,
  	"journey_order_mode" "enum_book_journey_order_mode" DEFAULT 'manual',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "about_paragraphs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "about_kit" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "about" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"portrait_id" integer,
  	"portrait_caption" varchar,
  	"reply_to" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "site" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"domain" varchar,
  	"description" varchar,
  	"reply_to" varchar,
  	"analytics_id" varchar,
  	"allow_downloads" boolean DEFAULT true,
  	"allow_share" boolean DEFAULT true,
  	"index_galleries" boolean DEFAULT true,
  	"password_protect" boolean DEFAULT false,
  	"touch_page_turn" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "media" ADD CONSTRAINT "media_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journeys"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_poster_image_id_media_id_fk" FOREIGN KEY ("poster_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "journeys_highlights" ADD CONSTRAINT "journeys_highlights_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."journeys"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "journeys_tally" ADD CONSTRAINT "journeys_tally_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."journeys"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_journeys_v_version_highlights" ADD CONSTRAINT "_journeys_v_version_highlights_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_journeys_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_journeys_v_version_tally" ADD CONSTRAINT "_journeys_v_version_tally_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_journeys_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_journeys_v" ADD CONSTRAINT "_journeys_v_parent_id_journeys_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."journeys"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_slots" ADD CONSTRAINT "pages_slots_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_slots" ADD CONSTRAINT "pages_slots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journeys"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_version_slots" ADD CONSTRAINT "_pages_v_version_slots_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_version_slots" ADD CONSTRAINT "_pages_v_version_slots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_journey_id_journeys_id_fk" FOREIGN KEY ("version_journey_id") REFERENCES "public"."journeys"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_journeys_fk" FOREIGN KEY ("journeys_id") REFERENCES "public"."journeys"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_otp_challenges_fk" FOREIGN KEY ("otp_challenges_id") REFERENCES "public"."otp_challenges"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sessions_fk" FOREIGN KEY ("sessions_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "about_paragraphs" ADD CONSTRAINT "about_paragraphs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."about"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "about_kit" ADD CONSTRAINT "about_kit_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."about"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "about" ADD CONSTRAINT "about_portrait_id_media_id_fk" FOREIGN KEY ("portrait_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "media_journey_idx" ON "media" USING btree ("journey_id");
  CREATE INDEX "media_poster_image_idx" ON "media" USING btree ("poster_image_id");
  CREATE INDEX "media_content_hash_idx" ON "media" USING btree ("content_hash");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumb_sizes_thumb_filename_idx" ON "media" USING btree ("sizes_thumb_filename");
  CREATE INDEX "media_sizes_tile_sizes_tile_filename_idx" ON "media" USING btree ("sizes_tile_filename");
  CREATE INDEX "media_sizes_frame_sizes_frame_filename_idx" ON "media" USING btree ("sizes_frame_filename");
  CREATE INDEX "media_sizes_hero_sizes_hero_filename_idx" ON "media" USING btree ("sizes_hero_filename");
  CREATE INDEX "media_sizes_hero2x_sizes_hero2x_filename_idx" ON "media" USING btree ("sizes_hero2x_filename");
  CREATE INDEX "journeys_highlights_order_idx" ON "journeys_highlights" USING btree ("_order");
  CREATE INDEX "journeys_highlights_parent_id_idx" ON "journeys_highlights" USING btree ("_parent_id");
  CREATE INDEX "journeys_tally_order_idx" ON "journeys_tally" USING btree ("_order");
  CREATE INDEX "journeys_tally_parent_id_idx" ON "journeys_tally" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "journeys_slug_idx" ON "journeys" USING btree ("slug");
  CREATE INDEX "journeys_order_idx" ON "journeys" USING btree ("order");
  CREATE INDEX "journeys_deleted_at_idx" ON "journeys" USING btree ("deleted_at");
  CREATE INDEX "journeys_updated_at_idx" ON "journeys" USING btree ("updated_at");
  CREATE INDEX "journeys_created_at_idx" ON "journeys" USING btree ("created_at");
  CREATE INDEX "journeys__status_idx" ON "journeys" USING btree ("_status");
  CREATE INDEX "_journeys_v_version_highlights_order_idx" ON "_journeys_v_version_highlights" USING btree ("_order");
  CREATE INDEX "_journeys_v_version_highlights_parent_id_idx" ON "_journeys_v_version_highlights" USING btree ("_parent_id");
  CREATE INDEX "_journeys_v_version_tally_order_idx" ON "_journeys_v_version_tally" USING btree ("_order");
  CREATE INDEX "_journeys_v_version_tally_parent_id_idx" ON "_journeys_v_version_tally" USING btree ("_parent_id");
  CREATE INDEX "_journeys_v_parent_idx" ON "_journeys_v" USING btree ("parent_id");
  CREATE INDEX "_journeys_v_version_version_slug_idx" ON "_journeys_v" USING btree ("version_slug");
  CREATE INDEX "_journeys_v_version_version_order_idx" ON "_journeys_v" USING btree ("version_order");
  CREATE INDEX "_journeys_v_version_version_deleted_at_idx" ON "_journeys_v" USING btree ("version_deleted_at");
  CREATE INDEX "_journeys_v_version_version_updated_at_idx" ON "_journeys_v" USING btree ("version_updated_at");
  CREATE INDEX "_journeys_v_version_version_created_at_idx" ON "_journeys_v" USING btree ("version_created_at");
  CREATE INDEX "_journeys_v_version_version__status_idx" ON "_journeys_v" USING btree ("version__status");
  CREATE INDEX "_journeys_v_created_at_idx" ON "_journeys_v" USING btree ("created_at");
  CREATE INDEX "_journeys_v_updated_at_idx" ON "_journeys_v" USING btree ("updated_at");
  CREATE INDEX "_journeys_v_latest_idx" ON "_journeys_v" USING btree ("latest");
  CREATE INDEX "pages_slots_order_idx" ON "pages_slots" USING btree ("_order");
  CREATE INDEX "pages_slots_parent_id_idx" ON "pages_slots" USING btree ("_parent_id");
  CREATE INDEX "pages_slots_media_idx" ON "pages_slots" USING btree ("media_id");
  CREATE INDEX "pages_journey_idx" ON "pages" USING btree ("journey_id");
  CREATE INDEX "pages_order_idx" ON "pages" USING btree ("order");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "pages" USING btree ("_status");
  CREATE INDEX "_pages_v_version_slots_order_idx" ON "_pages_v_version_slots" USING btree ("_order");
  CREATE INDEX "_pages_v_version_slots_parent_id_idx" ON "_pages_v_version_slots" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_version_slots_media_idx" ON "_pages_v_version_slots" USING btree ("media_id");
  CREATE INDEX "_pages_v_parent_idx" ON "_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_journey_idx" ON "_pages_v" USING btree ("version_journey_id");
  CREATE INDEX "_pages_v_version_version_order_idx" ON "_pages_v" USING btree ("version_order");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_latest_idx" ON "_pages_v" USING btree ("latest");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "otp_challenges_user_idx" ON "otp_challenges" USING btree ("user_id");
  CREATE INDEX "otp_challenges_updated_at_idx" ON "otp_challenges" USING btree ("updated_at");
  CREATE INDEX "otp_challenges_created_at_idx" ON "otp_challenges" USING btree ("created_at");
  CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");
  CREATE INDEX "sessions_updated_at_idx" ON "sessions" USING btree ("updated_at");
  CREATE INDEX "sessions_created_at_idx" ON "sessions" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_journeys_id_idx" ON "payload_locked_documents_rels" USING btree ("journeys_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_otp_challenges_id_idx" ON "payload_locked_documents_rels" USING btree ("otp_challenges_id");
  CREATE INDEX "payload_locked_documents_rels_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("sessions_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX "about_paragraphs_order_idx" ON "about_paragraphs" USING btree ("_order");
  CREATE INDEX "about_paragraphs_parent_id_idx" ON "about_paragraphs" USING btree ("_parent_id");
  CREATE INDEX "about_kit_order_idx" ON "about_kit" USING btree ("_order");
  CREATE INDEX "about_kit_parent_id_idx" ON "about_kit" USING btree ("_parent_id");
  CREATE INDEX "about_portrait_idx" ON "about" USING btree ("portrait_id");`)
}

export async function down({ db, payload: _payload, req: _req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "media" CASCADE;
  DROP TABLE "journeys_highlights" CASCADE;
  DROP TABLE "journeys_tally" CASCADE;
  DROP TABLE "journeys" CASCADE;
  DROP TABLE "_journeys_v_version_highlights" CASCADE;
  DROP TABLE "_journeys_v_version_tally" CASCADE;
  DROP TABLE "_journeys_v" CASCADE;
  DROP TABLE "pages_slots" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "_pages_v_version_slots" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "otp_challenges" CASCADE;
  DROP TABLE "sessions" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "book" CASCADE;
  DROP TABLE "about_paragraphs" CASCADE;
  DROP TABLE "about_kit" CASCADE;
  DROP TABLE "about" CASCADE;
  DROP TABLE "site" CASCADE;
  DROP TYPE "public"."enum_media_kind";
  DROP TYPE "public"."enum_journeys_weather_glyph";
  DROP TYPE "public"."enum_journeys_status";
  DROP TYPE "public"."enum__journeys_v_version_weather_glyph";
  DROP TYPE "public"."enum__journeys_v_version_status";
  DROP TYPE "public"."enum_pages_slots_role";
  DROP TYPE "public"."enum_pages_kind";
  DROP TYPE "public"."enum_pages_layout";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum__pages_v_version_slots_role";
  DROP TYPE "public"."enum__pages_v_version_kind";
  DROP TYPE "public"."enum__pages_v_version_layout";
  DROP TYPE "public"."enum__pages_v_version_status";
  DROP TYPE "public"."enum_book_journey_order_mode";`)
}
