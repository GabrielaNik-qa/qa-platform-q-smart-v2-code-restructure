CREATE TYPE "public"."session_kind" AS ENUM('coaching', 'group', 'training', 'o2o');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('planned', 'done');--> statement-breakpoint
CREATE TABLE "coaching_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" "session_kind" NOT NULL,
	"held_on" date NOT NULL,
	"title" text NOT NULL,
	"status" "session_status" DEFAULT 'done' NOT NULL,
	"agents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"focus" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"goals" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"follow_up_on" date,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"signatures" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"by_membership_id" uuid,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coaching_sessions" ADD CONSTRAINT "coaching_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_sessions" ADD CONSTRAINT "coaching_sessions_by_same_company" FOREIGN KEY ("by_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coaching_sessions_company" ON "coaching_sessions" USING btree ("company_id","held_on");