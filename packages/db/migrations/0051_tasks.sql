-- Tasks stay when their person, team or the person who gave them leaves or is deleted (the names are kept).
ALTER TABLE tasks DROP CONSTRAINT tasks_assignee_same_company;
--> statement-breakpoint
ALTER TABLE tasks ADD CONSTRAINT tasks_assignee_same_company FOREIGN KEY (assignee_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (assignee_membership_id);
--> statement-breakpoint
ALTER TABLE tasks DROP CONSTRAINT tasks_team_same_company;
--> statement-breakpoint
ALTER TABLE tasks ADD CONSTRAINT tasks_team_same_company FOREIGN KEY (team_id, company_id)
  REFERENCES teams (id, company_id) ON DELETE SET NULL (team_id);
--> statement-breakpoint
ALTER TABLE tasks DROP CONSTRAINT tasks_by_same_company;
--> statement-breakpoint
ALTER TABLE tasks ADD CONSTRAINT tasks_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
-- Today's limits, in the database too.
ALTER TABLE tasks ADD CONSTRAINT tasks_limits CHECK (
  length(title) BETWEEN 1 AND 150 AND length(description) <= 1500 AND points BETWEEN 0 AND 1000
  AND (start_on IS NULL OR due_on IS NULL OR start_on <= due_on)
  AND (colour = '' OR colour ~ '^#[0-9a-fA-F]{6}$') AND length(category) <= 40
  AND jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) <= 30 AND length(steps::text) <= 12000
  AND jsonb_typeof(labels) = 'array' AND jsonb_array_length(labels) <= 8 AND length(labels::text) <= 400
  AND jsonb_typeof(history) = 'array' AND jsonb_array_length(history) <= 60 AND length(history::text) <= 30000
);
--> statement-breakpoint
-- The company wall.
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tasks_wall ON tasks USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- What the server may change in a task: never its company, its group, who gave it or when.
REVOKE UPDATE ON tasks FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (
  title, description, kind, priority, points, start_on, due_on, status, needs_review, assignee_membership_id,
  assignee_name, team_id, team_name, steps, labels, colour, category, pinned, archived_at, started_at, sent_at,
  completed_at, history, updated_at
) ON tasks TO qsmart_app;
