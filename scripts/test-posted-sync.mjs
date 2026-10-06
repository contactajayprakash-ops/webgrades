// Shared "Recently posted" time check.
//
// The Pi stamps each graded row's first-seen time under postedKey() and returns
// the stamps on /batch (and in the grade snapshot); the browser looks them up
// under srvKeyOf() in src/lib/seen.js. If those keys drift, every lookup misses
// and each device silently goes back to showing its OWN first-seen time.
//
// This runs the REAL code on both sides: the Pi's stamping block is lifted out of
// HACFAKESERVERNORUN.txt, and seen.js is imported with a localStorage shim.
// Run: `node scripts/test-posted-sync.mjs`.
import fs from 'node:fs'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
const { mergeServerPosted, loadServerPosted, postedSince, snapshotOf } = await import('../src/lib/seen.js')

// --- Pi side, lifted verbatim from the server source ---
const src = fs.readFileSync(new URL('../HACFAKESERVERNORUN.txt', import.meta.url), 'utf8')
const grab = (re, what) => { const m = src.match(re); if (!m) { console.error(`FAIL  couldn't find ${what} in the server source`); process.exit(1) } return m[0] }
const piCode = [
  grab(/const isSubtotalName = .*\n/, 'isSubtotalName'),
  grab(/const postedKey = [\s\S]*?\n(?=\/\/ Cache key)/, 'postedKey'),
  grab(/const classResKey = .*\n/, 'classResKey'),
  grab(/const stampPosted = [\s\S]*?\n};\n/, 'stampPosted'),
].join('\n')
const pi = new Function('postedStore', 'savePostedStore', `${piCode}\nreturn { stampPosted, classResKey };`)
const postedStore = {}
const { stampPosted, classResKey } = pi(postedStore, () => {})

let failed = 0
const check = (ok, msg) => { if (ok) console.log(`ok    ${msg}`); else { failed++; console.error(`FAIL  ${msg}`) } }

const cls = (rows) => ({ assignmentsData: [{ courseName: 'MATH 1 PreAP - 1 (S1)', overallAverage: '95', assignments: rows }] })
const old = { assignmentName: 'Quiz 1', category: 'Assessment of Learning', grade: '90' }
const fresh = { assignmentName: 'Quiz 2', category: 'Assessment of Learning', grade: '100' }
const pc = { assignmentName: 'Quiz 2', category: 'Progress Check', grade: '80' } // same name, other category

// First scrape of a quarter seeds at 0 (no real time) and returns no stamps.
const r1 = stampPosted('stu', classResKey('1'), cls([old]))
check(Object.keys(r1.stamps).length === 0, 'baseline scrape seeds silently (no "just posted" for old grades)')

// A later scrape stamps only the new rows, with a real time.
const before = Date.now()
const r2 = stampPosted('stu', classResKey('1'), cls([old, fresh, pc]))
const vals = Object.values(r2.stamps)
check(vals.length === 2 && vals.every((t) => t >= before), 'new rows (both AOL and PC of the same name) get real times')

// A third scrape returns the SAME times (a second device gets identical stamps).
const r3 = stampPosted('stu', classResKey('1'), cls([old, fresh, pc]))
check(JSON.stringify(r3.stamps) === JSON.stringify(r2.stamps), 'repeat scrape returns the same stamps')

// --- Client side: two devices, each with its own (different) local time ---
const deviceShows = (username, localTime) => {
  store.clear()
  const seen = snapshotOf(cls([old]).assignmentsData) // last saw only the old grade
  const localMap = {} // this device's own first-seen times
  for (const a of [fresh, pc]) localMap[`MATH 1 PreAP - 1 (S1)||${a.assignmentName}\u0000${/progress/i.test(a.category) ? 'pc' : 'aol'}`] = localTime
  mergeServerPosted(username, r3.stamps)
  return postedSince(seen, cls([old, fresh, pc]).assignmentsData, localMap, loadServerPosted(username)).map((f) => f.postedAt)
}
const a = deviceShows('stu', 111)
const b = deviceShows('stu', 222)
check(a.length === 2 && JSON.stringify(a) === JSON.stringify(b) && a.every((t) => t >= before), 'two devices show the same Pi time, not their own')

// No Pi time (older Pi deploy) → falls back to this device's own time.
store.clear()
const fallback = postedSince(snapshotOf(cls([old]).assignmentsData), cls([old, fresh]).assignmentsData,
  { 'MATH 1 PreAP - 1 (S1)||Quiz 2\u0000aol': 333 }, loadServerPosted('stu'))
check(fallback.length === 1 && fallback[0].postedAt === 333, 'without Pi stamps, the per-device time still shows')

// 0 ("unknown") from the Pi never overrides a real time.
check(mergeServerPosted('stu', { x: 0 }) === false && !('x' in loadServerPosted('stu')), 'Pi 0s are ignored')

if (failed) { console.error(`\n${failed} check(s) failed.`); process.exit(1) }
console.log('\nall good')
