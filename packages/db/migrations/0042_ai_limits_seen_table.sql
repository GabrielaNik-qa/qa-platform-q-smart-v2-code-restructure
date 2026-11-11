CREATE TABLE "ai_limits_seen" (
	"company_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"limits" jsonb NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_limits_seen_company_id_provider_model_pk" PRIMARY KEY("company_id","provider","model")
);
--> statement-breakpoint
ALTER TABLE "ai_limits_seen" ADD CONSTRAINT "ai_limits_seen_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;