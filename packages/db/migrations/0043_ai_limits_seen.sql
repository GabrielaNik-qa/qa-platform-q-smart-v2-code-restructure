-- The latest figures each AI company sent about its limits, per model, behind the company wall.
ALTER TABLE ai_limits_seen ADD CONSTRAINT ai_limits_seen_limits CHECK (
  provider ~ '^[a-z][a-z0-9_]{1,30}$' AND length(model) <= 120
  AND jsonb_typeof(limits) = 'object' AND length(limits::text) <= 2000
);
--> statement-breakpoint
ALTER TABLE ai_limits_seen ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_limits_seen_wall ON ai_limits_seen USING (company_id = app_company()) WITH CHECK (company_id = app_company());
