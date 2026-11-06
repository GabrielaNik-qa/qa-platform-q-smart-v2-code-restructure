-- The company wall (row-level security). Written by hand; drizzle-kit doesn't manage it.
-- Every request runs in a transaction that first names its company:
--     select set_config('app.company_id', '<the company id>', true)
-- From then on PostgreSQL shows, changes and accepts only that company's rows.
-- Without a company, nothing is visible at all.
-- The server connects as qsmart_app: it owns no table, so it can't switch the wall off.
-- The two roles, qsmart_owner (owns the tables, runs the migrations) and qsmart_app (the server), are created
-- outside the migrations: by packages/db/src/local-postgres.ts on your PC and in the tests, and in Neon online.
CREATE FUNCTION app_company() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.company_id', true), '')::uuid $$;
--> statement-breakpoint
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY companies_wall ON companies USING (id = app_company()) WITH CHECK (id = app_company());
--> statement-breakpoint
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY teams_wall ON teams USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY memberships_wall ON memberships
  USING (company_id = app_company()) WITH CHECK (company_id = app_company());
--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- A person is shared by the companies they belong to: each of those companies sees them, no other company does.
CREATE POLICY users_wall ON users FOR SELECT
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id AND m.company_id = app_company()));
--> statement-breakpoint
CREATE POLICY users_update ON users FOR UPDATE
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id AND m.company_id = app_company()))
  WITH CHECK (true);
--> statement-breakpoint
-- At sign-in the server doesn't know the company yet. This returns the memberships of one Firebase account
-- (the one the server has just checked), and nothing else.
CREATE FUNCTION memberships_for(p_firebase_uid text)
  RETURNS TABLE (company_id uuid, company_name text, role member_role, user_id uuid, user_name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT m.company_id, c.name, m.role, u.id, u.name
    FROM users u
    JOIN memberships m ON m.user_id = u.id
    JOIN companies c ON c.id = m.company_id
    WHERE u.firebase_uid = p_firebase_uid
    ORDER BY c.name
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION memberships_for(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION memberships_for(text) TO qsmart_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO qsmart_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON companies, teams, memberships, users TO qsmart_app;
--> statement-breakpoint
-- tables added later get the same rights (each new table must also switch the wall on: a test checks it)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO qsmart_app;
