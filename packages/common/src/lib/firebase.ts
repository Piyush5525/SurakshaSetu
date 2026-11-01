import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

// Emulator-only by default (offline demo, no billing). Project id has the "demo-" prefix.
const app = initializeApp({
  projectId: 'demo-plant-line3',
  apiKey: 'demo-key',
  authDomain: 'demo-plant-line3.firebaseapp.com',
  storageBucket: 'demo-plant-line3.appspot.com',
});
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

const host = window.location.hostname;
connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
connectFirestoreEmulator(db, host, 8080);
connectStorageEmulator(storage, host, 9199);
connectFunctionsEmulator(functions, host, 5001);

/** Anonymous sign-in for workers. Resolves once a user (no personal data attached) exists. */
export function ensureAnonymous(): Promise<void> {
  return new Promise((resolve, reject) => {
    const off = onAuthStateChanged(auth, (u) => {
      off();
      if (u) return resolve();
      signInAnonymously(auth).then(() => resolve(), reject);
    });
  });
}
