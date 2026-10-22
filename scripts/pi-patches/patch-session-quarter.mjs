// patch-session-quarter.mjs — HAC remembers the last-selected report-card run
// per HAC session, so a warm session's "default" classwork view is whatever the
// previous request selected. Read the current quarter ONCE per session (first
// classwork load) and steer every no-quarter request to it. Applies to the server
// as left by patch-current-quarter.mjs (md5 6653f190c81f9169ba94022686b89b6d);
// result md5 c2a420bad20dc38dbaee233e0740b0c8.
// Exact-string replace of server.mjs -> server.mjs.new; every anchor must appear exactly once.
import fs from 'node:fs'
const src = fs.readFileSync('server.mjs', 'utf8')
const pairs = [
 [
  "\n  let doc = toDoc(await iframePage.text());\n  assertLoggedIn(doc);\n  cache.currentQuarter = cache.currentQuarter || quarterOfDoc(doc);\n\n  if (quarter) {\n    const quarterValue = getQuarterValue(doc, quarter);",
  "\n  let doc = toDoc(await iframePage.text());\n  assertLoggedIn(doc);\n  // HAC remembers the last-selected report-card run for the rest of the HAC\n  // session, so only the FIRST classwork load of a session shows HAC's real\n  // default (the current quarter). Record it on the session then; every later\n  // load would just show whatever the previous postback selected. A request\n  // with no quarter means \"the current quarter\", so it is steered there like a\n  // keyed request (a no-op POST when the page already shows it).\n  const sess = cache.session;\n  if (sess && sess.currentQuarter == null) sess.currentQuarter = quarterOfDoc(doc);\n  const curQ = sess ? sess.currentQuarter : quarterOfDoc(doc);\n  cache.currentQuarter = cache.currentQuarter || curQ;\n  quarter = quarter || curQ;\n\n  if (quarter) {\n    const quarterValue = getQuarterValue(doc, quarter);"
 ],
 [
  "  if (pool === \"snap\") snapBusy.set(username, (snapBusy.get(username) || 0) + 1);\n  try {\n    let session = await getSession(username, password, false, pool);\n    try {\n      const data = await scrapeType(session.fetch, request, cache);\n      return { data, userName: nameOf(session, cache) };",
  "  if (pool === \"snap\") snapBusy.set(username, (snapBusy.get(username) || 0) + 1);\n  try {\n    let session = await getSession(username, password, false, pool);\n    cache.session = session; // getClassworkDom reads the session's current quarter\n    try {\n      const data = await scrapeType(session.fetch, request, cache);\n      return { data, userName: nameOf(session, cache) };"
 ],
 [
  "        // (another worker in this batch may have just re-logged-in).\n        const now = await getSession(username, password, false, pool);\n        session = now !== session ? now : await getSession(username, password, true, pool);\n        const data = await scrapeType(session.fetch, request, cache);\n        return { data, userName: nameOf(session, cache) };\n      }\n",
  "        // (another worker in this batch may have just re-logged-in).\n        const now = await getSession(username, password, false, pool);\n        session = now !== session ? now : await getSession(username, password, true, pool);\n        cache.session = session;\n        const data = await scrapeType(session.fetch, request, cache);\n        return { data, userName: nameOf(session, cache) };\n      }\n"
 ]
]
let out = src
for (const [a, b] of pairs) {
  const n = out.split(a).length - 1
  if (n !== 1) { console.error(`anchor found ${n} times: ${a.slice(0, 80)}`); process.exit(1) }
  out = out.replace(a, () => b)
}
fs.writeFileSync('server.mjs.new', out)
console.log(`ok — ${pairs.length} replacements written to server.mjs.new`)
