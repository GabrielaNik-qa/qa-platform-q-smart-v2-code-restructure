-- People in a company: invitations, and accounts switched off.

-- A switched-off membership no longer opens its company.
CREATE OR REPLACE FUNCTION memberships_for(p_firebase_uid text)
  RETURNS TABLE (company_id uuid, company_name text, role member_role, user_id uuid, user_name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT m.company_id, c.name, m.role, u.id, u.name
    FROM users u
    JOIN memberships m ON m.user_id = u.id AND m.active
    JOIN companies c ON c.id = m.company_id
    WHERE u.firebase_uid = p_firebase_uid
    ORDER BY c.name
  $$;
--> statement-breakpoint
-- In a membership the server may change only the role, the team and whether it's switched on:
-- never the company or the person it belongs to.
REVOKE UPDATE ON memberships FROM qsmart_app;
--> statement-breakpoint
GRANT UPDATE (role, team_id, active) ON memberships TO qsmart_app;
--> statement-breakpoint
-- An admin invites a person into their company (the one named for this request, app_company()) by e-mail.
-- If the person already has an account (they're in another company too), it's the same account, with one more
-- membership. The function checks again, inside the database, that the caller is an active admin of this company.
CREATE FUNCTION invite_person(p_firebase_uid text, p_email text, p_name text, p_role member_role, p_team uuid)
  RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_company uuid := app_company();
    v_user uuid;
    v_membership uuid;
  BEGIN
    IF v_company IS NULL OR NOT EXISTS (
      SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE u.firebase_uid = p_firebase_uid AND m.company_id = v_company AND m.role = 'admin' AND m.active
    ) THEN
      RAISE EXCEPTION 'only an admin of this company' USING ERRCODE = '42501';
    END IF;
    SELECT u.id INTO v_user FROM users u WHERE lower(u.email) = lower(trim(p_email));
    IF v_user IS NULL THEN
      INSERT INTO users (email, name) VALUES (lower(trim(p_email)), trim(p_name)) RETURNING id INTO v_user;
    END IF;
    INSERT INTO memberships (company_id, user_id, role, team_id) VALUES (v_company, v_user, p_role, p_team)
      RETURNING id INTO v_membership;
    RETURN v_membership;
  END
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION invite_person(text, text, text, member_role, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION invite_person(text, text, text, member_role, uuid) TO qsmart_app;
