import { doc, getDoc, setDoc } from 'firebase/firestore/lite'
import { db } from './firebase.js'

// Shared cloud-sync primitive. A user's data lives at <collection>/<credKey>,
// where credKey is a SHA-256 of their HAC username+password — so the same login
// syncs across devices, the id can't be reached without the password, and the
// credential itself never leaves the device (only its hash, as the doc path).
export async function credKey(username, password) {
  const bytes = new TextEncoder().encode(`${username || ''} ${password || ''}`)
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Returns the stored data, or null (no doc / offline / Firestore unreachable).
export async function cloudGet(collection, username, password) {
  const id = await credKey(username, password)
  const snap = await getDoc(doc(db, collection, id))
  return snap.exists() ? snap.data() : null
}

export async function cloudSet(collection, username, password, data) {
  const id = await credKey(username, password)
  await setDoc(doc(db, collection, id), { ...data, v: 1 })
}
