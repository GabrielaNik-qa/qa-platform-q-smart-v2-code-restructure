// Clients' AI keys are stored encrypted (CLAUDE.md: "Clients' keys are stored encrypted"): AES-256-GCM with the
// server's master key (QSMART_MASTER_KEY: on your PC made once by the start file and kept outside OneDrive and Git;
// online: Secret Manager). Each key is bound to its company and AI company, so a stored key copied to another row,
// or another company, can't be opened. The database never sees a key in clear, and no page ever gets one back.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

/** The master key from its text form (32 random bytes, base64), or null when it is missing or malformed. */
export function readMasterKey(text: string | undefined): Buffer | null {
  if (!text) return null;
  const key = Buffer.from(text, 'base64');
  return key.length === 32 ? key : null;
}

export const newMasterKey = () => randomBytes(32).toString('base64');

const bound = (companyId: string, provider: string) => Buffer.from(`qsmart-ai-key|${companyId}|${provider}`);

export function encryptKey(masterKey: Buffer, companyId: string, provider: string, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
  cipher.setAAD(bound(companyId, provider));
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64')))
    .join(':');
}

/** The key in clear, or null when it can't be opened (another master key, another company, or changed). */
export function decryptKey(masterKey: Buffer, companyId: string, provider: string, stored: string): string | null {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', masterKey, Buffer.from(iv, 'base64'));
    decipher.setAAD(bound(companyId, provider));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** The last 4 characters, the only part of a key a page may show. */
export const keyHint = (key: string) => key.slice(-4);
