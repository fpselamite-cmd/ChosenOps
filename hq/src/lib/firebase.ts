import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const env = import.meta.env;

// The chosenops Firebase project. These values are public identifiers, not secrets:
// access is controlled by firestore.rules. Set VITE_FIREBASE_* to point elsewhere
// (e.g. the local emulators via `npm run dev:emu`).
const CHOSENOPS = {
  apiKey: 'AIzaSyA1vtNc17arVaP3agIn2bUGwE1Ys06p6yo',
  authDomain: 'chosenops.firebaseapp.com',
  projectId: 'chosenops',
  storageBucket: 'chosenops.firebasestorage.app',
  messagingSenderId: '307081883016',
  appId: '1:307081883016:web:41ff5ca66640d148e45e3d',
};

export const app = initializeApp(
  env.VITE_FIREBASE_PROJECT_ID
    ? {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        appId: env.VITE_FIREBASE_APP_ID,
      }
    : CHOSENOPS,
);

export const auth = getAuth(app);
export const db = getFirestore(app);

if (env.VITE_USE_EMULATORS === 'true') {
  const host = window.location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
}
