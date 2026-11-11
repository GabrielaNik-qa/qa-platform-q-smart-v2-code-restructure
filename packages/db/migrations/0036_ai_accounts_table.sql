CREATE TABLE "ai_accounts" (
	"company_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"key_cipher" text NOT NULL,
	"key_hint" text NOT NULL,
	"account_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"by_membership_id" uuid,
	"by_name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_accounts_company_id_provider_pk" PRIMARY KEY("company_id","provider")
);
--> statement-breakpoint
ALTER TABLE "ai_accounts" ADD CONSTRAINT "ai_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_accounts" ADD CONSTRAINT "ai_accounts_by_same_company" FOREIGN KEY ("by_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;