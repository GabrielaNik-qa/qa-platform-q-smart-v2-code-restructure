CREATE TYPE "public"."skill_kind" AS ENUM('skill', 'language');--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_id_company" UNIQUE("id","company_id");--> statement-breakpoint
CREATE TABLE "membership_skills" (
	"company_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" "skill_kind" NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "skills_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "team_skills" (
	"company_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_staff" (
	"company_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_teams" (
	"company_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"team_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#2563eb' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "color" text DEFAULT '#2563eb' NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "lead_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "membership_skills" ADD CONSTRAINT "membership_skills_membership_id_company_id_memberships_id_company_id_fk" FOREIGN KEY ("membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_skills" ADD CONSTRAINT "membership_skills_skill_id_company_id_skills_id_company_id_fk" FOREIGN KEY ("skill_id","company_id") REFERENCES "public"."skills"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_skills" ADD CONSTRAINT "team_skills_team_id_company_id_teams_id_company_id_fk" FOREIGN KEY ("team_id","company_id") REFERENCES "public"."teams"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_skills" ADD CONSTRAINT "team_skills_skill_id_company_id_skills_id_company_id_fk" FOREIGN KEY ("skill_id","company_id") REFERENCES "public"."skills"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_staff" ADD CONSTRAINT "workspace_staff_workspace_id_company_id_workspaces_id_company_id_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."workspaces"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_staff" ADD CONSTRAINT "workspace_staff_membership_id_company_id_memberships_id_company_id_fk" FOREIGN KEY ("membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_teams" ADD CONSTRAINT "workspace_teams_workspace_id_company_id_workspaces_id_company_id_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."workspaces"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_teams" ADD CONSTRAINT "workspace_teams_team_id_company_id_teams_id_company_id_fk" FOREIGN KEY ("team_id","company_id") REFERENCES "public"."teams"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_skills_pair" ON "membership_skills" USING btree ("membership_id","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_company_kind_name" ON "skills" USING btree ("company_id","kind","name");--> statement-breakpoint
CREATE UNIQUE INDEX "team_skills_pair" ON "team_skills" USING btree ("team_id","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_staff_pair" ON "workspace_staff" USING btree ("workspace_id","membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_teams_pair" ON "workspace_teams" USING btree ("workspace_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_company_name" ON "workspaces" USING btree ("company_id","name");