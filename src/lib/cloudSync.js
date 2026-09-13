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

// Gunzip a base64'd gzip blob using the browser's native DecompressionStream —
// no dependency. Throws on browsers without it (older iOS); callers treat any
// throw as "no snapshot" and fall through to the live scrape.
async function gunzipBase64(b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new TextDecoder().decode(await new Response(stream).arrayBuffer())
}

// Read a user's server-written grade snapshot (the Pi writes it; see the
// snapshot subsystem in server.mjs). Returns { data, updatedAt } where `data` is
// already in the client's cache-key shape (class:{}, class:{"quarter":"3"}, …),
// or null when there's no doc / it's unreadable / the browser can't gunzip.
export async function cloudGetGrades(username, password) {
  const snap = await cloudGet('grades', username, password)
  if (!snap || !snap.data) return null
  const json = snap.codec === 'gzip' ? await gunzipBase64(snap.data) : snap.data
  return { data: JSON.parse(json), updatedAt: Number(snap.updatedAt) || 0 }
}
