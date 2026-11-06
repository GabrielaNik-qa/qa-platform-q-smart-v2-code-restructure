import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';

// Firebase's settings for the pages. They are public by design: they name the project, they don't unlock it.
// On your PC the project is "demo-qsmart", which always means Firebase's local test version.
const config = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) ?? 'demo-api-key',
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ?? 'demo-qsmart.firebaseapp.com',
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? 'demo-qsmart',
};

export const usesTestSignIn = config.projectId.startsWith('demo-');
export const auth = getAuth(initializeApp(config));
if (usesTestSignIn) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
