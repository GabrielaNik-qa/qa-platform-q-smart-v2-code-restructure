CREATE TABLE "kb_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"folder_id" uuid,
	"title" text NOT NULL,
	"emoji" text DEFAULT '' NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"req_on" boolean DEFAULT false NOT NULL,
	"req_teams" uuid[] DEFAULT '{}' NOT NULL,
	"quiz" jsonb,
	"reactions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"comments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"author_membership_id" uuid,
	"author_name" text DEFAULT '' NOT NULL,
	"editor_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kb_articles_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "kb_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"passed" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"colour" text DEFAULT '#2563eb' NOT NULL,
	"icon" text DEFAULT '📁' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"req_on" boolean DEFAULT false NOT NULL,
	"req_teams" uuid[] DEFAULT '{}' NOT NULL,
	"teams" uuid[] DEFAULT '{}' NOT NULL,
	"by_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kb_folders_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "kb_reads" (
	"company_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kb_reads_company_id_membership_id_article_id_pk" PRIMARY KEY("company_id","membership_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "kb_stars" (
	"company_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kb_stars_company_id_membership_id_article_id_pk" PRIMARY KEY("company_id","membership_id","article_id")
);
--> statement-breakpoint
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_folder_same_company" FOREIGN KEY ("folder_id","company_id") REFERENCES "public"."kb_folders"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_author_same_company" FOREIGN KEY ("author_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_attempts" ADD CONSTRAINT "kb_attempts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_attempts" ADD CONSTRAINT "kb_attempts_member_same_company" FOREIGN KEY ("membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_attempts" ADD CONSTRAINT "kb_attempts_article_same_company" FOREIGN KEY ("article_id","company_id") REFERENCES "public"."kb_articles"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_folders" ADD CONSTRAINT "kb_folders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_folders" ADD CONSTRAINT "kb_folders_parent_same_company" FOREIGN KEY ("parent_id","company_id") REFERENCES "public"."kb_folders"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_reads" ADD CONSTRAINT "kb_reads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_reads" ADD CONSTRAINT "kb_reads_member_same_company" FOREIGN KEY ("membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_reads" ADD CONSTRAINT "kb_reads_article_same_company" FOREIGN KEY ("article_id","company_id") REFERENCES "public"."kb_articles"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_stars" ADD CONSTRAINT "kb_stars_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_stars" ADD CONSTRAINT "kb_stars_member_same_company" FOREIGN KEY ("membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_stars" ADD CONSTRAINT "kb_stars_article_same_company" FOREIGN KEY ("article_id","company_id") REFERENCES "public"."kb_articles"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kb_articles_folder" ON "kb_articles" USING btree ("company_id","folder_id");--> statement-breakpoint
CREATE INDEX "kb_attempts_person" ON "kb_attempts" USING btree ("company_id","membership_id","article_id");--> statement-breakpoint
CREATE INDEX "kb_folders_parent" ON "kb_folders" USING btree ("company_id","parent_id");