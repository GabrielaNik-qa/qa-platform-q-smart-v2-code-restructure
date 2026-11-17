-- Which calls enter the app (Phase 6): the minimum call length a company sets, and the count of calls left out. Behind
-- the company wall like every company table.
ALTER TABLE company_intake ADD CONSTRAINT company_intake_limits CHECK (
  (min_call_seconds IS NULL OR min_call_seconds BETWEEN 1 AND 86400) AND calls_left_out >= 0
);
--> statement-breakpoint
ALTER TABLE company_intake ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY company_intake_wall ON company_intake USING (company_id = app_company()) WITH CHECK (company_id = app_company());
