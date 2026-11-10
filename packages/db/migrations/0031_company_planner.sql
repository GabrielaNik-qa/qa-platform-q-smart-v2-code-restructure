ALTER TABLE "companies" ADD COLUMN "planner" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- Planning › Review planner: the server may change the company's plan, nothing else new.
GRANT UPDATE (planner) ON companies TO qsmart_app;
