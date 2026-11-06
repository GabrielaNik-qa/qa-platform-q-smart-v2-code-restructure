CREATE TYPE "public"."calibration_status" AS ENUM('planned', 'held', 'closed');--> statement-breakpoint
CREATE TABLE "calibration_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"calibration_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"impression" text DEFAULT '' NOT NULL,
	"done" text DEFAULT '' NOT NULL,
	"wrote_at" timestamp with time zone,
	CONSTRAINT "calibration_participants_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
CREATE TABLE "calibration_reviews" (
	"company_id" uuid NOT NULL,
	"calibration_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calibration_scores" (
	"company_id" uuid NOT NULL,
	"calibration_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calibrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"held_on" date NOT NULL,
	"status" "calibration_status" DEFAULT 'planned' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"team_ids" uuid[] DEFAULT '{}' NOT NULL,
	"decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reference" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"by_membership_id" uuid,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calibrations_id_company" UNIQUE("id","company_id")
);
--> statement-breakpoint
ALTER TABLE "calibration_participants" ADD CONSTRAINT "calibration_participants_calibration" FOREIGN KEY ("calibration_id","company_id") REFERENCES "public"."calibrations"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_participants" ADD CONSTRAINT "calibration_participants_member" FOREIGN KEY ("membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_reviews" ADD CONSTRAINT "calibration_reviews_calibration" FOREIGN KEY ("calibration_id","company_id") REFERENCES "public"."calibrations"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_reviews" ADD CONSTRAINT "calibration_reviews_review" FOREIGN KEY ("review_id","company_id") REFERENCES "public"."reviews"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_scores" ADD CONSTRAINT "calibration_scores_calibration" FOREIGN KEY ("calibration_id","company_id") REFERENCES "public"."calibrations"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_scores" ADD CONSTRAINT "calibration_scores_review" FOREIGN KEY ("review_id","company_id") REFERENCES "public"."reviews"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_scores" ADD CONSTRAINT "calibration_scores_participant" FOREIGN KEY ("participant_id","company_id") REFERENCES "public"."calibration_participants"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibrations" ADD CONSTRAINT "calibrations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibrations" ADD CONSTRAINT "calibrations_by_same_company" FOREIGN KEY ("by_membership_id","company_id") REFERENCES "public"."memberships"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calibration_participants_pair" ON "calibration_participants" USING btree ("calibration_id","membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calibration_reviews_pair" ON "calibration_reviews" USING btree ("calibration_id","review_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calibration_scores_one" ON "calibration_scores" USING btree ("calibration_id","review_id","participant_id");