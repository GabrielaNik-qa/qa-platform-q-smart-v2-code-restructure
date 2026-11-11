CREATE TABLE "ai_test_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"key" text NOT NULL,
	"language" text NOT NULL,
	"industry" text NOT NULL,
	"title" text NOT NULL,
	"channel" text NOT NULL,
	"text" text NOT NULL,
	"scorecard_id" uuid NOT NULL,
	"expected" jsonb,
	"expected_score" numeric(4, 1),
	"expected_by" text,
	"expected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_test_items_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "ai_test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"model_id" text NOT NULL,
	"status" text NOT NULL,
	"answers" jsonb,
	"score" numeric(4, 1),
	"wait_ms" integer DEFAULT 0 NOT NULL,
	"problem" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_test_items" ADD CONSTRAINT "ai_test_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_test_runs" ADD CONSTRAINT "ai_test_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_test_runs" ADD CONSTRAINT "ai_test_runs_item_same_company" FOREIGN KEY ("item_id","company_id") REFERENCES "public"."ai_test_items"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_test_items_key" ON "ai_test_items" USING btree ("company_id","key");--> statement-breakpoint
CREATE INDEX "ai_test_runs_item" ON "ai_test_runs" USING btree ("company_id","item_id","model_id","created_at");