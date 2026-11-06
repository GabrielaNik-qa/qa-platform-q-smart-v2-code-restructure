-- Disputes: the agent disagrees with a review (once per review), they and the reviewers talk, and an admin or reviewer
-- resolves it. A dispute stays readable when its agent or the person who resolved it leaves (the names are kept).
ALTER TABLE disputes DROP CONSTRAINT disputes_agent_same_company;
--> statement-breakpoint
ALTER TABLE disputes ADD CONSTRAINT disputes_agent_same_company FOREIGN KEY (agent_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (agent_membership_id);
--> statement-breakpoint
ALTER TABLE disputes DROP CONSTRAINT disputes_resolver_same_company;
--> statement-breakpoint
ALTER TABLE disputes ADD CONSTRAINT disputes_resolver_same_company FOREIGN KEY (resolved_by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (resolved_by_membership_id);
--> statement-breakpoint
ALTER TABLE dispute_messages DROP CONSTRAINT dispute_messages_author_same_company;
--> statement-breakpoint
ALTER TABLE dispute_messages ADD CONSTRAINT dispute_messages_author_same_company FOREIGN KEY (author_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (author_membership_id);
--> statement-breakpoint
-- Today's limits, in the database too: a resolved dispute has its outcome, an open one has none.
ALTER TABLE disputes ADD CONSTRAINT disputes_resolved CHECK ((resolved_at IS NULL) = (outcome IS NULL));
--> statement-breakpoint
ALTER TABLE disputes ADD CONSTRAINT disputes_note CHECK (length(note) <= 500);
--> statement-breakpoint
ALTER TABLE dispute_messages ADD CONSTRAINT dispute_messages_text CHECK (length(text) BETWEEN 1 AND 1100);
--> statement-breakpoint
-- The company wall.
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY disputes_wall ON disputes USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE dispute_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY dispute_messages_wall ON dispute_messages
  USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- The server only ever resolves a dispute; it never deletes one (deleting the review does) or changes a message.
REVOKE UPDATE, DELETE ON disputes FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (resolved_at, outcome, note, resolved_by_membership_id, resolved_by_name) ON disputes TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON dispute_messages FROM qsmart_app;
