-- The AI engine: the company's AI rules and the log of every AI call. The log stays when a team or a person goes.
ALTER TABLE ai_calls DROP CONSTRAINT ai_calls_team_same_company;
--> statement-breakpoint
ALTER TABLE ai_calls ADD CONSTRAINT ai_calls_team_same_company FOREIGN KEY (team_id, company_id)
  REFERENCES teams (id, company_id) ON DELETE SET NULL (team_id);
--> statement-breakpoint
ALTER TABLE ai_calls DROP CONSTRAINT ai_calls_by_same_company;
--> statement-breakpoint
ALTER TABLE ai_calls ADD CONSTRAINT ai_calls_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
-- The engine's limits, in the database too.
ALTER TABLE ai_calls ADD CONSTRAINT ai_calls_limits CHECK (
  feature ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$' AND data_class IN ('test', 'client')
  AND status IN ('ok', 'invalid', 'error', 'timeout', 'rateLimit', 'off', 'limit', 'noModel', 'unavailable')
  AND input_tokens >= 0 AND output_tokens >= 0 AND cost_micro_usd >= 0 AND wait_ms >= 0 AND attempt >= 1
  AND (error IS NULL OR length(error) <= 60)
);
--> statement-breakpoint
ALTER TABLE ai_settings ADD CONSTRAINT ai_settings_limits CHECK (
  jsonb_typeof(limits) = 'object' AND length(limits::text) <= 20000 AND cardinality(allowed_providers) <= 20
);
--> statement-breakpoint
-- The company wall.
ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_settings_wall ON ai_settings USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE ai_calls ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_calls_wall ON ai_calls USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- The log only ever grows: the server adds and reads calls, never changes or deletes them.
REVOKE UPDATE, DELETE ON ai_calls FROM qsmart_app;
