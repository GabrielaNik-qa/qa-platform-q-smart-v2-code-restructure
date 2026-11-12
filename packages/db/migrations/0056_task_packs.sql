-- Packs (12 November): a pack or sequence can also be given again every week.
ALTER TABLE task_sequence_runs DROP CONSTRAINT task_sequence_runs_limits;
--> statement-breakpoint
ALTER TABLE task_sequence_runs ADD CONSTRAINT task_sequence_runs_limits CHECK (
  repeat IN ('none', 'weekly', 'monthly', 'quarterly') AND (until_on IS NULL OR until_on >= start_on)
  AND jsonb_typeof(user_ids) = 'array' AND jsonb_array_length(user_ids) <= 200
  AND jsonb_typeof(team_ids) = 'array' AND jsonb_array_length(team_ids) <= 50
  AND jsonb_typeof(cycles) = 'array' AND jsonb_array_length(cycles) <= 50
);
