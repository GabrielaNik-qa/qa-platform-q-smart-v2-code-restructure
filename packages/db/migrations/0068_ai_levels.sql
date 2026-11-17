-- The owner's effort levels and each AI task's level (17 November). Every company's AI engine may read them; nobody
-- but the owner changes them, through the two functions below, which check again inside the database that the
-- Firebase account they get is a platform owner.
ALTER TABLE ai_levels ADD CONSTRAINT ai_levels_limits CHECK (
  level IN ('light', 'standard', 'thorough')
  AND jsonb_typeof(models) = 'array' AND jsonb_array_length(models) <= 40 AND length(models::text) <= 6000
);
--> statement-breakpoint
ALTER TABLE ai_task_levels ADD CONSTRAINT ai_task_levels_limits CHECK (
  feature ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$' AND level IN ('light', 'standard', 'thorough')
);
--> statement-breakpoint
ALTER TABLE ai_levels ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_levels_read ON ai_levels FOR SELECT USING (true);
--> statement-breakpoint
ALTER TABLE ai_task_levels ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_task_levels_read ON ai_task_levels FOR SELECT USING (true);
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON ai_levels FROM qsmart_app;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON ai_task_levels FROM qsmart_app;
--> statement-breakpoint
CREATE FUNCTION platform_set_ai_level(p_firebase_uid text, p_level text, p_models jsonb)
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF NOT is_platform_admin(p_firebase_uid) THEN
      RAISE EXCEPTION 'not a platform owner' USING ERRCODE = '42501';
    END IF;
    INSERT INTO ai_levels (level, models, updated_at) VALUES (p_level, p_models, now())
      ON CONFLICT (level) DO UPDATE SET models = EXCLUDED.models, updated_at = now();
  END
  $$;
--> statement-breakpoint
CREATE FUNCTION platform_set_ai_task_level(p_firebase_uid text, p_feature text, p_level text)
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF NOT is_platform_admin(p_firebase_uid) THEN
      RAISE EXCEPTION 'not a platform owner' USING ERRCODE = '42501';
    END IF;
    INSERT INTO ai_task_levels (feature, level, updated_at) VALUES (p_feature, p_level, now())
      ON CONFLICT (feature) DO UPDATE SET level = EXCLUDED.level, updated_at = now();
  END
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_set_ai_level(text, text, jsonb) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_set_ai_task_level(text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_set_ai_level(text, text, jsonb) TO qsmart_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_set_ai_task_level(text, text, text) TO qsmart_app;
