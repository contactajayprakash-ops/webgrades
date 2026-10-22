// patch-current-quarter.mjs — file HAC's default classwork view under the quarter
// HAC itself shows (read from the report-card-run dropdown) instead of a calendar
// guess. /batch returns it as `currentQuarter`; the snapshot poller's HOT poll
// scrapes the default view. Applies to the server as left by patch-snap-memory.mjs
// (md5 9df1f9aae99a94b4946e9924393967d5); result md5 6653f190c81f9169ba94022686b89b6d.
// Exact-string replace of server.mjs -> server.mjs.new; every anchor must appear exactly once.
import fs from 'node:fs'
const src = fs.readFileSync('server.mjs', 'utf8')
const pairs = [
 [
  "    ([id, want]) => selectedValue(doc, `plnMain_${id}`) === want,\n  );\n\nconst getClassworkDom = async (fetch, quarter = null, cache = {}) => {\n  const classworkUrl = \"https://hac.friscoisd.org/HomeAccess/Classes/Classwork\";\n  const classworkPage = await fetch(classworkUrl, {",
  "    ([id, want]) => selectedValue(doc, `plnMain_${id}`) === want,\n  );\n\n// The quarter HAC's default classwork view shows — HAC's own notion of the\n// current grading period (\"1\"–\"4\"), or null if it can't be read. The calendar\n// guess (guessCurrentQuarter) is weeks off at the Q1->Q2 and Q3->Q4 boundaries,\n// and asking for the guessed quarter made a refresh re-scrape a finished quarter.\nconst quarterOfDoc = (doc) => {\n  const value = selectedValue(doc, \"plnMain_ddlReportCardRuns\");\n  const opt = Array.from(doc.querySelectorAll(\"#plnMain_ddlReportCardRuns option\"))\n    .find((o) => val(o) === value);\n  const m = (opt?.textContent || \"\").trim().match(/^([1-4])(?!\\d)/);\n  return m ? m[1] : null;\n};\n\nconst getClassworkDom = async (fetch, quarter = null, cache = {}) => {\n  const classworkUrl = \"https://hac.friscoisd.org/HomeAccess/Classes/Classwork\";\n  const classworkPage = await fetch(classworkUrl, {"
 ],
 [
  "\n  let doc = toDoc(await iframePage.text());\n  assertLoggedIn(doc);\n\n  if (quarter) {\n    const quarterValue = getQuarterValue(doc, quarter);",
  "\n  let doc = toDoc(await iframePage.text());\n  assertLoggedIn(doc);\n  cache.currentQuarter = cache.currentQuarter || quarterOfDoc(doc);\n\n  if (quarter) {\n    const quarterValue = getQuarterValue(doc, quarter);"
 ],
 [
  "    // Shared first-posted times for every class row this batch scraped.\n    const posted = {};\n    for (const r of results) {\n      if (r.success && r.type === \"class\") Object.assign(posted, stampPosted(username, classResKey(r.quarter), r.data).stamps);\n    }\n\n    const okCount = results.filter((x) => x.success).length;\n    console.log(\n      `[${ctTime()}] BATCH — username=${username} ${okCount}/${requests.length} ok`,\n    );\n    res.json({ success: true, userName, results, posted });\n  } catch (err) {\n    console.log(\n      `[${ctTime()}] BATCH FAILED — username=${username} reason=${err.message}`,",
  "    // Shared first-posted times for every class row this batch scraped.\n    const posted = {};\n    for (const r of results) {\n      if (r.success && r.type === \"class\") Object.assign(posted, stampPosted(username, classResKey(r.quarter || cache.currentQuarter), r.data).stamps);\n    }\n\n    const okCount = results.filter((x) => x.success).length;\n    console.log(\n      `[${ctTime()}] BATCH — username=${username} ${okCount}/${requests.length} ok q=${cache.currentQuarter || \"?\"}`,\n    );\n    // currentQuarter: the quarter HAC's default view shows (null if unread). The\n    // app's hot wave asks for the default view (`class` with no quarter) and files\n    // it under this quarter, instead of trusting a calendar guess.\n    res.json({ success: true, userName, results, posted, currentQuarter: cache.currentQuarter || null });\n  } catch (err) {\n    console.log(\n      `[${ctTime()}] BATCH FAILED — username=${username} reason=${err.message}`,"
 ],
 [
  "  if (isNew) setTimeout(() => snapshotNow(username, password, \"full\"), 0);\n};\n\n// Same calendar guess the client uses (src/lib/courses.js guessCurrentQuarter),\n// so the generic `class:{}` view aliases to the same quarter on both sides.\nconst guessCurrentQuarter = (d = new Date()) => {\n  const m = d.getMonth();\n  if (m >= 7 && m <= 9) return \"1\";",
  "  if (isNew) setTimeout(() => snapshotNow(username, password, \"full\"), 0);\n};\n\n// Calendar guess (same as src/lib/courses.js). Only a fallback for when HAC's\n// own current quarter (cache.currentQuarter, from quarterOfDoc) couldn't be read.\nconst guessCurrentQuarter = (d = new Date()) => {\n  const m = d.getMonth();\n  if (m >= 7 && m <= 9) return \"1\";"
 ],
 [
  "  [\"class\", { quarter: \"3\" }], [\"class\", { quarter: \"4\" }],\n  [\"rank\", {}], [\"transcript\", {}], [\"schedule\", {}], [\"attendance\", {}],\n];\nconst hotResources = (curQ) => [[\"class\", { quarter: curQ }]];\n\n// Scrape a set of resources in ONE session (the per-request page cache shares the\n// transcript page across rank+transcript, like /batch). A failed resource is\n// skipped, not fatal. Aliases the current quarter into the generic `class:{}`\n// view (same HAC page) so the client's Dashboard/Agenda fallback is populated.\nconst scrapeResources = async (username, password, resources, curQ) => {\n  const cache = {};\n  const data = {};\n  for (const [type, extra] of resources) {",
  "  [\"class\", { quarter: \"3\" }], [\"class\", { quarter: \"4\" }],\n  [\"rank\", {}], [\"transcript\", {}], [\"schedule\", {}], [\"attendance\", {}],\n];\n// HOT = HAC's default classwork view, filed under the quarter it shows.\nconst hotResources = () => [[\"class\", {}]];\n\n// Scrape a set of resources in ONE session (the per-request page cache shares the\n// transcript page across rank+transcript, like /batch). A failed resource is\n// skipped, not fatal. Aliases the current quarter into the generic `class:{}`\n// view (same HAC page) so the client's Dashboard/Agenda fallback is populated.\nconst scrapeResources = async (username, password, resources) => {\n  const cache = {};\n  const data = {};\n  for (const [type, extra] of resources) {"
 ],
 [
  "      data[snapKey(type, extra)] = d;\n    } catch (e) { /* skip this resource; keep the rest */ }\n  }\n  const curData = data[snapKey(\"class\", { quarter: curQ })];\n  if (curData !== undefined) data[snapKey(\"class\", {})] = curData;\n  return data;\n};\n",
  "      data[snapKey(type, extra)] = d;\n    } catch (e) { /* skip this resource; keep the rest */ }\n  }\n  // The quarter HAC itself shows by default; the calendar guess only if HAC's\n  // page couldn't be read. Never file the default view under a guessed quarter.\n  const curQ = cache.currentQuarter;\n  const def = data[snapKey(\"class\", {})];\n  if (def !== undefined && curQ) data[snapKey(\"class\", { quarter: curQ })] = def;\n  else if (def === undefined) {\n    const keyed = data[snapKey(\"class\", { quarter: curQ || guessCurrentQuarter() })];\n    if (keyed !== undefined) data[snapKey(\"class\", {})] = keyed;\n  }\n  return data;\n};\n"
 ],
 [
  "// updatedAt, v }; updatedAt is the snapshot's real age (the client shows it).\nconst writeSnapshot = async (username, password, mode = \"full\") => {\n  if (!SNAPSHOT_ENABLED) return { changed: false, bytes: 0, mode };\n  const curQ = guessCurrentQuarter();\n  const prior = mode === \"hot\" ? (cachedPrior(username) || await priorFromFirestore(username, password)) : undefined;\n  // Can't patch onto nothing — a hot poll with no in-memory base becomes full.\n  const effMode = mode === \"hot\" && prior ? \"hot\" : \"full\";\n  const scraped = await scrapeResources(\n    username, password,\n    effMode === \"hot\" ? hotResources(curQ) : fullResources(),\n    curQ,\n  );\n  if (!Object.keys(scraped).length) return { changed: false, bytes: 0, mode: effMode }; // total failure\n  const data = effMode === \"hot\" ? { ...prior, ...scraped } : scraped;\n",
  "// updatedAt, v }; updatedAt is the snapshot's real age (the client shows it).\nconst writeSnapshot = async (username, password, mode = \"full\") => {\n  if (!SNAPSHOT_ENABLED) return { changed: false, bytes: 0, mode };\n  const prior = mode === \"hot\" ? (cachedPrior(username) || await priorFromFirestore(username, password)) : undefined;\n  // Can't patch onto nothing — a hot poll with no in-memory base becomes full.\n  const effMode = mode === \"hot\" && prior ? \"hot\" : \"full\";\n  const scraped = await scrapeResources(\n    username, password,\n    effMode === \"hot\" ? hotResources() : fullResources(),\n  );\n  if (!Object.keys(scraped).length) return { changed: false, bytes: 0, mode: effMode }; // total failure\n  const data = effMode === \"hot\" ? { ...prior, ...scraped } : scraped;\n"
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
