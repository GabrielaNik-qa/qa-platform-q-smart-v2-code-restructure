CREATE TYPE "public"."goal_metric" AS ENUM('avg', 'pass', 'reviews', 'tasks', 'csat', 'kudos');--> statement-breakpoint
CREATE TYPE "public"."goal_scope" AS ENUM('all', 'team', 'agent');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('active', 'extended', 'passed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"scope" "goal_scope" NOT NULL,
	"team_id" uuid,
	"agent_membership_id" uuid,
	"target_name" text DEFAULT '' NOT NULL,
	"metric" "goal_metric" NOT NULL,
	"value" double precision NOT NULL,
	"channel" text DEFAULT '' NOT NULL,
	"month" text NOT NULL,
	"by_membership_id" uuid,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "improvement_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_membership_id" uuid,
	"agent_name" text NOT NULL,
	"title" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"start_on" date NOT NULL,
	"end_on" date NOT NULL,
	"goals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"check_ins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "plan_status" DEFAULT 'active' NOT NULL,
	"signed_at" timestamp with time zone,
	"agent_note" text DEFAULT '' NOT NULL,
	"by_membership_id" uuid,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kudos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"to_membership_id" uuid,
	"to_name" text NOT NULL,
	"badge" text NOT NULL,
	"text" text NOT NULL,
	"by_membership_id" uuid,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_team_same_company" FOREIGN KEY ("team_id","company_id") REFERENCES "public"."teams"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_agent_same_company" FOREIGN KEY ("agent_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_by_same_company" FOREIGN KEY ("by_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_plans" ADD CONSTRAINT "improvement_plans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_plans" ADD CONSTRAINT "improvement_plans_agent_same_company" FOREIGN KEY ("agent_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_plans" ADD CONSTRAINT "improvement_plans_by_same_company" FOREIGN KEY ("by_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_to_same_company" FOREIGN KEY ("to_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_by_same_company" FOREIGN KEY ("by_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goals_company_month" ON "goals" USING btree ("company_id","month");--> statement-breakpoint
CREATE INDEX "improvement_plans_company" ON "improvement_plans" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "improvement_plans_agent" ON "improvement_plans" USING btree ("agent_membership_id");--> statement-breakpoint
CREATE INDEX "kudos_company" ON "kudos" USING btree ("company_id","created_at");