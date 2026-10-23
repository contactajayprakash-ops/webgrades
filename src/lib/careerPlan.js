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

// PE / athletics: the transcript says "SUBATH1", the plan says "Tennis JV EQ1".
// No word overlap, but the plan's subject area settles it.
const PE_DESC = /^(SUB\s*)?ATH|^PE\b|^PE\d|PHYS\s*ED|^FOUND\w*\s*(OF\s*)?(PERS\w*\s*)?FIT/i
const PE_AREA = /physical\s*education|athletic/i

// A plan row whose code is the state PEIMS code (8 chars, often with a leading
// "T"): HAC's echo of the transcript record, carrying the state's generic name
// ("Computer Science I") instead of the scheduled course's ("Computer Science 1
// Adv S1"). On a tie the scheduled row — the one with S1/S2 parts — wins, since
// it is the one that knows the level.
const PEIMS_RE = /^T?[A-Z0-9]\d{7}$/
const groupRank = (g) => (g.sems.length ? 2 : g.codes.some((c) => PEIMS_RE.test(c)) ? 0 : 1)

// Which plan column a TRANSCRIPT year reads from. The plan starts at the
// student's first high-school-credit year (Grade 08 here) and files anything
// earlier — Algebra 1 taken in 7th grade — under that first column.
export function planYearFor(idx, year) {
  if (!idx?.ok || !year) return null
  const y = String(year)
  if (idx.byYear.has(y)) return y
  const first = idx.trustedYears[0]
  return first && y < first ? first : null
}

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

// How well a plan group fits a transcript description (0..1).
function planScore(g, description) {
  const friendly = transcriptCourseName(description) || description || ''
  let s = Math.max(nameScore(g.name, friendly), nameScore(g.name, description || ''))
  if (PE_DESC.test(String(description || '').trim()) && PE_AREA.test(g.subjectArea || '')) s = Math.max(s, 0.6)
  return s
}
// Sort key: best score first, then the scheduled row over the PEIMS echo.
const byFit = (a, b) => b.score - a.score || groupRank(b.g) - groupRank(a.g)

// The Career Plan row for ONE transcript course, or null. `used` (a Set) keeps
// a plan row from being handed to two transcript rows.
export function matchPlanCourse(idx, year, description, used = null) {
  const planYear = planYearFor(idx, year)
  const cands = planYear ? idx.byYear.get(planYear) : null
  if (!cands?.length) return null
  const ranked = cands.filter((g) => !used?.has(g)).map((g) => ({ g, score: planScore(g, description) })).sort(byFit)
  const best = ranked[0]
  if (!best || best.score < MATCH_MIN) return null
  if (used) used.add(best.g)
  return best.g
}

// The Career Plan rows for a whole TRANSCRIPT, as Map(row key -> group). Rows
// are assigned best fit first across the whole plan column, so a row that only
// weakly resembles a course can't grab it before the row that is that course,
// and no plan row goes to two transcript rows.
export function matchPlanCourses(idx, rows) {
  const out = new Map()
  if (!idx?.ok) return out
  const pairs = []
  for (const r of rows || []) {
    const planYear = planYearFor(idx, r.year)
    for (const g of (planYear && idx.byYear.get(planYear)) || []) {
      const score = planScore(g, r.description)
      if (score >= MATCH_MIN) pairs.push({ r, g, score })
    }
  }
  pairs.sort(byFit)
  const taken = new Set()
  for (const { r, g } of pairs) {
    if (out.has(r.key) || taken.has(g)) continue
    out.set(r.key, g); taken.add(g)
  }
  return out
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
  return factsFor(matchPlanCourse(idx, year, description, used), description)
}
export function factsFor(g, description) {
  if (!g) return { match: null, ea: false, cr: false, weight: null }
  // An explicit AP/IB/DC transcript abbreviation is already right; a fuzzy name
  // match must never demote it.
  const guess = detectWeight(description)
  return { match: g, ea: g.ea, cr: g.cr, weight: guess >= WEIGHTS.AP ? guess : g.weight }
}

// Completed PAST-year Career Plan courses with no transcript row — the summer AP
// CSA that HAC lists as "CR" and hasn't posted yet. The GPA setup offers them as
// one-tap "Add course" entries (the student types the grade). Left out: the
// current year (live classes cover it), rows not marked complete, credit by exam
// (never counted anyway), a PEIMS echo of a transcript row, a second row for a
// course that was already matched under another name ("Computer Science I" next
// to "Computer Science 1 Adv"), and the same course listed under two subject
// areas ("AP Comp Sci A-Math" / "AP Comp Sci A-LOTE" — one suggestion, no suffix).
const BUCKET_RE = /\s*-\s*(Math|LOTE|Sci(ence)?|Elec(tive)?|Tech\w*|SS)$/i
export function planSuggestions(idx, priorCourses, facts, today = new Date()) {
  if (!idx?.ok) return []
  const cur = currentSchoolYear(today)
  const matched = new Set(Object.values(facts || {}).map((f) => f?.match).filter(Boolean))
  const matchedSubject = new Set([...matched].map((g) => `${g.year}|${g.subject}`))
  const txCodes = new Set((priorCourses || []).map((c) => String(c.courseCode || '').replace(/\s*-.*$/, '').toUpperCase()).filter(Boolean))
  const seen = new Set()
  const out = []
  for (const year of idx.trustedYears) {
    if (year >= cur) continue
    for (const g of idx.byYear.get(year) || []) {
      if (matched.has(g) || !g.complete || g.ea) continue
      if (g.codes.some((c) => txCodes.has(c.replace(/^T/, '')))) continue
      if (g.subject && matchedSubject.has(`${g.year}|${g.subject}`)) continue
      const name = g.name.replace(BUCKET_RE, '').trim()
      const key = `${g.year}|${levelSubject(name) || name.toUpperCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ key, year: g.year, name, weight: g.weight, credit: g.credit || 1, cr: g.cr, group: g })
    }
  }
  return out
}

// Short labels for the badges.
export const PLAN_LABELS = {
  ea: { tag: 'EA', title: 'Credit by exam — Frisco leaves these out of the GPA' },
  cr: { tag: 'CR', title: 'Summer / off-cycle course (CR) — counts like any other course' },
}
