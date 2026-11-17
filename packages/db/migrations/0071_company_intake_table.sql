CREATE TABLE "company_intake" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"min_call_seconds" integer,
	"calls_left_out" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_intake" ADD CONSTRAINT "company_intake_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;