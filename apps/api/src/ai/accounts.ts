// The engine's view of the AI accounts a company's jobs may use, with their keys opened (only in the server's memory,
// for the call). Since 17 November Q-smart is the mediator: Q-smart's own accounts (the owner area) serve every
// company; a company's own key (from before) is used only for an AI company Q-smart has no account with. A key that
// can't be opened (another master key) is simply not used.
import { listAiAccounts, listPlatformAiAccounts, type Tx } from '@qsmart/db';
import type { ProviderAccount } from './provider.js';
import { decryptKey } from './secrets.js';

/** Q-smart's own keys are bound to this name instead of a company. */
export const PLATFORM = 'platform';

export const storedAccounts =
  (masterKey: Buffer | null) =>
  async (tx: Tx, companyId: string): Promise<ProviderAccount[]> => {
    if (!masterKey) return [];
    const own = (await listPlatformAiAccounts(tx)).flatMap((a) => {
      const apiKey = a.enabled ? decryptKey(masterKey, PLATFORM, a.provider, a.keyCipher) : null;
      return apiKey
        ? [{ provider: a.provider, plan: a.plan, apiKey, ...(a.accountId ? { accountId: a.accountId } : {}) }]
        : [];
    });
    const theirs = (await listAiAccounts(tx)).flatMap((a) => {
      if (own.some((o) => o.provider === a.provider)) return [];
      const apiKey = a.enabled ? decryptKey(masterKey, companyId, a.provider, a.keyCipher) : null;
      return apiKey
        ? [{ provider: a.provider, plan: a.plan, apiKey, ...(a.accountId ? { accountId: a.accountId } : {}) }]
        : [];
    });
    return [...own, ...theirs];
  };
