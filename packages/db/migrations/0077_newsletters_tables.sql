CREATE TABLE "newsletter_reads" (
	"company_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"newsletter_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_reads_company_id_membership_id_newsletter_id_pk" PRIMARY KEY("company_id","membership_id","newsletter_id")
);
--> statement-breakpoint
CREATE TABLE "newsletters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"month" text NOT NULL,
	"title" text NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"by_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletters_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
ALTER TABLE "newsletter_reads" ADD CONSTRAINT "newsletter_reads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_reads" ADD CONSTRAINT "newsletter_reads_member_same_company" FOREIGN KEY ("membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_reads" ADD CONSTRAINT "newsletter_reads_newsletter_same_company" FOREIGN KEY ("newsletter_id","company_id") REFERENCES "public"."newsletters"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "newsletters_company_month" ON "newsletters" USING btree ("company_id","month");