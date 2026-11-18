-- Learning › Knowledge Base (Phase 6, piece 1): the limits, what happens when a folder or a person goes, the company wall
-- and what the server may change.
-- Deleting a folder deletes what is inside it (the server moves the content up one level first when asked to keep it).
ALTER TABLE kb_folders DROP CONSTRAINT kb_folders_parent_same_company;
--> statement-breakpoint
ALTER TABLE kb_folders ADD CONSTRAINT kb_folders_parent_same_company FOREIGN KEY (parent_id, company_id)
  REFERENCES kb_folders (id, company_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE kb_articles DROP CONSTRAINT kb_articles_folder_same_company;
--> statement-breakpoint
ALTER TABLE kb_articles ADD CONSTRAINT kb_articles_folder_same_company FOREIGN KEY (folder_id, company_id)
  REFERENCES kb_folders (id, company_id) ON DELETE CASCADE;
--> statement-breakpoint
-- An article stays when its author leaves (the name is kept).
ALTER TABLE kb_articles DROP CONSTRAINT kb_articles_author_same_company;
--> statement-breakpoint
ALTER TABLE kb_articles ADD CONSTRAINT kb_articles_author_same_company FOREIGN KEY (author_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (author_membership_id);
--> statement-breakpoint
ALTER TABLE kb_folders ADD CONSTRAINT kb_folders_limits CHECK (
  length(name) BETWEEN 1 AND 60 AND length(description) <= 400 AND length(icon) BETWEEN 1 AND 16
  AND colour ~ '^#[0-9a-fA-F]{6}$' AND length(by_name) <= 120
  AND cardinality(req_teams) <= 30 AND cardinality(teams) <= 30
);
--> statement-breakpoint
ALTER TABLE kb_articles ADD CONSTRAINT kb_articles_limits CHECK (
  length(title) BETWEEN 1 AND 150 AND length(body) <= 200000 AND length(emoji) <= 16
  AND jsonb_typeof(topics) = 'array' AND jsonb_array_length(topics) <= 10 AND length(topics::text) <= 600
  AND cardinality(req_teams) <= 30
  AND (quiz IS NULL OR (jsonb_typeof(quiz) = 'object' AND length(quiz::text) <= 60000))
  AND jsonb_typeof(reactions) = 'object' AND length(reactions::text) <= 60000
  AND jsonb_typeof(comments) = 'array' AND jsonb_array_length(comments) <= 200 AND length(comments::text) <= 600000
  AND length(author_name) <= 120 AND length(editor_name) <= 120
);
--> statement-breakpoint
ALTER TABLE kb_attempts ADD CONSTRAINT kb_attempts_limits CHECK (score BETWEEN 0 AND 100);
--> statement-breakpoint
-- The company wall.
ALTER TABLE kb_folders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY kb_folders_wall ON kb_folders USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY kb_articles_wall ON kb_articles USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE kb_reads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY kb_reads_wall ON kb_reads USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE kb_stars ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY kb_stars_wall ON kb_stars USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE kb_attempts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY kb_attempts_wall ON kb_attempts USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- What the server may change: never the company, the author or the creation time; reads and stars are only added or
-- removed; the tries at lesson tests only ever grow (they go with their article).
REVOKE UPDATE ON kb_folders FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (parent_id, name, colour, icon, description, req_on, req_teams, teams, updated_at) ON kb_folders TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON kb_articles FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (folder_id, title, emoji, topics, body, req_on, req_teams, quiz, reactions, comments, editor_name, updated_at)
  ON kb_articles TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON kb_reads FROM qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON kb_stars FROM qsmart_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON kb_attempts FROM qsmart_app;
