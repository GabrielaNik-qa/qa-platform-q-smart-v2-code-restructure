-- The platform owner area. The owner of Q-smart (users.is_platform_admin) belongs to no company, so the company
-- wall shows them nothing. These functions are their only way in, and each one checks again, inside the database,
-- that the Firebase account it gets (the one the server has just verified) really is a platform owner.

-- People can't make themselves (or anyone) platform owners, or change whose Firebase account a person is:
-- the server may change only a person's name. Accounts are linked only through claim_invitation.
REVOKE UPDATE ON users FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (name) ON users TO qsmart_app;
--> statement-breakpoint
CREATE FUNCTION is_platform_admin(p_firebase_uid text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT coalesce((SELECT u.is_platform_admin FROM users u WHERE u.firebase_uid = p_firebase_uid), false) $$;
--> statement-breakpoint
CREATE FUNCTION platform_companies(p_firebase_uid text)
  RETURNS TABLE (id uuid, name text, created_at timestamptz, people bigint, admins bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT c.id, c.name, c.created_at, count(m.id), count(m.id) FILTER (WHERE m.role = 'admin')
    FROM companies c LEFT JOIN memberships m ON m.company_id = c.id
    WHERE is_platform_admin(p_firebase_uid)
    GROUP BY c.id
    ORDER BY c.name
  $$;
--> statement-breakpoint
-- A new client company with its Administration team, and its first admin invited by e-mail
-- (they get the company at their first sign-in with that e-mail, verified by Firebase).
CREATE FUNCTION platform_create_company(p_firebase_uid text, p_name text, p_admin_email text, p_admin_name text)
  RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_company uuid;
    v_team uuid;
    v_user uuid;
  BEGIN
    IF NOT is_platform_admin(p_firebase_uid) THEN
      RAISE EXCEPTION 'not a platform owner' USING ERRCODE = '42501';
    END IF;
    INSERT INTO companies (name) VALUES (trim(p_name)) RETURNING id INTO v_company;
    INSERT INTO teams (company_id, name, is_administration) VALUES (v_company, 'Administration', true) RETURNING id INTO v_team;
    SELECT u.id INTO v_user FROM users u WHERE lower(u.email) = lower(trim(p_admin_email));
    IF v_user IS NULL THEN
      INSERT INTO users (email, name) VALUES (lower(trim(p_admin_email)), trim(p_admin_name)) RETURNING id INTO v_user;
    END IF;
    INSERT INTO memberships (company_id, user_id, role, team_id) VALUES (v_company, v_user, 'admin', v_team);
    RETURN v_company;
  END
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION is_platform_admin(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_companies(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_create_company(text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION is_platform_admin(text) TO qsmart_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_companies(text) TO qsmart_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_create_company(text, text, text, text) TO qsmart_app;
