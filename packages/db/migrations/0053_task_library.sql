-- Cards stay when their template or sequence is deleted (they keep the sequence's name); templates, sequences and
-- their rounds stay when the person who made them leaves.
ALTER TABLE tasks DROP CONSTRAINT tasks_template_same_company;
--> statement-breakpoint
ALTER TABLE tasks ADD CONSTRAINT tasks_template_same_company FOREIGN KEY (template_id, company_id)
  REFERENCES task_templates (id, company_id) ON DELETE SET NULL (template_id);
--> statement-breakpoint
ALTER TABLE tasks DROP CONSTRAINT tasks_run_same_company;
--> statement-breakpoint
ALTER TABLE tasks ADD CONSTRAINT tasks_run_same_company FOREIGN KEY (run_id, company_id)
  REFERENCES task_sequence_runs (id, company_id) ON DELETE SET NULL (run_id);
--> statement-breakpoint
ALTER TABLE task_templates DROP CONSTRAINT task_templates_by_same_company;
--> statement-breakpoint
ALTER TABLE task_templates ADD CONSTRAINT task_templates_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
ALTER TABLE task_sequences DROP CONSTRAINT task_sequences_by_same_company;
--> statement-breakpoint
ALTER TABLE task_sequences ADD CONSTRAINT task_sequences_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
ALTER TABLE task_sequence_runs DROP CONSTRAINT task_sequence_runs_by_same_company;
--> statement-breakpoint
ALTER TABLE task_sequence_runs ADD CONSTRAINT task_sequence_runs_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
-- Today's limits, in the database too.
ALTER TABLE task_templates ADD CONSTRAINT task_templates_limits CHECK (
  length(title) BETWEEN 1 AND 150 AND length(description) <= 1500 AND kind IN ('task', 'checklist', 'target')
  AND points BETWEEN 0 AND 1000 AND (colour = '' OR colour ~ '^#[0-9a-fA-F]{6}$') AND length(category) <= 40
  AND freq IN ('none', 'daily', 'weekly', 'monthly', 'quarterly') AND weekday BETWEEN 0 AND 6
  AND monthday BETWEEN 1 AND 28
  AND jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) <= 30 AND length(steps::text) <= 12000
  AND jsonb_typeof(labels) = 'array' AND jsonb_array_length(labels) <= 8 AND length(labels::text) <= 400
  AND jsonb_typeof(user_ids) = 'array' AND jsonb_array_length(user_ids) <= 200
  AND jsonb_typeof(team_ids) = 'array' AND jsonb_array_length(team_ids) <= 50
);
--> statement-breakpoint
ALTER TABLE task_sequences ADD CONSTRAINT task_sequences_limits CHECK (
  length(name) BETWEEN 1 AND 80 AND length(description) <= 600
  AND jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) BETWEEN 1 AND 30 AND length(steps::text) <= 60000
);
--> statement-breakpoint
ALTER TABLE task_sequence_runs ADD CONSTRAINT task_sequence_runs_limits CHECK (
  repeat IN ('none', 'monthly', 'quarterly') AND (until_on IS NULL OR until_on >= start_on)
  AND jsonb_typeof(user_ids) = 'array' AND jsonb_array_length(user_ids) <= 200
  AND jsonb_typeof(team_ids) = 'array' AND jsonb_array_length(team_ids) <= 50
  AND jsonb_typeof(cycles) = 'array' AND jsonb_array_length(cycles) <= 50
);
--> statement-breakpoint
ALTER TABLE tasks ADD CONSTRAINT tasks_library_limits CHECK (
  (recur_key IS NULL OR length(recur_key) <= 120) AND length(sequence_name) <= 80
  AND (step_no IS NULL OR step_no BETWEEN 1 AND 30) AND (step_count IS NULL OR step_count BETWEEN 1 AND 30)
);
--> statement-breakpoint
-- The company wall.
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY task_templates_wall ON task_templates USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE task_sequences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY task_sequences_wall ON task_sequences USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE task_sequence_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY task_sequence_runs_wall ON task_sequence_runs USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- What the server may change: never a row's company, who made it or when.
REVOKE UPDATE ON task_templates FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (
  title, description, kind, priority, points, steps, labels, colour, category, needs_review, freq, weekday, monthday,
  until_on, user_ids, team_ids, updated_at
) ON task_templates TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON task_sequences FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (name, description, steps, updated_at) ON task_sequences TO qsmart_app;
--> statement-breakpoint
-- a round of a sequence: only its rounds given and whether it goes on
REVOKE UPDATE ON task_sequence_runs FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (cycles, active) ON task_sequence_runs TO qsmart_app;
