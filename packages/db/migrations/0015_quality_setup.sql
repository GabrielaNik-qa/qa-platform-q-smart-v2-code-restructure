-- Quality set-up: the company wall for the new tables, the pass rates' limits, and what the server may change.
ALTER TABLE scorecards ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY scorecards_wall ON scorecards USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE workspace_scorecards ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_scorecards_wall ON workspace_scorecards
  USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE category_library ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY category_library_wall ON category_library
  USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE root_causes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY root_causes_wall ON root_causes USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- A pass rate is from 1 to 100 (today's rule).
ALTER TABLE companies ADD CONSTRAINT companies_pass_rate CHECK (pass_rate BETWEEN 1 AND 100);
--> statement-breakpoint
ALTER TABLE teams ADD CONSTRAINT teams_pass_rate CHECK (pass_rate IS NULL OR pass_rate BETWEEN 1 AND 100);
--> statement-breakpoint
-- What the server may change: names, texts, settings; never which company a row belongs to.
REVOKE UPDATE ON companies FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (name, page_rules, pass_rate) ON companies TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON teams FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (name, description, color, lead_membership_id, pass_rate) ON teams TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON scorecards, workspace_scorecards, category_library, root_causes FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (name, description, tags, categories, updated_at) ON scorecards TO qsmart_app;
--> statement-breakpoint
GRANT UPDATE (name, description, critical, questions, active) ON category_library TO qsmart_app;
--> statement-breakpoint
GRANT UPDATE (name, description, active) ON root_causes TO qsmart_app;
