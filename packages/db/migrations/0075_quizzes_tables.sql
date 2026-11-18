CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"quiz_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"passed" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'custom' NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"article_ids" uuid[] DEFAULT '{}' NOT NULL,
	"pass" integer DEFAULT 80 NOT NULL,
	"due_on" date,
	"assign_all" boolean DEFAULT true NOT NULL,
	"assign_teams" uuid[] DEFAULT '{}' NOT NULL,
	"assign_people" uuid[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"tries" integer DEFAULT 3 NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"by_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quizzes_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_same_company" FOREIGN KEY ("quiz_id","company_id") REFERENCES "public"."quizzes"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_member_same_company" FOREIGN KEY ("membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_attempts_quiz" ON "quiz_attempts" USING btree ("company_id","quiz_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_person" ON "quiz_attempts" USING btree ("company_id","membership_id");--> statement-breakpoint
CREATE INDEX "quizzes_company_status" ON "quizzes" USING btree ("company_id","status");