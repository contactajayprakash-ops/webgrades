// Fast cold-open snapshot read — hits the Firestore REST API directly with a
// plain fetch(), so the critical paint path does NOT wait on the ~140 KB
// firebase/firestore-lite SDK chunk (that still loads, lazily, for settings +
// agenda sync — just not before the grades can paint).
//
// The grades doc is world-readable by id per firestore.rules (`allow get: if
// true`; the id is the credential hash), so an unauthenticated REST GET with the
// public web API key is all that's needed. No SDK, no app init, one round-trip.
//
// credKey MUST stay byte-identical to the Pi and to src/lib/cloudSync.js — see
// scripts/test-credkey-parity.mjs.
const PROJECT = 'webgrades'
const API_KEY = 'AIzaSyCjM4oh7m96ZaU4zLWE-m81JJKVPxkZ4Q0' // public web config key (not a secret)

async function credKey(username, password) {
  const bytes = new TextEncoder().encode(`${username || ''} ${password || ''}`)
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Gunzip a base64 gzip blob via the browser's native DecompressionStream (no dep).
// Throws on browsers without it (old iOS) → caller treats any throw as "no snapshot".
async function gunzipBase64(b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new TextDecoder().decode(await new Response(stream).arrayBuffer())
}

// Decode a Firestore REST grades doc into { data, updatedAt }, or null.
async function decodeDoc(doc) {
  const f = (doc && doc.fields) || {}
  const payload = f.data && f.data.stringValue
  if (!payload) return null
  const json = (f.codec && f.codec.stringValue) === 'gzip' ? await gunzipBase64(payload) : payload
  return { data: JSON.parse(json), updatedAt: Number(f.updatedAt && f.updatedAt.integerValue) || 0 }
}

// Returns { data, updatedAt } (data in the client's cache-key shape) or null when
// there's no doc / it's unreachable / the browser can't gunzip.
export async function readSnapshot(username, password) {
  if (!username || !password) return null
  // Reuse the preflight fetch kicked off in index.html <head> — but ONLY when it
  // was for the account being asked for (a profile switch after load must not
  // paint the previous account's data). Any miss falls through unchanged.
  try {
    if (typeof window !== 'undefined' && window.__wgSnap) {
      const pre = await window.__wgSnap
      if (pre && pre.username === username && pre.doc) return await decodeDoc(pre.doc)
    }
  } catch (_) { /* fall through to our own fetch */ }
  const id = await credKey(username, password)
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/grades/${id}?key=${API_KEY}`
  const res = await fetch(url)
  if (!res.ok) return null // 404 = no snapshot yet; anything else → fall through to live scrape
  return await decodeDoc(await res.json())
}
