-- Reviewer QA: a check stays when its review, agent, team, reviewer or the person who made it go (the names are kept).
ALTER TABLE reviewer_checks DROP CONSTRAINT reviewer_checks_review_same_company;
--> statement-breakpoint
ALTER TABLE reviewer_checks ADD CONSTRAINT reviewer_checks_review_same_company FOREIGN KEY (review_id, company_id)
  REFERENCES reviews (id, company_id) ON DELETE SET NULL (review_id);
--> statement-breakpoint
ALTER TABLE reviewer_checks DROP CONSTRAINT reviewer_checks_agent_same_company;
--> statement-breakpoint
ALTER TABLE reviewer_checks ADD CONSTRAINT reviewer_checks_agent_same_company FOREIGN KEY (agent_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (agent_membership_id);
--> statement-breakpoint
ALTER TABLE reviewer_checks DROP CONSTRAINT reviewer_checks_team_same_company;
--> statement-breakpoint
ALTER TABLE reviewer_checks ADD CONSTRAINT reviewer_checks_team_same_company FOREIGN KEY (team_id, company_id)
  REFERENCES teams (id, company_id) ON DELETE SET NULL (team_id);
--> statement-breakpoint
ALTER TABLE reviewer_checks DROP CONSTRAINT reviewer_checks_reviewer_same_company;
--> statement-breakpoint
ALTER TABLE reviewer_checks ADD CONSTRAINT reviewer_checks_reviewer_same_company FOREIGN KEY (reviewer_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (reviewer_membership_id);
--> statement-breakpoint
ALTER TABLE reviewer_checks DROP CONSTRAINT reviewer_checks_by_same_company;
--> statement-breakpoint
ALTER TABLE reviewer_checks ADD CONSTRAINT reviewer_checks_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
-- Today's limits, in the database too.
ALTER TABLE reviewer_checks ADD CONSTRAINT reviewer_checks_note CHECK (length(note) <= 2000);
--> statement-breakpoint
-- The company wall.
ALTER TABLE reviewer_checks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY reviewer_checks_wall ON reviewer_checks
  USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- What the server may change in a check: only the answers and the note (never which review, whose, or who made it).
REVOKE UPDATE ON reviewer_checks FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (fair, follows, critical, useful, note, updated_at) ON reviewer_checks TO qsmart_app;
