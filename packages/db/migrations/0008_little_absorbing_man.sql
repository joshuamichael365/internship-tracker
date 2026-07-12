ALTER TABLE "settings" ADD COLUMN "watchlist_companies" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "digest_hours" jsonb DEFAULT '[8,17]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "last_digest_sent_at" timestamp with time zone;