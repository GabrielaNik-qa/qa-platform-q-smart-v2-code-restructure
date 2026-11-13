CREATE TABLE "ai_test_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"state" text DEFAULT 'running' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"waiting_until" timestamp with time zone,
	"waiting_for" text DEFAULT '' NOT NULL,
	"busy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_test_jobs" ADD CONSTRAINT "ai_test_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_test_jobs_company" ON "ai_test_jobs" USING btree ("company_id","created_at");