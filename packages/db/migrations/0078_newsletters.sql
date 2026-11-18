-- Learning › Newsletter (Phase 6, piece 3): the limits, the company wall and what the server may change.
ALTER TABLE newsletters ADD CONSTRAINT newsletters_limits CHECK (
  month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND length(title) BETWEEN 1 AND 150 AND length(intro) <= 3000
  AND length(by_name) <= 120
  AND jsonb_typeof(items) = 'array' AND jsonb_array_length(items) <= 40 AND length(items::text) <= 120000
);
--> statement-breakpoint
ALTER TABLE newsletters ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY newsletters_wall ON newsletters USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE newsletter_reads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY newsletter_reads_wall ON newsletter_reads USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- What the server may change: never the company, who wrote it or when; reads are only added or removed.
REVOKE UPDATE ON newsletters FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (month, title, intro, published, items, updated_at) ON newsletters TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON newsletter_reads FROM qsmart_app;
