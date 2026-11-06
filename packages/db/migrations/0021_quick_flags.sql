-- Quick flags stay when their agent, team or the person who gave them leaves or is deleted (the names are kept).
ALTER TABLE quick_flags DROP CONSTRAINT quick_flags_agent_same_company;
--> statement-breakpoint
ALTER TABLE quick_flags ADD CONSTRAINT quick_flags_agent_same_company FOREIGN KEY (agent_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (agent_membership_id);
--> statement-breakpoint
ALTER TABLE quick_flags DROP CONSTRAINT quick_flags_team_same_company;
--> statement-breakpoint
ALTER TABLE quick_flags ADD CONSTRAINT quick_flags_team_same_company FOREIGN KEY (team_id, company_id)
  REFERENCES teams (id, company_id) ON DELETE SET NULL (team_id);
--> statement-breakpoint
ALTER TABLE quick_flags DROP CONSTRAINT quick_flags_by_same_company;
--> statement-breakpoint
ALTER TABLE quick_flags ADD CONSTRAINT quick_flags_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
-- Today's limits, in the database too.
ALTER TABLE quick_flags ADD CONSTRAINT quick_flags_lead_id CHECK (length(lead_id) BETWEEN 1 AND 60);
--> statement-breakpoint
ALTER TABLE quick_flags ADD CONSTRAINT quick_flags_comment CHECK (length(comment) <= 1000);
--> statement-breakpoint
-- The company wall.
ALTER TABLE quick_flags ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY quick_flags_wall ON quick_flags USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- What the server may change in a flag: never its company, who gave it or when.
REVOKE UPDATE ON quick_flags FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (
  type, channel, agent_membership_id, agent_name, team_id, team_name, lead_id, flagged_on, campaign, lead_link,
  conversation_link, comment, updated_at
) ON quick_flags TO qsmart_app;
