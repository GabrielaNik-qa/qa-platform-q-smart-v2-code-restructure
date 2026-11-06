-- Invitations: a person is added by e-mail before they have a Firebase account (users.firebase_uid empty).
-- The first time they sign in with that e-mail, verified by Firebase, the invitation becomes theirs.
-- The server calls this only with the Firebase account and e-mail it has just checked, and only when Firebase
-- says the e-mail is verified. An invitation that is already taken, or an account that already has one, changes nothing.
CREATE FUNCTION claim_invitation(p_firebase_uid text, p_email text) RETURNS integer
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    WITH claimed AS (
      UPDATE users SET firebase_uid = p_firebase_uid
      WHERE lower(email) = lower(p_email)
        AND firebase_uid IS NULL
        AND NOT EXISTS (SELECT 1 FROM users taken WHERE taken.firebase_uid = p_firebase_uid)
      RETURNING 1
    )
    SELECT count(*)::integer FROM claimed
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION claim_invitation(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION claim_invitation(text, text) TO qsmart_app;
