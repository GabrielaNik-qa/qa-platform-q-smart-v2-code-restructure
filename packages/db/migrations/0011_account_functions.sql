-- My account: a person reads and changes their own name and language, whether or not they belong to a company
-- (the owner of Q-smart belongs to none, so the company wall can't be used for this). Each function works only on
-- the account of the Firebase uid the server has just verified, and on nothing else.
ALTER TABLE users ADD CONSTRAINT users_language_known CHECK (language IS NULL OR language IN ('en', 'bg', 'fr'));
--> statement-breakpoint
CREATE FUNCTION my_profile(p_firebase_uid text)
  RETURNS TABLE (name text, email text, language text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT u.name, u.email, u.language FROM users u WHERE u.firebase_uid = p_firebase_uid $$;
--> statement-breakpoint
-- An empty value leaves that field as it is.
CREATE FUNCTION update_my_profile(p_firebase_uid text, p_name text, p_language text)
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF p_name IS NOT NULL AND length(trim(p_name)) NOT BETWEEN 2 AND 120 THEN
      RAISE EXCEPTION 'a name has 2 to 120 characters' USING ERRCODE = '22023';
    END IF;
    UPDATE users
      SET name = coalesce(nullif(trim(p_name), ''), name),
          language = coalesce(p_language, language)
      WHERE firebase_uid = p_firebase_uid;
  END
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION my_profile(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION update_my_profile(text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION my_profile(text) TO qsmart_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION update_my_profile(text, text, text) TO qsmart_app;
