-- Which AI models Q-smart offers to client companies (the owner area, 17 November). Every company's AI engine may read
-- the list; nobody but the owner changes it, through platform_set_ai_offer, which checks again inside the database that
-- the Firebase account it gets is a platform owner.
ALTER TABLE ai_offers ADD CONSTRAINT ai_offers_limits CHECK (
  model_id ~ '^[a-z0-9_-]+/[A-Za-z0-9@/._:-]+$' AND length(model_id) <= 160 AND (offered OR NOT recommended)
);
--> statement-breakpoint
ALTER TABLE ai_offers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_offers_read ON ai_offers FOR SELECT USING (true);
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON ai_offers FROM qsmart_app;
--> statement-breakpoint
CREATE FUNCTION platform_set_ai_offer(p_firebase_uid text, p_model_id text, p_offered boolean, p_recommended boolean)
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF NOT is_platform_admin(p_firebase_uid) THEN
      RAISE EXCEPTION 'not a platform owner' USING ERRCODE = '42501';
    END IF;
    INSERT INTO ai_offers (model_id, offered, recommended, updated_at)
      VALUES (p_model_id, p_offered, p_offered AND p_recommended, now())
      ON CONFLICT (model_id) DO UPDATE
      SET offered = EXCLUDED.offered, recommended = EXCLUDED.recommended, updated_at = now();
  END
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_set_ai_offer(text, text, boolean, boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_set_ai_offer(text, text, boolean, boolean) TO qsmart_app;
