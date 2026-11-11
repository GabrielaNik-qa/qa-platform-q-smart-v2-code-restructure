-- The company's accounts with AI companies: the key only ever encrypted (the server encrypts it before it gets here).
ALTER TABLE ai_accounts DROP CONSTRAINT ai_accounts_by_same_company;
--> statement-breakpoint
ALTER TABLE ai_accounts ADD CONSTRAINT ai_accounts_by_same_company FOREIGN KEY (by_membership_id, company_id)
  REFERENCES memberships (id, company_id) ON DELETE SET NULL (by_membership_id);
--> statement-breakpoint
ALTER TABLE ai_accounts ADD CONSTRAINT ai_accounts_limits CHECK (
  provider ~ '^[a-z][a-z0-9_]{1,30}$' AND plan IN ('free', 'paid')
  AND key_cipher LIKE 'v1:%' AND length(key_cipher) <= 2000 AND length(key_hint) <= 4
  AND (account_id IS NULL OR account_id ~ '^[A-Za-z0-9_-]{1,64}$') AND length(by_name) <= 120
);
--> statement-breakpoint
ALTER TABLE ai_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_accounts_wall ON ai_accounts USING (company_id = app_company()) WITH CHECK (company_id = app_company());
