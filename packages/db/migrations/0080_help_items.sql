-- Help inside the app and the script builder (Phase 6, piece 4): the limits, the company wall and what the server may change.
ALTER TABLE help_items ADD CONSTRAINT help_items_limits CHECK (
  kind IN ('faq', 'glossary', 'video', 'tour', 'script')
  AND length(title) BETWEEN 1 AND 200 AND length(body) <= 8000 AND length(topic) <= 60
  AND length(link) <= 500 AND (link = '' OR link ~ '^https://[^[:space:]]+$')
  AND (minutes IS NULL OR minutes BETWEEN 1 AND 600)
  AND role IN ('all', 'admin', 'reviewer', 'lead', 'trainer', 'agent')
  AND length(page) <= 100 AND length(by_name) <= 120
  AND jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) <= 40 AND length(steps::text) <= 60000
);
--> statement-breakpoint
ALTER TABLE help_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY help_items_wall ON help_items USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- What the server may change: never the company, the kind, who wrote it or when.
REVOKE UPDATE ON help_items FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (title, body, topic, link, minutes, role, page, steps, updated_at) ON help_items TO qsmart_app;
