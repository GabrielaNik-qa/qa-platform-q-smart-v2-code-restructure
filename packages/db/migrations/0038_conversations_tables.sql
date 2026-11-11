CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"channel" "review_channel" DEFAULT 'call' NOT NULL,
	"channel_name" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"agent_membership_id" uuid,
	"agent_name" text NOT NULL,
	"team_id" uuid,
	"team_name" text DEFAULT '' NOT NULL,
	"customer_id" uuid,
	"link" text DEFAULT '' NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"by_membership_id" uuid,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"external_id" text DEFAULT '' NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "fields" (
	"company_id" uuid NOT NULL,
	"object" text NOT NULL,
	"key" text NOT NULL,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"type" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"ai" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fields_company_id_object_key_pk" PRIMARY KEY("company_id","object","key")
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"conversation_id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "transcript_days" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agent_same_company" FOREIGN KEY ("agent_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_team_same_company" FOREIGN KEY ("team_id","company_id") REFERENCES "public"."teams"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_same_company" FOREIGN KEY ("customer_id","company_id") REFERENCES "public"."customers"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_by_same_company" FOREIGN KEY ("by_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_conversation_same_company" FOREIGN KEY ("conversation_id","company_id") REFERENCES "public"."conversations"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_company_date" ON "conversations" USING btree ("company_id","started_at");--> statement-breakpoint
CREATE INDEX "conversations_agent" ON "conversations" USING btree ("agent_membership_id");--> statement-breakpoint
CREATE INDEX "customers_company_external" ON "customers" USING btree ("company_id","external_id");