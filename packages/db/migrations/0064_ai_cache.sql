-- The AI engine's cache (Phase 5, AI step 4): its limits, the company wall, and what the server may change.
ALTER TABLE ai_cache ADD CONSTRAINT ai_cache_limits CHECK (
  key ~ '^[0-9a-f]{64}$'
  AND feature ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$'
  AND length(provider) BETWEEN 1 AND 40 AND length(model) BETWEEN 1 AND 120
  AND length(data::text) <= 200000
  AND expires_at > created_at AND expires_at <= created_at + interval '30 days'
);
--> statement-breakpoint
ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_cache_wall ON ai_cache USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
REVOKE UPDATE ON ai_cache FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (provider, model, data, created_at, expires_at) ON ai_cache TO qsmart_app;
--> statement-breakpoint
-- An answer that came from the cache is recorded in the AI log too (status "cached", no tokens, no cost).
ALTER TABLE ai_calls DROP CONSTRAINT ai_calls_limits;
--> statement-breakpoint
ALTER TABLE ai_calls ADD CONSTRAINT ai_calls_limits CHECK (
  feature ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$' AND data_class IN ('test', 'client')
  AND status IN ('ok', 'invalid', 'error', 'timeout', 'rateLimit', 'off', 'limit', 'noModel', 'unavailable', 'cached')
  AND input_tokens >= 0 AND output_tokens >= 0 AND cost_micro_usd >= 0 AND wait_ms >= 0 AND attempt >= 1
  AND (error IS NULL OR length(error) <= 60)
);
