-- Learning › Quizzes (Phase 6, piece 2): the limits, the company wall and what the server may change.
ALTER TABLE quizzes ADD CONSTRAINT quizzes_limits CHECK (
  length(title) BETWEEN 1 AND 150 AND length(description) <= 400 AND length(by_name) <= 120
  AND kind IN ('weekly', 'monthly', 'category', 'custom') AND status IN ('draft', 'published')
  AND pass BETWEEN 1 AND 100 AND tries BETWEEN 1 AND 20
  AND jsonb_typeof(topics) = 'array' AND jsonb_array_length(topics) <= 10 AND length(topics::text) <= 600
  AND cardinality(article_ids) <= 30 AND cardinality(assign_teams) <= 30 AND cardinality(assign_people) <= 300
  AND jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) <= 50 AND length(questions::text) <= 100000
);
--> statement-breakpoint
ALTER TABLE quiz_attempts ADD CONSTRAINT quiz_attempts_limits CHECK (score BETWEEN 0 AND 100);
--> statement-breakpoint
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY quizzes_wall ON quizzes USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY quiz_attempts_wall ON quiz_attempts USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- What the server may change: never the company or the creation time; the tries only ever grow (they go with their quiz).
REVOKE UPDATE ON quizzes FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (title, description, kind, topics, article_ids, pass, due_on, assign_all, assign_teams, assign_people, status, tries, questions, updated_at)
  ON quizzes TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON quiz_attempts FROM qsmart_app;
