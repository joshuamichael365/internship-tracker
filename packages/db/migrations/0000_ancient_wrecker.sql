CREATE TYPE "public"."application_mode" AS ENUM('manual', 'assist', 'auto');--> statement-breakpoint
CREATE TYPE "public"."application_stage" AS ENUM('saved', 'in_progress', 'applied', 'assessment', 'interviewing', 'offer', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('resume', 'cover_letter', 'short_answers', 'other');--> statement-breakpoint
CREATE TYPE "public"."job_level" AS ENUM('internship', 'new_grad');--> statement-breakpoint
CREATE TYPE "public"."location_mode" AS ENUM('remote', 'hybrid', 'onsite', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('push', 'email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('instant', 'digest', 'confirmation', 'blocker');--> statement-breakpoint
CREATE TYPE "public"."posting_status" AS ENUM('active', 'expired', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."role_type" AS ENUM('swe', 'ml', 'data', 'quant', 'other');--> statement-breakpoint
CREATE TYPE "public"."sample_set" AS ENUM('cover_letter', 'short_answer');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('github_repo', 'greenhouse', 'lever', 'smartrecruiters', 'workday', 'rss', 'instagram_mirror');--> statement-breakpoint
CREATE TYPE "public"."sponsorship" AS ENUM('sponsors', 'citizens_only', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."storage_destination" AS ENUM('inapp', 'local', 'gdrive');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"posting_id" integer,
	"company" text NOT NULL,
	"role_title" text NOT NULL,
	"location" text,
	"url" text NOT NULL,
	"mode" "application_mode",
	"mode_recommendation" jsonb,
	"stage" "application_stage" DEFAULT 'saved' NOT NULL,
	"resume_id" integer,
	"applied_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digest_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"posting_id" integer NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer,
	"kind" "document_kind" NOT NULL,
	"destination" "storage_destination" NOT NULL,
	"location" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mode_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"recommended" "application_mode" NOT NULL,
	"chosen" "application_mode" NOT NULL,
	"signals" jsonb,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"posting_id" integer,
	"application_id" integer,
	"channel" "notification_channel" NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"payload" jsonb,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postings" (
	"id" serial PRIMARY KEY NOT NULL,
	"dedupe_hash" text NOT NULL,
	"company" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"location_mode" "location_mode" DEFAULT 'unknown' NOT NULL,
	"role_type" "role_type" DEFAULT 'other' NOT NULL,
	"job_level" "job_level" DEFAULT 'internship' NOT NULL,
	"description" text,
	"deadline" timestamp with time zone,
	"posted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "posting_status" DEFAULT 'active' NOT NULL,
	"sponsorship" "sponsorship" DEFAULT 'unknown' NOT NULL,
	"bookmarked" boolean DEFAULT false NOT NULL,
	"notes" text,
	"seen_in" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"label" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"file_key" text NOT NULL,
	"parsed" jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"quiet_hours_start" integer DEFAULT 23 NOT NULL,
	"quiet_hours_end" integer DEFAULT 7 NOT NULL,
	"channels" jsonb DEFAULT '{"push":true,"email":true,"sms":false}'::jsonb NOT NULL,
	"include_new_grad" boolean DEFAULT false NOT NULL,
	"notification_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"storage_destination" "storage_destination" DEFAULT 'inapp' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "source_kind" NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_polled_at" timestamp with time zone,
	"http_cache" jsonb,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_samples" (
	"id" serial PRIMARY KEY NOT NULL,
	"set" "sample_set" NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_queue" ADD CONSTRAINT "digest_queue_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mode_decisions" ADD CONSTRAINT "mode_decisions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_stage_idx" ON "applications" USING btree ("stage");--> statement-breakpoint
CREATE UNIQUE INDEX "postings_dedupe_hash_idx" ON "postings" USING btree ("dedupe_hash");--> statement-breakpoint
CREATE INDEX "postings_status_idx" ON "postings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "postings_first_seen_idx" ON "postings" USING btree ("first_seen_at");