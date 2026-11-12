CREATE TABLE "task_sequence_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"sequence_id" uuid NOT NULL,
	"start_on" date NOT NULL,
	"repeat" text DEFAULT 'none' NOT NULL,
	"until_on" date,
	"user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"team_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cycles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"by_membership_id" uuid,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_sequence_runs_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "task_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"by_membership_id" uuid,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_sequences_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'checklist' NOT NULL,
	"priority" "task_priority" DEFAULT 'med' NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"colour" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"freq" text DEFAULT 'none' NOT NULL,
	"weekday" integer DEFAULT 1 NOT NULL,
	"monthday" integer DEFAULT 1 NOT NULL,
	"until_on" date,
	"user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"team_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"by_membership_id" uuid,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_templates_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recur_key" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "step_no" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "step_count" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "sequence_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_sequence_runs" ADD CONSTRAINT "task_sequence_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sequence_runs" ADD CONSTRAINT "task_sequence_runs_sequence_same_company" FOREIGN KEY ("sequence_id","company_id") REFERENCES "public"."task_sequences"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sequence_runs" ADD CONSTRAINT "task_sequence_runs_by_same_company" FOREIGN KEY ("by_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sequences" ADD CONSTRAINT "task_sequences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sequences" ADD CONSTRAINT "task_sequences_by_same_company" FOREIGN KEY ("by_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_by_same_company" FOREIGN KEY ("by_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_sequence_runs_sequence" ON "task_sequence_runs" USING btree ("sequence_id");--> statement-breakpoint
CREATE INDEX "task_sequences_company" ON "task_sequences" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "task_templates_company" ON "task_templates" USING btree ("company_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_same_company" FOREIGN KEY ("template_id","company_id") REFERENCES "public"."task_templates"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_run_same_company" FOREIGN KEY ("run_id","company_id") REFERENCES "public"."task_sequence_runs"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_recur_key" ON "tasks" USING btree ("company_id","recur_key");