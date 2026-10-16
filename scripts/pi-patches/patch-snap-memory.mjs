// patch-snap-memory.mjs — stop the hourly out-of-memory crashes: keep the HOT-poll
// snapshot base gzipped (~3 KB/account instead of a parsed gradebook) and sweep
// expired HAC sessions from the session map. Applies to the server as left by
// patch-fast-open.mjs (md5 e830a9a992f74a5d93286b7be2aac919).
// Exact-string replace of server.mjs -> server.mjs.new; every anchor must appear exactly once.
import fs from 'node:fs'
const src = fs.readFileSync('server.mjs', 'utf8')
const pairs = [
 [
  "const snapBusy = new Map(); // username -> poller (\"snap\" pool) scrapes in flight right now\nconst SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 15 * 60 * 1000);\n\nconst getSession = async (username, password, fresh = false, pool = \"live\") => {",
  "const snapBusy = new Map(); // username -> poller (\"snap\" pool) scrapes in flight right now\nconst SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 15 * 60 * 1000);\n// Drop expired sessions instead of leaving them in the map until the same account\n// logs in again: that is what actually bounds how long a password (and a cookie\n// jar) stays in memory to the TTL, and keeps the map at \"recently active\", not\n// \"everyone ever seen\". A request holding an expired entry keeps its reference.\nsetInterval(() => {\n  const now = Date.now();\n  for (const [k, e] of sessions) if (now - e.ts >= SESSION_TTL_MS) sessions.delete(k);\n}, 60 * 1000).unref();\n\nconst getSession = async (username, password, fresh = false, pool = \"live\") => {"
 ],
 [
  "};\n\n// Last full uncompressed snapshot per user, kept in memory so a HOT poll can\n// patch just the current quarter onto it without re-scraping everything. Lost on\n// restart → the first poll after boot is forced FULL to rebuild it.\nconst snapDataCache = new Map(); // username -> data object\n\n// After a restart the in-memory base is gone, which used to force a FULL",
  "};\n\n// Last full snapshot per user, kept in memory so a HOT poll can patch just the\n// current quarter onto it without re-scraping everything. Kept GZIPPED (the same\n// bytes the Firestore doc holds, ~3 KB each): as parsed objects, ~550 accounts'\n// gradebooks were 100–200 MB of V8 heap, which on this 32-bit Node build hit\n// the heap ceiling and crashed the server every couple of hours — taking every\n// warm HAC session with it. Gunzipping 3 KB per hot poll costs a few ms.\nconst snapDataCache = new Map(); // username -> gzipped JSON Buffer\nconst cachedPrior = (username) => {\n  const gz = snapDataCache.get(username);\n  if (!gz) return undefined;\n  try { return JSON.parse(zlib.gunzipSync(gz).toString(\"utf8\")); }\n  catch (e) { snapDataCache.delete(username); return undefined; }\n};\n\n// After a restart the in-memory base is gone, which used to force a FULL"
 ],
 [
  "    const d = doc.exists ? doc.data() : null;\n    if (!d || d.codec !== \"gzip\" || d.hash !== entry.snapHash) return undefined;\n    const data = JSON.parse(zlib.gunzipSync(Buffer.from(d.data, \"base64\")).toString(\"utf8\"));\n    snapDataCache.set(username, data);\n    return data;\n  } catch (e) {",
  "    const d = doc.exists ? doc.data() : null;\n    if (!d || d.codec !== \"gzip\" || d.hash !== entry.snapHash) return undefined;\n    const gz = Buffer.from(d.data, \"base64\");\n    const data = JSON.parse(zlib.gunzipSync(gz).toString(\"utf8\"));\n    snapDataCache.set(username, gz);\n    return data;\n  } catch (e) {"
 ],
 [
  "  if (!SNAPSHOT_ENABLED) return { changed: false, bytes: 0, mode };\n  const curQ = guessCurrentQuarter();\n  const prior = snapDataCache.get(username) || (mode === \"hot\" ? await priorFromFirestore(username, password) : undefined);\n  // Can't patch onto nothing — a hot poll with no in-memory base becomes full.\n  const effMode = mode === \"hot\" && prior ? \"hot\" : \"full\";",
  "  if (!SNAPSHOT_ENABLED) return { changed: false, bytes: 0, mode };\n  const curQ = guessCurrentQuarter();\n  const prior = mode === \"hot\" ? (cachedPrior(username) || await priorFromFirestore(username, password)) : undefined;\n  // Can't patch onto nothing — a hot poll with no in-memory base becomes full.\n  const effMode = mode === \"hot\" && prior ? \"hot\" : \"full\";"
 ],
 [
  "  if (!Object.keys(scraped).length) return { changed: false, bytes: 0, mode: effMode }; // total failure\n  const data = effMode === \"hot\" ? { ...prior, ...scraped } : scraped;\n  snapDataCache.set(username, data);\n  const entry = snapStore[username] || {};\n  entry.password = password;",
  "  if (!Object.keys(scraped).length) return { changed: false, bytes: 0, mode: effMode }; // total failure\n  const data = effMode === \"hot\" ? { ...prior, ...scraped } : scraped;\n  const entry = snapStore[username] || {};\n  entry.password = password;"
 ],
 [
  "  const gz = zlib.gzipSync(json);\n  const bytes = gz.length;\n  // The first-posted map rides along (gzipped, same codec) so a cold open shows\n  // the shared times before the live sync lands. A new stamp from a device's",
  "  const gz = zlib.gzipSync(json);\n  const bytes = gz.length;\n  snapDataCache.set(username, gz); // the base for the next HOT poll, compressed\n  // The first-posted map rides along (gzipped, same codec) so a cold open shows\n  // the shared times before the live sync lands. A new stamp from a device's"
 ]
]
for (const [i, [old]] of pairs.entries()) {
  const n = src.split(old).length - 1
  if (n !== 1) { console.error(`FAIL: anchor ${i + 1}/${pairs.length} found ${n} times (expected 1)\n---\n${old}---`); process.exit(2) }
}
let out = src
for (const [old, neu] of pairs) out = out.replace(old, () => neu)
fs.writeFileSync('server.mjs.new', out)
console.log(`ok: ${pairs.length} edits -> server.mjs.new`)
