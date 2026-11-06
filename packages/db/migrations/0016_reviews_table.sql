CREATE TYPE "public"."review_channel" AS ENUM('call', 'chat', 'email', 'other');--> statement-breakpoint
CREATE TYPE "public"."review_flag" AS ENUM('', 'green', 'red');--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"lead_id" text NOT NULL,
	"agent_membership_id" uuid,
	"agent_name" text NOT NULL,
	"team_id" uuid,
	"team_name" text DEFAULT '' NOT NULL,
	"reviewed_on" date NOT NULL,
	"channel" "review_channel" DEFAULT 'call' NOT NULL,
	"channel_name" text DEFAULT '' NOT NULL,
	"scorecard_id" uuid,
	"scorecard_name" text NOT NULL,
	"categories" jsonb NOT NULL,
	"score" numeric(4, 1),
	"zero" boolean DEFAULT false NOT NULL,
	"not_scored" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"flag" "review_flag" DEFAULT '' NOT NULL,
	"campaign" text DEFAULT '' NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"lead_link" text DEFAULT '' NOT NULL,
	"recording_link" text DEFAULT '' NOT NULL,
	"conversation_link" text DEFAULT '' NOT NULL,
	"transcript" text DEFAULT '' NOT NULL,
	"email_subject" text DEFAULT '' NOT NULL,
	"reviewer_membership_id" uuid,
	"reviewer_name" text NOT NULL,
	"seen_at" timestamp with time zone,
	"review_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_agent_same_company" FOREIGN KEY ("agent_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_same_company" FOREIGN KEY ("reviewer_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_team_same_company" FOREIGN KEY ("team_id","company_id") REFERENCES "public"."teams"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_scorecard_same_company" FOREIGN KEY ("scorecard_id","company_id") REFERENCES "public"."scorecards"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reviews_company_date" ON "reviews" USING btree ("company_id","reviewed_on");--> statement-breakpoint
CREATE INDEX "reviews_agent" ON "reviews" USING btree ("agent_membership_id");