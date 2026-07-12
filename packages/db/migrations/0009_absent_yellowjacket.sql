ALTER TABLE "settings" ADD COLUMN "gmail_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "gmail_refresh_token" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "gmail_connected_email" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "gmail_last_sync_at" timestamp with time zone;