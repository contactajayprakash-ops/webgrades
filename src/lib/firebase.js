import { initializeApp } from 'firebase/app'
// Firestore *Lite*: one-shot get/set only (no realtime listeners), which is all
// the agenda sync needs — and a fraction of the bundle size of full Firestore.
import { getFirestore } from 'firebase/firestore/lite'

// Public web config (safe to ship in the client — these identify the project,
// they aren't secrets; access is governed by Firestore security rules).
const firebaseConfig = {
  apiKey: 'AIzaSyCjM4oh7m96ZaU4zLWE-m81JJKVPxkZ4Q0',
  authDomain: 'webgrades.firebaseapp.com',
  projectId: 'webgrades',
  storageBucket: 'webgrades.firebasestorage.app',
  messagingSenderId: '1057978658832',
  appId: '1:1057978658832:web:b8cea9ebee5756d9adda95',
}

export const db = getFirestore(initializeApp(firebaseConfig))
