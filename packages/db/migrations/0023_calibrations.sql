-- Calibration sessions: they stay when the person who made them leaves (the name is kept).
ALTER TABLE calibrations DROP CONSTRAINT calibrations_by_same_company;
--> statement-breakpoint
ALTER TABLE calibrations ADD CONSTRAINT calibrations_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
-- Today's limits, in the database too.
ALTER TABLE calibrations ADD CONSTRAINT calibrations_title CHECK (length(title) BETWEEN 1 AND 150);
--> statement-breakpoint
ALTER TABLE calibrations ADD CONSTRAINT calibrations_notes CHECK (length(notes) <= 5000);
--> statement-breakpoint
ALTER TABLE calibrations ADD CONSTRAINT calibrations_decisions CHECK (jsonb_array_length(decisions) <= 30);
--> statement-breakpoint
ALTER TABLE calibration_participants ADD CONSTRAINT calibration_parts_text
  CHECK (length(impression) <= 4000 AND length(done) <= 4000);
--> statement-breakpoint
ALTER TABLE calibration_scores ADD CONSTRAINT calibration_scores_range CHECK (score BETWEEN 0 AND 100);
--> statement-breakpoint
ALTER TABLE calibration_scores ADD CONSTRAINT calibration_scores_note CHECK (length(note) <= 500);
--> statement-breakpoint
-- The company wall, for the four tables.
ALTER TABLE calibrations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY calibrations_wall ON calibrations USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE calibration_participants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY calibration_participants_wall ON calibration_participants
  USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE calibration_reviews ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY calibration_reviews_wall ON calibration_reviews
  USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE calibration_scores ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY calibration_scores_wall ON calibration_scores
  USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- What the server may change: never a row's company, who made a session, or whose part or score a row is.
REVOKE UPDATE ON calibrations FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (title, held_on, status, notes, team_ids, decisions, reference, updated_at) ON calibrations TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON calibration_participants FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (impression, done, wrote_at) ON calibration_participants TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON calibration_reviews FROM qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON calibration_scores FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (score, note, at) ON calibration_scores TO qsmart_app;
