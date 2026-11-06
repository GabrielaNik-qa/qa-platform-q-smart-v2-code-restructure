-- Reviews: they stay when their agent leaves, their reviewer leaves, their team or their scorecard is deleted (today's
-- rule): the link is let go, and the review keeps the names as they were. Always within the same company.
ALTER TABLE reviews DROP CONSTRAINT reviews_agent_same_company;
--> statement-breakpoint
ALTER TABLE reviews ADD CONSTRAINT reviews_agent_same_company FOREIGN KEY (agent_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (agent_membership_id);
--> statement-breakpoint
ALTER TABLE reviews DROP CONSTRAINT reviews_reviewer_same_company;
--> statement-breakpoint
ALTER TABLE reviews ADD CONSTRAINT reviews_reviewer_same_company FOREIGN KEY (reviewer_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (reviewer_membership_id);
--> statement-breakpoint
ALTER TABLE reviews DROP CONSTRAINT reviews_team_same_company;
--> statement-breakpoint
ALTER TABLE reviews ADD CONSTRAINT reviews_team_same_company FOREIGN KEY (team_id, company_id)
  REFERENCES teams (id, company_id) ON DELETE SET NULL (team_id);
--> statement-breakpoint
ALTER TABLE reviews DROP CONSTRAINT reviews_scorecard_same_company;
--> statement-breakpoint
ALTER TABLE reviews ADD CONSTRAINT reviews_scorecard_same_company FOREIGN KEY (scorecard_id, company_id)
  REFERENCES scorecards (id, company_id) ON DELETE SET NULL (scorecard_id);
--> statement-breakpoint
-- Today's limits, in the database too.
ALTER TABLE reviews ADD CONSTRAINT reviews_score_range CHECK (score IS NULL OR score BETWEEN 0 AND 100);
--> statement-breakpoint
ALTER TABLE reviews ADD CONSTRAINT reviews_lead_id CHECK (length(lead_id) BETWEEN 1 AND 60);
--> statement-breakpoint
ALTER TABLE reviews ADD CONSTRAINT reviews_status CHECK (status IN ('ok', 'disputed'));
--> statement-breakpoint
-- The company wall.
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY reviews_wall ON reviews USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- What the server may change in a review: never its company, its scorecard, who made it or when.
REVOKE UPDATE ON reviews FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (
  lead_id, agent_membership_id, agent_name, team_id, team_name, reviewed_on, channel, channel_name, categories, score,
  zero, not_scored, status, flag, campaign, comment, lead_link, recording_link, conversation_link, transcript,
  email_subject, seen_at, updated_at
) ON reviews TO qsmart_app;
