ALTER TABLE "settings" ALTER COLUMN "timezone" SET DEFAULT 'America/New_York';--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "drafts" jsonb;