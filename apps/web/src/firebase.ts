import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

// Emulator-only by default (offline demo, no billing). Project id has the "demo-" prefix.
const app = initializeApp({
  projectId: 'demo-plant-line3',
  apiKey: 'demo',
  storageBucket: 'demo-plant-line3.appspot.com',
});
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

const host = window.location.hostname;
connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
connectFirestoreEmulator(db, host, 8080);
connectStorageEmulator(storage, host, 9199);
