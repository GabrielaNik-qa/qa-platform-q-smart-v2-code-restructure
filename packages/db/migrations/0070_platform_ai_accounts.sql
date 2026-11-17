-- Q-smart's own AI accounts (17 November). The AI engine may read them (the keys are encrypted with the server's master
-- key); nobody but the owner changes them, through the two functions below, which check again inside the database that
-- the Firebase account they get is a platform owner.
ALTER TABLE platform_ai_accounts ADD CONSTRAINT platform_ai_accounts_limits CHECK (
  provider ~ '^[a-z0-9_-]{1,40}$' AND plan IN ('free', 'paid')
  AND length(key_cipher) BETWEEN 1 AND 2000 AND length(key_hint) <= 8
  AND (account_id IS NULL OR length(account_id) <= 100)
);
--> statement-breakpoint
ALTER TABLE platform_ai_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY platform_ai_accounts_read ON platform_ai_accounts FOR SELECT USING (true);
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON platform_ai_accounts FROM qsmart_app;
--> statement-breakpoint
CREATE FUNCTION platform_save_ai_account(
  p_firebase_uid text, p_provider text, p_plan text, p_key_cipher text, p_key_hint text, p_account_id text, p_enabled boolean
)
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF NOT is_platform_admin(p_firebase_uid) THEN
      RAISE EXCEPTION 'not a platform owner' USING ERRCODE = '42501';
    END IF;
    INSERT INTO platform_ai_accounts (provider, plan, key_cipher, key_hint, account_id, enabled, updated_at)
      VALUES (p_provider, p_plan, p_key_cipher, p_key_hint, p_account_id, p_enabled, now())
      ON CONFLICT (provider) DO UPDATE SET plan = EXCLUDED.plan, key_cipher = EXCLUDED.key_cipher,
        key_hint = EXCLUDED.key_hint, account_id = EXCLUDED.account_id, enabled = EXCLUDED.enabled, updated_at = now();
  END
  $$;
--> statement-breakpoint
CREATE FUNCTION platform_delete_ai_account(p_firebase_uid text, p_provider text)
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF NOT is_platform_admin(p_firebase_uid) THEN
      RAISE EXCEPTION 'not a platform owner' USING ERRCODE = '42501';
    END IF;
    DELETE FROM platform_ai_accounts WHERE provider = p_provider;
  END
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_save_ai_account(text, text, text, text, text, text, boolean) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_delete_ai_account(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_save_ai_account(text, text, text, text, text, text, boolean) TO qsmart_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_delete_ai_account(text, text) TO qsmart_app;
