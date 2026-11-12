-- "Not what I said" (Phase 3b): the answers of an AI review the agent marked, at most 50, kept small.
ALTER TABLE disputes ADD CONSTRAINT disputes_marks CHECK (
  jsonb_typeof(marks) = 'array' AND jsonb_array_length(marks) <= 50 AND length(marks::text) <= 40000
);
--> statement-breakpoint
-- The server adds marks (the agent) and writes the decisions (the person who resolves the dispute).
GRANT UPDATE (marks) ON disputes TO qsmart_app;
