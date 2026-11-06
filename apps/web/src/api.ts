import { type ErrorCode, isErrorCode } from '@qsmart/shared';
import { signOut } from 'firebase/auth';
import type { TFunction } from 'i18next';
import { auth } from './firebase';

/** Firebase's answers when an account can no longer sign in (deleted, switched off, or its sign-in ran out). */
const GONE = ['auth/user-token-expired', 'auth/invalid-refresh-token', 'auth/user-disabled', 'auth/user-not-found'];

/** The person's proof of sign-in; when their account no longer works, they go back to the sign-in screen. */
async function idToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'Please sign in.', 'signIn');
  try {
    return await user.getIdToken();
  } catch (error) {
    if (GONE.includes((error as { code?: string }).code ?? '')) await signOut(auth);
    throw new ApiError(401, 'Your sign-in has expired. Please sign in again.', 'signInExpired');
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** the server's reason, shown in the person's language */
    readonly code?: ErrorCode,
  ) {
    super(message);
  }
}

/** What to show when something was refused: the server's reason in the chosen language, when it gave one. */
export function errorText(t: TFunction, error: unknown): string {
  if (error instanceof ApiError && error.code) return t(`errors.${error.code}`);
  return error instanceof Error ? error.message : String(error);
}

/**
 * Asks the server, with the person's proof of sign-in and, for company pages, the chosen company.
 * With `body`, the request sends it as JSON (POST unless another method is given).
 */
export async function api<T>(
  path: string,
  companyId?: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = await idToken();
  const response = await fetch(`/api${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers: {
      authorization: `Bearer ${token}`,
      ...(companyId ? { 'x-company-id': companyId } : {}),
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const { message, code } = (body ?? {}) as { message?: unknown; code?: unknown };
    throw new ApiError(
      response.status,
      typeof message === 'string' ? message : response.statusText,
      isErrorCode(code) ? code : undefined,
    );
  }
  return body as T;
}

/** Asks the server for a file (e.g. Export to Excel), sending `body` as JSON. */
export async function apiFile(path: string, companyId: string, body: unknown): Promise<Blob> {
  const token = await idToken();
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'x-company-id': companyId, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const answer = (await response.json().catch(() => null)) as { message?: unknown; code?: unknown } | null;
    throw new ApiError(
      response.status,
      typeof answer?.message === 'string' ? answer.message : response.statusText,
      isErrorCode(answer?.code) ? answer.code : undefined,
    );
  }
  return response.blob();
}
