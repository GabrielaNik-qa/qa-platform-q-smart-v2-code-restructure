CREATE TABLE "platform_ai_accounts" (
	"provider" text PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"key_cipher" text NOT NULL,
	"key_hint" text NOT NULL,
	"account_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
