CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"request" jsonb,
	"rows" integer NOT NULL,
	"by_membership_id" uuid,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"cfg" jsonb NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"schedule" jsonb DEFAULT '{"freq":"none"}'::jsonb NOT NULL,
	"last_sent_at" timestamp with time zone,
	"by_membership_id" uuid,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_by_same_company" FOREIGN KEY ("by_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_by_same_company" FOREIGN KEY ("by_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exports_company" ON "exports" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_company" ON "reports" USING btree ("company_id","created_at");