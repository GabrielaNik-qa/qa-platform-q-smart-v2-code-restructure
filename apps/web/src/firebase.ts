import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';

// Firebase's settings for the pages. They are public by design: they name the project, they don't unlock it
// (Firebase's documentation says so), so they can live in the code.
const PROJECTS = {
  // Firebase's local test version on your PC: a "demo-" project never reaches the real Firebase
  local: { apiKey: 'demo-api-key', authDomain: 'demo-qsmart.firebaseapp.com', projectId: 'demo-qsmart' },
  // the real demo project (Q-smart Demo), used with "Start Q-smart v2 (real sign-in).cmd"
  real: {
    apiKey: 'AIzaSyC2dkegwZgNdkAlzF1u2jORiQQtp8CRIx4',
    authDomain: 'qsmart-demo.firebaseapp.com',
    projectId: 'qsmart-demo',
    appId: '1:1034881328558:web:ded8eb7ad612c58e51143f',
    messagingSenderId: '1034881328558',
  },
};

const config = import.meta.env.MODE === 'real' ? PROJECTS.real : PROJECTS.local;

export const usesTestSignIn = config.projectId.startsWith('demo-');
export const auth = getAuth(initializeApp(config));
if (usesTestSignIn) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
