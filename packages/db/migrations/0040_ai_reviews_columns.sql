ALTER TABLE "ai_settings" ADD COLUMN "reviews" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "ai_hold" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "source" text DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "ai" jsonb;