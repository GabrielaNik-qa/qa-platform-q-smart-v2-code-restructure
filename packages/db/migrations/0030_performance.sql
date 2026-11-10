-- Goals, improvement plans and kudos stay when their team, agent or author goes (the names are kept).
ALTER TABLE goals DROP CONSTRAINT goals_team_same_company;
--> statement-breakpoint
ALTER TABLE goals ADD CONSTRAINT goals_team_same_company FOREIGN KEY (team_id, company_id)
  REFERENCES teams (id, company_id) ON DELETE SET NULL (team_id);
--> statement-breakpoint
ALTER TABLE goals DROP CONSTRAINT goals_agent_same_company;
--> statement-breakpoint
ALTER TABLE goals ADD CONSTRAINT goals_agent_same_company FOREIGN KEY (agent_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (agent_membership_id);
--> statement-breakpoint
ALTER TABLE goals DROP CONSTRAINT goals_by_same_company;
--> statement-breakpoint
ALTER TABLE goals ADD CONSTRAINT goals_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
ALTER TABLE improvement_plans DROP CONSTRAINT improvement_plans_agent_same_company;
--> statement-breakpoint
ALTER TABLE improvement_plans ADD CONSTRAINT improvement_plans_agent_same_company FOREIGN KEY (agent_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (agent_membership_id);
--> statement-breakpoint
ALTER TABLE improvement_plans DROP CONSTRAINT improvement_plans_by_same_company;
--> statement-breakpoint
ALTER TABLE improvement_plans ADD CONSTRAINT improvement_plans_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
ALTER TABLE kudos DROP CONSTRAINT kudos_to_same_company;
--> statement-breakpoint
ALTER TABLE kudos ADD CONSTRAINT kudos_to_same_company FOREIGN KEY (to_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (to_membership_id);
--> statement-breakpoint
ALTER TABLE kudos DROP CONSTRAINT kudos_by_same_company;
--> statement-breakpoint
ALTER TABLE kudos ADD CONSTRAINT kudos_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
-- Today's limits, in the database too.
ALTER TABLE goals ADD CONSTRAINT goals_limits CHECK (
  length(title) <= 150 AND value > 0 AND value <= 100000 AND month ~ '^\d{4}-(0[1-9]|1[0-2])$'
  AND channel IN ('', 'call', 'chat', 'email', 'other')
);
--> statement-breakpoint
ALTER TABLE improvement_plans ADD CONSTRAINT improvement_plans_limits CHECK (
  length(title) BETWEEN 1 AND 150 AND length(reason) <= 2000 AND length(agent_note) <= 1000 AND end_on >= start_on
  AND jsonb_typeof(goals) = 'array' AND jsonb_array_length(goals) <= 20
  AND jsonb_typeof(check_ins) = 'array' AND jsonb_array_length(check_ins) <= 100
);
--> statement-breakpoint
ALTER TABLE kudos ADD CONSTRAINT kudos_limits CHECK (length(text) BETWEEN 1 AND 500 AND length(badge) BETWEEN 1 AND 8);
--> statement-breakpoint
-- The company wall.
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY goals_wall ON goals USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE improvement_plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY improvement_plans_wall ON improvement_plans USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE kudos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY kudos_wall ON kudos USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- What the server may change: a goal's settings (never who made it); a plan's content, outcome and the agent's
-- signature (never whose plan it is or who made it); kudos are never changed, only deleted.
REVOKE UPDATE ON goals FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (title, scope, team_id, agent_membership_id, target_name, metric, value, channel, month, updated_at) ON goals TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON improvement_plans FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (title, reason, start_on, end_on, goals, check_ins, status, signed_at, agent_note, updated_at) ON improvement_plans TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON kudos FROM qsmart_app;
