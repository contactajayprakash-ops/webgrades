// Career Plan (HAC → Classes → Career Plan), scraped by the Pi as `careerplan`.
//
// It is the one HAC page that lists EVERY course a student has taken with its
// full name and FISD course code, one column per school year — including the
// rows the transcript shows only as terse abbreviations. Three things come from
// it:
//   1. the LEVEL of every past course ("Chemistry Adv" vs "Chemistry"), which
//      the transcript drops ("CHEM") and the GPA engine otherwise has to guess;
//   2. CREDIT BY EXAM rows — the course name and code start with "EA" ("EA
//      Algebra 2 S1", EAMT200A). FISD leaves those out of the GPA, so the
//      cumulative setup skips them unless the student turns "Count EA" on;
//   3. SUMMER / off-cycle rows — name and code start with "CR" ("CR AP Comp Sci
//      A-Math S1", CRMT420A). Counted like any other course, just labelled.
//      (Not every summer course shows up this way — a friend's didn't — so the
//      manual "Add course" path stays.)
//
// Only the CURRENT and PAST school years are trusted. The later columns are the
// student's own editable course requests (the "Enter Requests" buttons), so a
// future-year row says nothing about what was actually taken.
//
// Shape (from the Pi; see HACFAKESERVERNORUN.txt `careerplan`):
//   { plan, years: [{ grade, year, label }],
//     subjects: [{ name, creditNeeded, estCredit,
//       courses: [{ grade, year, name, code, section, credit, complete, raw }] }] }
// `year` is transcript-style "2024-2025" so rows join to transcript groups.
import { detectWeight, WEIGHTS } from './gpa.js'
import { currentSchoolYear, courseCode } from './courses.js'
import { transcriptCourseName } from './courseCatalog.js'
import { levelSubject } from './levels.js'

// Name prefixes HAC puts on special rows. OC ("OC Health") is an online /
// off-campus course — recorded, not labelled.
const PREFIX_RE = /^(EA|CR|OC)\b\s*/i

// Split a Career Plan course name into its parts:
//   "CR AP Comp Sci A-Math S1" -> { base: "AP Comp Sci A-Math", sem: "S1", cr: true }
//   "Geometry Adv HS S1 Online" -> { base: "Geometry Adv HS", sem: "S1", online: true }
export function parsePlanName(name) {
  let n = String(name || '').replace(/\s+/g, ' ').trim()
  const flags = { ea: false, cr: false, oc: false, online: false }
  let m
  while ((m = PREFIX_RE.exec(n))) {
    flags[m[1].toLowerCase()] = true
    n = n.slice(m[0].length)
  }
  let sem = null
  n = n.replace(/\s*\bS([12])\b\s*/i, (_, s) => { sem = `S${s}`; return ' ' })
  n = n.replace(/\s*\bOnline\b\s*/i, () => { flags.online = true; return ' ' })
  return { base: n.replace(/\s+/g, ' ').trim(), sem, ...flags }
}

// The course code's prefix says the same thing as the name's ("EAMT200A",
// "CRWL490A") — either is enough.
const codeFlag = (code, p) => new RegExp(`^${p}[A-Z]`).test(String(code || '').toUpperCase())

// ---- fuzzy name matching (plan name <-> transcript description) ----
// The transcript abbreviates ("APCSA", "ALG2", "ENG 1"); transcriptCourseName
// expands the common ones. Compare by level-free subject key first, then by
// word overlap with abbreviations expanded, so "AP Comp Sci A-Math" still finds
// "AP Computer Science A".
const ALIAS = {
  COMP: 'COMPUTER', SCI: 'SCIENCE', CALC: 'CALCULUS', PRECAL: 'PRECALCULUS', PRECALC: 'PRECALCULUS',
  GEOG: 'GEOGRAPHY', HIST: 'HISTORY', GOVT: 'GOVERNMENT', GOV: 'GOVERNMENT', ECON: 'ECONOMICS',
  PRIN: 'PRINCIPLES', ENG: 'ENGLISH', ALG: 'ALGEBRA', GEOM: 'GEOMETRY', BIO: 'BIOLOGY',
  CHEM: 'CHEMISTRY', PHYS: 'PHYSICS', STAT: 'STATISTICS', STATS: 'STATISTICS', LANG: 'LANGUAGE',
  LIT: 'LITERATURE', ENV: 'ENVIRONMENTAL', ENVIRO: 'ENVIRONMENTAL', PSYCH: 'PSYCHOLOGY',
  HLTH: 'HEALTH', SPAN: 'SPANISH', HUM: 'HUMAN', TECH: 'TECHNOLOGY', APPS: 'APPLICATIONS',
  INTRO: 'INTRODUCTION', ED: 'EDUCATION', ENGR: 'ENGINEERING', DES: 'DESIGN',
}
const DROP = new Set(['ADV', 'ADVANCED', 'GT', 'HON', 'HONORS', 'PAP', 'PREAP', 'HS', 'ONLINE', 'OC', 'VL',
  'S1', 'S2', 'YR', 'EA', 'CR', 'THE', 'OF', 'AND', 'FOR', 'A1', 'A2', 'B1', 'B2'])
