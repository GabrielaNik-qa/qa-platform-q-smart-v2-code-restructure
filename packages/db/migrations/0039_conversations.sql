-- Conversations, transcripts, customers and the company's fields (Phase 3b, step 3).
-- A conversation stays when its agent, team or the person who added it goes (their names are kept); a review keeps its
-- score when its conversation is deleted.
ALTER TABLE conversations DROP CONSTRAINT conversations_agent_same_company;
--> statement-breakpoint
ALTER TABLE conversations ADD CONSTRAINT conversations_agent_same_company FOREIGN KEY (agent_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (agent_membership_id);
--> statement-breakpoint
ALTER TABLE conversations DROP CONSTRAINT conversations_team_same_company;
--> statement-breakpoint
ALTER TABLE conversations ADD CONSTRAINT conversations_team_same_company FOREIGN KEY (team_id, company_id)
  REFERENCES teams (id, company_id) ON DELETE SET NULL (team_id);
--> statement-breakpoint
ALTER TABLE conversations DROP CONSTRAINT conversations_customer_same_company;
--> statement-breakpoint
ALTER TABLE conversations ADD CONSTRAINT conversations_customer_same_company FOREIGN KEY (customer_id, company_id)
  REFERENCES customers (id, company_id) ON DELETE SET NULL (customer_id);
--> statement-breakpoint
ALTER TABLE conversations DROP CONSTRAINT conversations_by_same_company;
--> statement-breakpoint
ALTER TABLE conversations ADD CONSTRAINT conversations_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
ALTER TABLE reviews ADD CONSTRAINT reviews_conversation_same_company FOREIGN KEY (conversation_id, company_id)
  REFERENCES conversations (id, company_id) ON DELETE SET NULL (conversation_id);
--> statement-breakpoint
CREATE INDEX reviews_conversation ON reviews (conversation_id);
--> statement-breakpoint
-- The limits, in the database too.
ALTER TABLE companies ADD CONSTRAINT companies_transcript_days CHECK (transcript_days IN (0, 7, 14, 30, 60, 90, 180, 365));
--> statement-breakpoint
ALTER TABLE fields ADD CONSTRAINT fields_limits CHECK (
  object IN ('customer', 'conversation') AND key ~ '^[a-zA-Z][a-zA-Z0-9_]{0,39}$'
  AND type IN ('text', 'longText', 'number', 'decimal', 'money', 'date', 'checkbox', 'dropdown', 'multi', 'link')
  AND jsonb_typeof(labels) = 'object' AND length(labels::text) <= 2000
  AND jsonb_typeof(options) = 'array' AND length(options::text) <= 40000
);
--> statement-breakpoint
ALTER TABLE customers ADD CONSTRAINT customers_limits CHECK (
  length(external_id) <= 120 AND jsonb_typeof(values) = 'object' AND length(values::text) <= 60000
);
--> statement-breakpoint
ALTER TABLE conversations ADD CONSTRAINT conversations_limits CHECK (
  length(channel_name) <= 60 AND length(agent_name) <= 120 AND length(team_name) <= 120 AND length(link) <= 1000
  AND jsonb_typeof(values) = 'object' AND length(values::text) <= 60000 AND length(by_name) <= 120
);
--> statement-breakpoint
ALTER TABLE transcripts ADD CONSTRAINT transcripts_limits CHECK (length(text) BETWEEN 1 AND 100000);
--> statement-breakpoint
-- The company wall.
ALTER TABLE fields ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY fields_wall ON fields USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY customers_wall ON customers USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY conversations_wall ON conversations USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY transcripts_wall ON transcripts USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- What the server may change: the company's transcript days (with its other settings), a review's conversation, and
-- never whose a conversation is or when it was added.
GRANT UPDATE (name, page_rules, pass_rate, dashboards, planner, transcript_days) ON companies TO qsmart_app;
--> statement-breakpoint
GRANT UPDATE (conversation_id) ON reviews TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON conversations FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (channel, channel_name, started_at, agent_membership_id, agent_name, team_id, team_name, customer_id, link,
  values, updated_at) ON conversations TO qsmart_app;
--> statement-breakpoint
REVOKE UPDATE ON transcripts FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (text) ON transcripts TO qsmart_app;
--> statement-breakpoint
-- The timed job (Cloud Scheduler online, a timer on your PC): deletes the transcripts older than each company's days,
-- in every company, and the transcripts kept on reviews (QA Entry) the same way. Only the text goes: the conversation,
-- the review, its scores and comments stay. Returns how many were deleted.
CREATE FUNCTION delete_old_transcripts()
  RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  gone integer;
  blanked integer;
BEGIN
  DELETE FROM transcripts t USING conversations c, companies co
    WHERE t.conversation_id = c.id AND t.company_id = c.company_id AND co.id = c.company_id
      AND co.transcript_days > 0 AND c.started_at < now() - make_interval(days => co.transcript_days);
  GET DIAGNOSTICS gone = ROW_COUNT;
  UPDATE reviews r SET transcript = '' FROM companies co
    WHERE co.id = r.company_id AND r.transcript <> '' AND co.transcript_days > 0
      AND r.reviewed_on < (now() - make_interval(days => co.transcript_days))::date;
  GET DIAGNOSTICS blanked = ROW_COUNT;
  RETURN gone + blanked;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION delete_old_transcripts() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION delete_old_transcripts() TO qsmart_app;
