-- Teams, workspaces, skills and languages: the company wall for the new tables, and the team lead link.

-- The team lead is a membership of the same company (a team can never be led from another company).
-- If the lead's membership is removed, the team simply has no lead until an admin chooses one.
ALTER TABLE teams ADD CONSTRAINT teams_lead_same_company
  FOREIGN KEY (lead_membership_id, company_id) REFERENCES memberships (id, company_id) ON DELETE SET NULL (lead_membership_id);
--> statement-breakpoint
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspaces_wall ON workspaces USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE workspace_teams ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_teams_wall ON workspace_teams
  USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE workspace_staff ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_staff_wall ON workspace_staff
  USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY skills_wall ON skills USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE membership_skills ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY membership_skills_wall ON membership_skills
  USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE team_skills ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY team_skills_wall ON team_skills USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- One Administration team per company, made with the company: the server may rename a team, describe it, colour it
-- and choose its lead, but never turn a team into Administration (or back), nor move it to another company.
CREATE UNIQUE INDEX teams_one_administration ON teams (company_id) WHERE is_administration;
--> statement-breakpoint
REVOKE UPDATE ON teams FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (name, description, color, lead_membership_id) ON teams TO qsmart_app;
--> statement-breakpoint
-- Skills, workspaces and their links are only ever added, renamed or removed: no row moves to another company.
REVOKE UPDATE ON workspace_teams, workspace_staff, membership_skills, team_skills FROM qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON skills FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (name) ON skills TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON workspaces FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (name, description, color) ON workspaces TO qsmart_app;
