CREATE TYPE "public"."dispute_outcome" AS ENUM('kept', 'changed', 'partly');--> statement-breakpoint
CREATE TABLE "dispute_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"dispute_id" uuid NOT NULL,
	"author_membership_id" uuid,
	"author_name" text NOT NULL,
	"author_role" text NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"text" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"agent_membership_id" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"outcome" "dispute_outcome",
	"note" text DEFAULT '' NOT NULL,
	"resolved_by_membership_id" uuid,
	"resolved_by_name" text DEFAULT '' NOT NULL,
	CONSTRAINT "disputes_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
ALTER TABLE "dispute_messages" ADD CONSTRAINT "dispute_messages_dispute_same_company" FOREIGN KEY ("dispute_id","company_id") REFERENCES "public"."disputes"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_messages" ADD CONSTRAINT "dispute_messages_author_same_company" FOREIGN KEY ("author_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_review_same_company" FOREIGN KEY ("review_id","company_id") REFERENCES "public"."reviews"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_agent_same_company" FOREIGN KEY ("agent_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolver_same_company" FOREIGN KEY ("resolved_by_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dispute_messages_of" ON "dispute_messages" USING btree ("dispute_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_review" ON "disputes" USING btree ("review_id");