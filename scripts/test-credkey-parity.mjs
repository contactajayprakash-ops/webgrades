// Credential-hash parity check for the server-side snapshot sync.
//
// The Firestore doc id for a user's grade snapshot is a SHA-256 of their HAC
// username+password. The Pi (Firebase Admin, node:crypto) and the browser
// (src/lib/cloudSync.js, Web Crypto) MUST compute the identical hex — if they
// drift, every client reads a doc that doesn't exist and silently falls back to
// the slow scrape path, which looks like "the snapshot just didn't help."
//
// This test reproduces BOTH code paths exactly and asserts they agree with each
// other and with a known-good constant. Run: `node scripts/test-credkey-parity.mjs`.
import crypto from 'node:crypto'

// --- Browser path: byte-for-byte from src/lib/cloudSync.js credKey() ---
async function clientCredKey(username, password) {
  const bytes = new TextEncoder().encode(`${username || ''} ${password || ''}`)
  const buf = await crypto.webcrypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// --- Pi path: byte-for-byte from server.mjs (HACFAKESERVERNORUN.txt) credKey() ---
function piCredKey(username, password) {
  return crypto.createHash('sha256').update(`${username || ''} ${password || ''}`).digest('hex')
}

// --- Inline preflight path: byte-for-byte from the <script> in index.html.
// Uses `p.username + ' ' + p.password` with no empty-string fallback (the inline
// snippet bails earlier if username/password are missing), so only test real creds. ---
async function inlineCredKey(username, password) {
  const bytes = new TextEncoder().encode(username + ' ' + password)
  const buf = await crypto.webcrypto.subtle.digest('SHA-256', bytes)
  return Array.prototype.map.call(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

const cases = [
  { u: 'student01', p: 'Passw0rd!', expect: 'e24c3e277500a40af36f5ddc272a986607be8301dab57292715900269ef225b5' },
  { u: '', p: '', expect: crypto.createHash('sha256').update(' ').digest('hex') }, // empty-string fallbacks -> hash of a single space
]

let failed = 0
for (const { u, p, expect } of cases) {
  const client = await clientCredKey(u, p)
  const pi = piCredKey(u, p)
  // The inline snippet has no ''-fallback path, so only cross-check it on real creds.
  const inline = u && p ? await inlineCredKey(u, p) : client
  const ok = client === pi && client === inline && client === expect
  if (!ok) {
    failed++
    console.error(`FAIL  u=${JSON.stringify(u)} p=${JSON.stringify(p)}`)
    console.error(`  client=${client}`)
    console.error(`  pi    =${pi}`)
    console.error(`  inline=${inline}`)
    console.error(`  expect=${expect}`)
  } else {
    console.log(`ok    u=${JSON.stringify(u)} -> ${pi.slice(0, 16)}… (client=pi=inline)`)
  }
}

if (failed) {
  console.error(`\n${failed} case(s) failed — client and Pi credKey have drifted. Do not ship.`)
  process.exit(1)
}
console.log('\nAll credKey parity cases passed — client and Pi agree.')
