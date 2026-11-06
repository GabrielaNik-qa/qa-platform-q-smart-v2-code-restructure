import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export interface VerifiedPerson {
  uid: string;
  email: string | null;
}

export interface TokenVerifier {
  verify(idToken: string): Promise<VerifiedPerson>;
}

/**
 * Checks Firebase's proof of sign-in (the ID token) with Google's official library.
 * On your PC, FIREBASE_AUTH_EMULATOR_HOST points it at Firebase's local test version.
 */
export function firebaseVerifier(projectId: string): TokenVerifier {
  const app = getApps().find((a) => a.name === 'qsmart-api') ?? initializeApp({ projectId }, 'qsmart-api');
  const auth = getAuth(app);
  return {
    async verify(idToken) {
      const token = await auth.verifyIdToken(idToken);
      return { uid: token.uid, email: token.email ?? null };
    },
  };
}
