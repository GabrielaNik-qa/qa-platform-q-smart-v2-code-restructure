-- Pins stay when their review, agent, team or the person who made them go (the lead ID and the names are kept).
ALTER TABLE pins DROP CONSTRAINT pins_review_same_company;
--> statement-breakpoint
ALTER TABLE pins ADD CONSTRAINT pins_review_same_company FOREIGN KEY (review_id, company_id)
  REFERENCES reviews (id, company_id) ON DELETE SET NULL (review_id);
--> statement-breakpoint
ALTER TABLE pins DROP CONSTRAINT pins_agent_same_company;
--> statement-breakpoint
ALTER TABLE pins ADD CONSTRAINT pins_agent_same_company FOREIGN KEY (agent_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (agent_membership_id);
--> statement-breakpoint
ALTER TABLE pins DROP CONSTRAINT pins_team_same_company;
--> statement-breakpoint
ALTER TABLE pins ADD CONSTRAINT pins_team_same_company FOREIGN KEY (team_id, company_id)
  REFERENCES teams (id, company_id) ON DELETE SET NULL (team_id);
--> statement-breakpoint
ALTER TABLE pins DROP CONSTRAINT pins_by_same_company;
--> statement-breakpoint
ALTER TABLE pins ADD CONSTRAINT pins_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
-- Today's limits, in the database too.
ALTER TABLE pins ADD CONSTRAINT pins_note CHECK (length(note) BETWEEN 1 AND 2000);
--> statement-breakpoint
ALTER TABLE pins ADD CONSTRAINT pins_moment CHECK (length(moment) <= 10);
--> statement-breakpoint
-- The company wall.
ALTER TABLE pins ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pins_wall ON pins USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- What the server may change in a pin: the moment, what to talk about and whether it was talked about (never which
-- conversation, whose, or who made it).
REVOKE UPDATE ON pins FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (moment, note, status, updated_at) ON pins TO qsmart_app;