const ROMAN = { I: '1', II: '2', III: '3', IV: '4' }
export function nameTokens(name) {
  const out = new Set()
  for (let t of String(name || '').toUpperCase().replace(/@.*$/, '').split(/[^A-Z0-9]+/)) {
    if (!t) continue
    t = ROMAN[t] || t
    t = ALIAS[t] || t
    if (!DROP.has(t)) out.add(t)
  }
  return out
}
const compact = (name) => levelSubject(name)
function nameScore(a, b) {
  const ca = compact(a), cb = compact(b)
  if (ca && ca === cb) return 1
  if (ca && cb && (ca.includes(cb) || cb.includes(ca)) && Math.min(ca.length, cb.length) >= 4) return 0.9
  const ta = nameTokens(a), tb = nameTokens(b)
  if (!ta.size || !tb.size) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}
const MATCH_MIN = 0.5

// Build the lookup index the GPA page and dashboard read. Safe on a missing or
// older-shaped doc: everything comes back empty and the callers fall through to
// the old guesses.
//   byYear: year -> [group]   one group per course per year (S1+S2 merged)
//   byCode: course code -> group (for current-year live classes, whose
//           classwork heading starts with the same FISD code)
//   levels: `${year}|${subject}` -> weight, the same shape levels.js keeps
export function indexCareerPlan(doc, today = new Date()) {
  const idx = { ok: false, plan: null, byYear: new Map(), byCode: new Map(), levels: {}, trustedYears: [] }
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.subjects)) return idx
  const cur = currentSchoolYear(today)
  const groups = new Map()
  for (const s of doc.subjects) {
    for (const c of s?.courses || []) {
      if (!c || !c.name || !c.year) continue
      if (String(c.year) > cur) continue // a future column is a request, not history
      const p = parsePlanName(c.name)
      if (!p.base) continue
      const code = String(c.code || '').toUpperCase()
      const key = `${c.year}|${p.base.toUpperCase()}`
      let g = groups.get(key)
      if (!g) {
        g = {
          year: String(c.year), grade: c.grade || null, name: p.base, subjectArea: s.name || null,
          ea: p.ea || codeFlag(code, 'EA'), cr: p.cr || codeFlag(code, 'CR'), oc: p.oc, online: p.online,
          weight: detectWeight(p.base, null, { live: true }),
          subject: levelSubject(p.base), codes: [], sems: [], credit: 0, complete: true,
        }
        groups.set(key, g)
      }
      if (code && !g.codes.includes(code)) g.codes.push(code)
      if (p.sem && !g.sems.includes(p.sem)) g.sems.push(p.sem)
      const cr = Number(c.credit); if (Number.isFinite(cr)) g.credit += cr
      if (c.complete === false) g.complete = false
    }
  }
  for (const g of groups.values()) {
    g.credit = Math.round(g.credit * 100) / 100
    if (!idx.byYear.has(g.year)) idx.byYear.set(g.year, [])
    idx.byYear.get(g.year).push(g)
    for (const code of g.codes) idx.byCode.set(code, g)
    if (g.subject) idx.levels[`${g.year}|${g.subject}`] = g.weight
  }
  idx.ok = true
  idx.plan = doc.plan || null
  idx.trustedYears = [...idx.byYear.keys()].sort()
  return idx
}

// The Career Plan row for a TRANSCRIPT course (same school year), or null.
// Each plan row is used at most once per year, so two transcript rows can't
// both land on the same plan course.
export function matchPlanCourse(idx, year, description, used = null) {
  if (!idx?.ok || !year) return null
  const cands = idx.byYear.get(String(year))
  if (!cands?.length) return null
  const friendly = transcriptCourseName(description) || description || ''
  let best = null, bestScore = 0
  for (const g of cands) {
    if (used && used.has(g)) continue
    const s = Math.max(nameScore(g.name, friendly), nameScore(g.name, description || ''))
    if (s > bestScore) { best = g; bestScore = s }
  }
  if (!best || bestScore < MATCH_MIN) return null
  if (used) used.add(best)
  return best
}

// The Career Plan row for a current-year LIVE class, by the course code its
// classwork heading starts with ("ELA11500A - 2 GT HumanitiesI/Eng 1 Adv S1").
export function planCourseForLive(idx, rawName) {
  if (!idx?.ok) return null
  const code = courseCode(rawName)
  return (code && idx.byCode.get(code)) || null
}

// Flags + weight for a transcript row, in one place for the GPA page, the
// dashboard metrics and the Transcript page. `weight` is null when the plan
// has nothing to say (caller falls back to the remembered level / guess).
export function planFacts(idx, year, description, used = null) {
  const g = matchPlanCourse(idx, year, description, used)
  if (!g) return { match: null, ea: false, cr: false, weight: null }
  // An explicit AP/IB/DC transcript abbreviation is already right; a fuzzy name
  // match must never demote it.
  const guess = detectWeight(description)
  return { match: g, ea: g.ea, cr: g.cr, weight: guess >= WEIGHTS.AP ? guess : g.weight }
}

// Short labels for the badges.
export const PLAN_LABELS = {
  ea: { tag: 'EA', title: 'Credit by exam — Frisco leaves these out of the GPA' },
  cr: { tag: 'CR', title: 'Summer / off-cycle course (CR) — counts like any other course' },
}
