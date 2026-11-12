-- One-to-ones (Phase 4, step 5): a one-to-one keeps its template (or not, if the template is deleted: it keeps its own
-- copy of the sections), templates stay when the person who made them leaves.
ALTER TABLE coaching_sessions ADD CONSTRAINT coaching_sessions_template_same_company FOREIGN KEY (template_id, company_id)
  REFERENCES one_to_one_templates (id, company_id) ON DELETE SET NULL (template_id);
--> statement-breakpoint
ALTER TABLE one_to_one_templates DROP CONSTRAINT one_to_one_templates_by_same_company;
--> statement-breakpoint
ALTER TABLE one_to_one_templates ADD CONSTRAINT one_to_one_templates_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
-- Today's limits, in the database too.
ALTER TABLE coaching_sessions ADD CONSTRAINT coaching_sessions_one_to_one CHECK (
  period IN ('week', 'month', 'year', 'custom') AND state IN ('', 'draft', 'sent', 'signed')
  AND (period_from IS NULL OR period_to IS NULL OR period_from <= period_to)
  AND jsonb_typeof(sections) = 'array' AND jsonb_array_length(sections) <= 30 AND length(sections::text) <= 30000
  AND jsonb_typeof(answers) = 'object' AND length(answers::text) <= 60000
  AND (kind = 'o2o' OR state = '')
);
--> statement-breakpoint
ALTER TABLE one_to_one_templates ADD CONSTRAINT one_to_one_templates_limits CHECK (
  length(name) BETWEEN 1 AND 80
  AND jsonb_typeof(team_ids) = 'array' AND jsonb_array_length(team_ids) <= 30
  AND jsonb_typeof(sections) = 'array' AND jsonb_array_length(sections) BETWEEN 1 AND 30 AND length(sections::text) <= 30000
);
--> statement-breakpoint
ALTER TABLE one_to_one_targets ADD CONSTRAINT one_to_one_targets_limits CHECK (
  target BETWEEN 1 AND 10 AND jsonb_typeof(teams) = 'object' AND length(teams::text) <= 4000
);
--> statement-breakpoint
-- The company wall.
ALTER TABLE one_to_one_templates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY one_to_one_templates_wall ON one_to_one_templates USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE one_to_one_targets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY one_to_one_targets_wall ON one_to_one_targets USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- What the server may change: never a row's company, who made it or when.
GRANT UPDATE (template_id, period, period_from, period_to, sections, answers, state, lead_signature, sent_at)
  ON coaching_sessions TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON one_to_one_templates FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (name, team_ids, sections, updated_at) ON one_to_one_templates TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON one_to_one_targets FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (target, teams, updated_at) ON one_to_one_targets TO qsmart_app;
