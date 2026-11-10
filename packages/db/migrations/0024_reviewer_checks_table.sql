CREATE TABLE "reviewer_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"review_id" uuid,
	"lead_id" text NOT NULL,
	"reviewed_on" date NOT NULL,
	"agent_membership_id" uuid,
	"agent_name" text NOT NULL,
	"team_id" uuid,
	"reviewer_membership_id" uuid,
	"reviewer_name" text NOT NULL,
	"fair" boolean NOT NULL,
	"follows" boolean NOT NULL,
	"critical" boolean NOT NULL,
	"useful" boolean NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"by_membership_id" uuid,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reviewer_checks" ADD CONSTRAINT "reviewer_checks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_checks" ADD CONSTRAINT "reviewer_checks_review_same_company" FOREIGN KEY ("review_id","company_id") REFERENCES "public"."reviews"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_checks" ADD CONSTRAINT "reviewer_checks_agent_same_company" FOREIGN KEY ("agent_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_checks" ADD CONSTRAINT "reviewer_checks_team_same_company" FOREIGN KEY ("team_id","company_id") REFERENCES "public"."teams"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_checks" ADD CONSTRAINT "reviewer_checks_reviewer_same_company" FOREIGN KEY ("reviewer_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_checks" ADD CONSTRAINT "reviewer_checks_by_same_company" FOREIGN KEY ("by_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reviewer_checks_company" ON "reviewer_checks" USING btree ("company_id","created_at");