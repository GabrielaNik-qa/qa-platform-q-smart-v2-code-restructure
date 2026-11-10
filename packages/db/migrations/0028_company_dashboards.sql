ALTER TABLE "companies" ADD COLUMN "dashboards" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- Home › Personalize: the server may change a company's dashboards (shared ones, and each role's home), nothing else new.
GRANT UPDATE (dashboards) ON companies TO qsmart_app;
--> statement-breakpoint
-- My dashboards are saved with my account (per company), so my choices may now be a little bigger.
CREATE OR REPLACE FUNCTION update_my_prefs(p_firebase_uid text, p_prefs jsonb)
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF jsonb_typeof(p_prefs) <> 'object' OR length(p_prefs::text) > 60000 THEN
      RAISE EXCEPTION 'prefs must be a small object' USING ERRCODE = '22023';
    END IF;
    UPDATE users SET prefs = p_prefs WHERE firebase_uid = p_firebase_uid;
  END
  $$;
