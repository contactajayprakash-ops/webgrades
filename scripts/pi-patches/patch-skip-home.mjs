// patch-skip-home.mjs — skip the post-login home-page GET (name from the landing page).
// Exact-string replace of server.mjs -> server.mjs.new; every anchor must appear exactly once.
import fs from 'node:fs'
const src = fs.readFileSync('server.mjs', 'utf8')
const pairs = [
 [
  "\n// ====================\n// Shared Login Function\n// Returns: { fetch, userName }\n// ====================\nconst loginHAC = async (username, password) => {\n  const cookieJar = new CookieJar();\n",
  "\n// ====================\n// Shared Login Function\n// Returns: { fetch, userName: null }\n// Stops at the 302: the session cookie is set by then. Following it to the home\n// page cost ~2 s per cold login on the Pi (a 76 KB page) and was only there to\n// read the student's display name, which the classwork landing page carries too\n// (getClassworkDom picks it up). /login, which must answer with the name, calls\n// fetchUserName explicitly.\n// ====================\nconst loginHAC = async (username, password) => {\n  const cookieJar = new CookieJar();\n"
 ],
 [
  "\n  if (loginRes.status !== 302) throw new Error(\"Login failed\");\n\n  const homeUrl = new URL(loginRes.headers.get(\"location\"), loginUrl).href;\n  const homePage = await fetch(homeUrl, {\n    headers: { \"User-Agent\": \"Mozilla/5.0\", Referer: loginUrl },\n  });\n  const homeHtml = await homePage.text();\n\n  const userNameElement = toDoc(homeHtml).querySelector(\n    \".sg-menu-element-identity span\",\n  );\n\n  const userName = userNameElement?.textContent.trim() || \"Unknow n User\";\n\n  return { fetch, userName };\n};\n\n// ====================\n",
  "\n  if (loginRes.status !== 302) throw new Error(\"Login failed\");\n\n  return { fetch, userName: null };\n};\n\n// The display name in HAC's top menu, present on every MVC page (home, Classwork).\nconst nameFromDoc = (doc) =>\n  doc.querySelector(\".sg-menu-element-identity span\")?.textContent.trim() || null;\n\n// Fill in a session's display name from the home page (only /login needs it\n// before any scrape has run).\nconst fetchUserName = async (session) => {\n  if (session.userName) return session.userName;\n  const homePage = await session.fetch(\"https://hac.friscoisd.org/HomeAccess/\", {\n    headers: { \"User-Agent\": \"Mozilla/5.0\" },\n  });\n  const doc = toDoc(await homePage.text());\n  assertLoggedIn(doc);\n  session.userName = nameFromDoc(doc) || \"Unknow n User\";\n  return session.userName;\n};\n\n// ====================\n"
 ],
 [
  "    ([id, want]) => selectedValue(doc, `plnMain_${id}`) === want,\n  );\n\nconst getClassworkDom = async (fetch, quarter = null) => {\n  const classworkUrl = \"https://hac.friscoisd.org/HomeAccess/Classes/Classwork\";\n  const classworkPage = await fetch(classworkUrl, {\n    headers: { \"User-Agent\": \"Mozilla/5.0\" },\n  });\n  const landing = toDoc(await classworkPage.text());\n  assertLoggedIn(landing);\n\n  const iframe = landing.querySelector(\"iframe\");\n  if (!iframe) throw new Error(\"Classwork iframe not found\");\n",
  "    ([id, want]) => selectedValue(doc, `plnMain_${id}`) === want,\n  );\n\nconst getClassworkDom = async (fetch, quarter = null, cache = {}) => {\n  const classworkUrl = \"https://hac.friscoisd.org/HomeAccess/Classes/Classwork\";\n  const classworkPage = await fetch(classworkUrl, {\n    headers: { \"User-Agent\": \"Mozilla/5.0\" },\n  });\n  const landing = toDoc(await classworkPage.text());\n  assertLoggedIn(landing);\n  cache.userName = cache.userName || nameFromDoc(landing);\n\n  const iframe = landing.querySelector(\"iframe\");\n  if (!iframe) throw new Error(\"Classwork iframe not found\");\n"
 ],
 [
  "const scrapeType = async (fetch, { type, quarter, date } = {}, cache = {}) => {\n  switch (type) {\n    case \"class\":\n      return parseClasswork(await getClassworkDom(fetch, quarter));\n    case \"rank\":\n      return parseRank(await getTranscriptDoc(fetch, cache));\n    case \"transcript\":\n",
  "const scrapeType = async (fetch, { type, quarter, date } = {}, cache = {}) => {\n  switch (type) {\n    case \"class\":\n      return parseClasswork(await getClassworkDom(fetch, quarter, cache));\n    case \"rank\":\n      return parseRank(await getTranscriptDoc(fetch, cache));\n    case \"transcript\":\n"
 ],
 [
  "  }\n};\n\n// Run one scrape, transparently re-logging-in once if the warm session expired.\nconst scrapeWithSession = async (username, password, request, cache, pool = \"live\") => {\n  let session = await getSession(username, password, false, pool);\n  try {\n    return {\n      data: await scrapeType(session.fetch, request, cache),\n      userName: session.userName,\n    };\n  } catch (err) {\n    if (err instanceof SessionExpired) {\n      // session went stale \u2014 drop the per-request page cache, re-login, retry once\n",
  "  }\n};\n\n// A session learns its display name from the first classwork page it loads.\nconst nameOf = (session, cache) => {\n  if (!session.userName && cache.userName) session.userName = cache.userName;\n  return session.userName;\n};\n\n// Run one scrape, transparently re-logging-in once if the warm session expired.\nconst scrapeWithSession = async (username, password, request, cache, pool = \"live\") => {\n  let session = await getSession(username, password, false, pool);\n  try {\n    const data = await scrapeType(session.fetch, request, cache);\n    return { data, userName: nameOf(session, cache) };\n  } catch (err) {\n    if (err instanceof SessionExpired) {\n      // session went stale \u2014 drop the per-request page cache, re-login, retry once\n"
 ],
 [
  "      // (another worker in this batch may have just re-logged-in).\n      const now = await getSession(username, password, false, pool);\n      session = now !== session ? now : await getSession(username, password, true, pool);\n      return {\n        data: await scrapeType(session.fetch, request, cache),\n        userName: session.userName,\n      };\n    }\n    throw err;\n  }\n",
  "      // (another worker in this batch may have just re-logged-in).\n      const now = await getSession(username, password, false, pool);\n      session = now !== session ? now : await getSession(username, password, true, pool);\n      const data = await scrapeType(session.fetch, request, cache);\n      return { data, userName: nameOf(session, cache) };\n    }\n    throw err;\n  }\n"
 ],
 [
  "  const { username, password } = req.body;\n  try {\n    const session = await getSession(username, password, true); // always verify creds fresh\n    registerSnapshot(username, password); // keep this account's server snapshot warm\n    console.log(\n      `[${ctTime()}] LOGIN SUCCESS \u2014 name=${session.userName}  username=${username}`,\n",
  "  const { username, password } = req.body;\n  try {\n    const session = await getSession(username, password, true); // always verify creds fresh\n    await fetchUserName(session);\n    registerSnapshot(username, password); // keep this account's server snapshot warm\n    console.log(\n      `[${ctTime()}] LOGIN SUCCESS \u2014 name=${session.userName}  username=${username}`,\n"
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
