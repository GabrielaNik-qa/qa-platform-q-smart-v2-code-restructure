CREATE TABLE "one_to_one_targets" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"target" integer DEFAULT 1 NOT NULL,
	"teams" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "one_to_one_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"team_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"by_membership_id" uuid,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "one_to_one_templates_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
ALTER TABLE "coaching_sessions" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "coaching_sessions" ADD COLUMN "period" text DEFAULT 'month' NOT NULL;--> statement-breakpoint
ALTER TABLE "coaching_sessions" ADD COLUMN "period_from" date;--> statement-breakpoint
ALTER TABLE "coaching_sessions" ADD COLUMN "period_to" date;--> statement-breakpoint
ALTER TABLE "coaching_sessions" ADD COLUMN "sections" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "coaching_sessions" ADD COLUMN "answers" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "coaching_sessions" ADD COLUMN "state" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "coaching_sessions" ADD COLUMN "lead_signature" jsonb;--> statement-breakpoint
ALTER TABLE "coaching_sessions" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "one_to_one_targets" ADD CONSTRAINT "one_to_one_targets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_to_one_templates" ADD CONSTRAINT "one_to_one_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_to_one_templates" ADD CONSTRAINT "one_to_one_templates_by_same_company" FOREIGN KEY ("by_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "one_to_one_templates_company" ON "one_to_one_templates" USING btree ("company_id");