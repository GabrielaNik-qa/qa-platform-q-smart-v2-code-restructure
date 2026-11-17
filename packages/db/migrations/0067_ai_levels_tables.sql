CREATE TABLE "ai_levels" (
	"level" text PRIMARY KEY NOT NULL,
	"models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_task_levels" (
	"feature" text PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
