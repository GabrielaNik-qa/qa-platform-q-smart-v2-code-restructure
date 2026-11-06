CREATE TYPE "public"."quick_flag_type" AS ENUM('red', 'green');--> statement-breakpoint
CREATE TABLE "quick_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" "quick_flag_type" NOT NULL,
	"channel" "review_channel" DEFAULT 'call' NOT NULL,
	"agent_membership_id" uuid,
	"agent_name" text NOT NULL,
	"team_id" uuid,
	"team_name" text DEFAULT '' NOT NULL,
	"lead_id" text NOT NULL,
	"flagged_on" date NOT NULL,
	"campaign" text DEFAULT '' NOT NULL,
	"lead_link" text DEFAULT '' NOT NULL,
	"conversation_link" text DEFAULT '' NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"by_membership_id" uuid,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quick_flags" ADD CONSTRAINT "quick_flags_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_flags" ADD CONSTRAINT "quick_flags_agent_same_company" FOREIGN KEY ("agent_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_flags" ADD CONSTRAINT "quick_flags_team_same_company" FOREIGN KEY ("team_id","company_id") REFERENCES "public"."teams"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_flags" ADD CONSTRAINT "quick_flags_by_same_company" FOREIGN KEY ("by_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quick_flags_company_date" ON "quick_flags" USING btree ("company_id","flagged_on");