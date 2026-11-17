ALTER TABLE "ai_test_runs" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_test_runs" ADD COLUMN "output_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_test_runs" ADD COLUMN "unusable" integer;