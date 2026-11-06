import { auth } from './firebase';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
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
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'Please sign in.');
  const response = await fetch(`/api${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers: {
      authorization: `Bearer ${await user.getIdToken()}`,
      ...(companyId ? { 'x-company-id': companyId } : {}),
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { message?: unknown } | null)?.message;
    throw new ApiError(response.status, typeof message === 'string' ? message : response.statusText);
  }
  return body as T;
}
