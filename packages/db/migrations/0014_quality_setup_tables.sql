CREATE TABLE "category_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"critical" boolean DEFAULT false NOT NULL,
	"questions" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "root_causes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scorecards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"categories" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scorecards_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_scorecards" (
	"company_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scorecard_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "pass_rate" integer DEFAULT 85 NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "pass_rate" integer;--> statement-breakpoint
ALTER TABLE "category_library" ADD CONSTRAINT "category_library_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "root_causes" ADD CONSTRAINT "root_causes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_scorecards" ADD CONSTRAINT "workspace_scorecards_workspace_id_company_id_workspaces_id_company_id_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."workspaces"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_scorecards" ADD CONSTRAINT "workspace_scorecards_scorecard_id_company_id_scorecards_id_company_id_fk" FOREIGN KEY ("scorecard_id","company_id") REFERENCES "public"."scorecards"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_scorecards_pair" ON "workspace_scorecards" USING btree ("workspace_id","scorecard_id");