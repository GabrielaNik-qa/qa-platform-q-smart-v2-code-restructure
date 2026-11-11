-- AutoQA's test set: the made-up conversations and the expert's answers, and each AI model's runs on them.
ALTER TABLE ai_test_items ADD CONSTRAINT ai_test_items_limits CHECK (
  key ~ '^[a-z0-9-]{1,40}$' AND language IN ('en', 'bg', 'fr') AND length(industry) BETWEEN 1 AND 80
  AND length(title) BETWEEN 1 AND 120 AND channel IN ('call', 'chat', 'email', 'other')
  AND length(text) BETWEEN 1 AND 20000
  AND (expected IS NULL OR (jsonb_typeof(expected) = 'array' AND length(expected::text) <= 40000))
);
--> statement-breakpoint
ALTER TABLE ai_test_runs ADD CONSTRAINT ai_test_runs_limits CHECK (
  length(model_id) BETWEEN 1 AND 160 AND status IN ('ok', 'failed') AND wait_ms >= 0
  AND (answers IS NULL OR (jsonb_typeof(answers) = 'array' AND length(answers::text) <= 40000))
  AND (problem IS NULL OR length(problem) <= 120)
);
--> statement-breakpoint
ALTER TABLE ai_test_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_test_items_wall ON ai_test_items USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE ai_test_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_test_runs_wall ON ai_test_runs USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- The server changes only the expert's answers; a model's run is never changed (a new run is added).
REVOKE UPDATE ON ai_test_items FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (expected, expected_score, expected_by, expected_at) ON ai_test_items TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON ai_test_runs FROM qsmart_app;
