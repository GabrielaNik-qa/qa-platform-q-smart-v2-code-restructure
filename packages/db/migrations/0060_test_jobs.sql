-- Test-set runs (Phase 5): today's limits in the database too, one running at a time per company, and the company wall.
ALTER TABLE ai_test_jobs ADD CONSTRAINT ai_test_jobs_limits CHECK (
  state IN ('running', 'done', 'stopped')
  AND waiting_for IN ('', 'busy', 'daily')
  AND jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) <= 1000 AND length(steps::text) <= 200000
  AND jsonb_typeof(busy) = 'object' AND length(busy::text) <= 2000
  AND length(by_name) <= 200
);
--> statement-breakpoint
CREATE UNIQUE INDEX ai_test_jobs_one_running ON ai_test_jobs (company_id) WHERE state = 'running';
--> statement-breakpoint
ALTER TABLE ai_test_jobs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_test_jobs_wall ON ai_test_jobs USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- What the server may change: never a run's company, who started it or when.
REVOKE UPDATE ON ai_test_jobs FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (state, steps, waiting_until, waiting_for, busy, updated_at, finished_at) ON ai_test_jobs TO qsmart_app;
