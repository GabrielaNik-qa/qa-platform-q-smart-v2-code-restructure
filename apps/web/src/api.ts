import { auth } from './firebase';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Asks the server, with the person's proof of sign-in and, for company pages, the chosen company. */
export async function api<T>(path: string, companyId?: string): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'Please sign in.');
  const response = await fetch(`/api${path}`, {
    headers: {
      authorization: `Bearer ${await user.getIdToken()}`,
      ...(companyId ? { 'x-company-id': companyId } : {}),
    },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { message?: unknown } | null)?.message;
    throw new ApiError(response.status, typeof message === 'string' ? message : response.statusText);
  }
  return body as T;
}
