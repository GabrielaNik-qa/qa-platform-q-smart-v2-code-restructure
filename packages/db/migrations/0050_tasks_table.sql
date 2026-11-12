CREATE TYPE "public"."task_kind" AS ENUM('task', 'target');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'med', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'doing', 'review', 'done');--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" "task_kind" DEFAULT 'task' NOT NULL,
	"priority" "task_priority" DEFAULT 'med' NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"start_on" date,
	"due_on" date,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"assignee_membership_id" uuid,
	"assignee_name" text NOT NULL,
	"team_id" uuid,
	"team_name" text DEFAULT '' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"colour" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"by_membership_id" uuid,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_same_company" FOREIGN KEY ("assignee_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_same_company" FOREIGN KEY ("team_id","company_id") REFERENCES "public"."teams"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_by_same_company" FOREIGN KEY ("by_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_company_due" ON "tasks" USING btree ("company_id","due_on");--> statement-breakpoint
CREATE INDEX "tasks_assignee" ON "tasks" USING btree ("assignee_membership_id");--> statement-breakpoint
CREATE INDEX "tasks_group" ON "tasks" USING btree ("group_id");