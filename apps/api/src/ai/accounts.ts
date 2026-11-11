// The engine's view of a company's AI accounts: the switched-on ones, with their keys opened (only in the server's
// memory, for the call). A key that can't be opened (another master key) is simply not used.
import { listAiAccounts, type Tx } from '@qsmart/db';
import type { ProviderAccount } from './provider.js';
import { decryptKey } from './secrets.js';

export const storedAccounts =
  (masterKey: Buffer | null) =>
  async (tx: Tx, companyId: string): Promise<ProviderAccount[]> => {
    if (!masterKey) return [];
    return (await listAiAccounts(tx)).flatMap((a) => {
      const apiKey = a.enabled ? decryptKey(masterKey, companyId, a.provider, a.keyCipher) : null;
      return apiKey
        ? [{ provider: a.provider, plan: a.plan, apiKey, ...(a.accountId ? { accountId: a.accountId } : {}) }]
        : [];
    });
  };
