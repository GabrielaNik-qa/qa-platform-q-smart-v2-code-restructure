CREATE TABLE "ai_offers" (
	"model_id" text PRIMARY KEY NOT NULL,
	"offered" boolean DEFAULT true NOT NULL,
	"recommended" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
