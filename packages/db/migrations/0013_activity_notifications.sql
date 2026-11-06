-- The activity log, the notification bell, Roles & permissions and My account › Notifications & Confirmations.

-- The company wall for the new tables.
ALTER TABLE activity ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY activity_wall ON activity USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notifications_wall ON notifications
  USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
-- Nobody changes or deletes an entry of the activity log: the server may only add entries and read them.
REVOKE UPDATE, DELETE ON activity FROM qsmart_app;
--> statement-breakpoint
-- A notification is only ever marked as read (and the server deletes one when its person asks).
REVOKE UPDATE ON notifications FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (read_at) ON notifications TO qsmart_app;
--> statement-breakpoint
-- In a company the server may change its name and its page rules (Roles & permissions), nothing else.
REVOKE UPDATE ON companies FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (name, page_rules) ON companies TO qsmart_app;
--> statement-breakpoint
-- My account now also reads and saves my own choices of messages and confirmations.
DROP FUNCTION my_profile(text);
--> statement-breakpoint
CREATE FUNCTION my_profile(p_firebase_uid text)
  RETURNS TABLE (name text, email text, language text, prefs jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT u.name, u.email, u.language, u.prefs FROM users u WHERE u.firebase_uid = p_firebase_uid $$;
--> statement-breakpoint
CREATE FUNCTION update_my_prefs(p_firebase_uid text, p_prefs jsonb)
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF jsonb_typeof(p_prefs) <> 'object' OR length(p_prefs::text) > 20000 THEN
      RAISE EXCEPTION 'prefs must be a small object' USING ERRCODE = '22023';
    END IF;
    UPDATE users SET prefs = p_prefs WHERE firebase_uid = p_firebase_uid;
  END
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION my_profile(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION update_my_prefs(text, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION my_profile(text) TO qsmart_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION update_my_prefs(text, jsonb) TO qsmart_app;
