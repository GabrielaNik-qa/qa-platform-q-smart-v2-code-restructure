-- Saved reports and the export list stay when the person who made them goes (their name is kept).
ALTER TABLE reports DROP CONSTRAINT reports_by_same_company;
--> statement-breakpoint
ALTER TABLE reports ADD CONSTRAINT reports_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
ALTER TABLE exports DROP CONSTRAINT exports_by_same_company;
--> statement-breakpoint
ALTER TABLE exports ADD CONSTRAINT exports_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
-- Today's limits, in the database too.
ALTER TABLE reports ADD CONSTRAINT reports_limits CHECK (
  length(name) BETWEEN 1 AND 80 AND jsonb_typeof(cfg) = 'object' AND length(cfg::text) <= 4000
  AND jsonb_typeof(schedule) = 'object' AND length(schedule::text) <= 2000
);
--> statement-breakpoint
ALTER TABLE exports ADD CONSTRAINT exports_limits CHECK (
  kind IN ('reviews', 'flags', 'report') AND length(name) BETWEEN 1 AND 80 AND rows >= 0
);
--> statement-breakpoint
-- The company wall.
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY reports_wall ON reports USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE exports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY exports_wall ON exports USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- What the server may change: a report's name, settings, sharing, schedule and when it last arrived (never whose it
-- is); the export list is never changed, only added to and cleared.
REVOKE UPDATE ON reports FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (name, cfg, shared, schedule, last_sent_at, updated_at) ON reports TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON exports FROM qsmart_app;
--> statement-breakpoint
-- The timed job (Cloud Scheduler online, a timer on your PC) must find the companies that have scheduled reports. It
-- learns only their ids; it then reads each company's reports behind its own wall.
CREATE FUNCTION scheduled_report_companies()
  RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT DISTINCT company_id FROM reports WHERE schedule->>'freq' IN ('daily', 'weekly', 'monthly') $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION scheduled_report_companies() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION scheduled_report_companies() TO qsmart_app;
