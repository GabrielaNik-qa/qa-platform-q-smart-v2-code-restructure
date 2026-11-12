-- Sessions stay when the person who wrote them leaves (the name is kept).
ALTER TABLE coaching_sessions DROP CONSTRAINT coaching_sessions_by_same_company;
--> statement-breakpoint
ALTER TABLE coaching_sessions ADD CONSTRAINT coaching_sessions_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
-- Today's limits, in the database too.
ALTER TABLE coaching_sessions ADD CONSTRAINT coaching_sessions_limits CHECK (
  length(title) BETWEEN 1 AND 150 AND length(goals) <= 4000 AND length(notes) <= 8000
  AND jsonb_typeof(agents) = 'array' AND jsonb_array_length(agents) BETWEEN 1 AND 60 AND length(agents::text) <= 20000
  AND jsonb_typeof(focus) = 'array' AND jsonb_array_length(focus) <= 30 AND length(focus::text) <= 4000
  AND jsonb_typeof(topics) = 'array' AND jsonb_array_length(topics) <= 20 AND length(topics::text) <= 2000
  AND jsonb_typeof(actions) = 'array' AND jsonb_array_length(actions) <= 20 AND length(actions::text) <= 12000
  AND jsonb_typeof(signatures) = 'object' AND length(signatures::text) <= 40000
);
--> statement-breakpoint
-- The company wall.
ALTER TABLE coaching_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY coaching_sessions_wall ON coaching_sessions USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- What the server may change in a session: never its company, who wrote it or when.
REVOKE UPDATE ON coaching_sessions FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (
  kind, held_on, title, status, agents, focus, topics, goals, notes, follow_up_on, actions, signatures, updated_at
) ON coaching_sessions TO qsmart_app;
