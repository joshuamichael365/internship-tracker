ALTER TABLE "applications" ADD COLUMN "auto_apply_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "blocker_retries" integer DEFAULT 0 NOT NULL;