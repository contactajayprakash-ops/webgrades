// Course Plan page helpers: reading HAC's Career Plan / Course Requests scrapes
// (see HACFAKESERVERNORUN.txt: parseCareerPlan / parseCourseRequests), merging
// semester halves, naming, weights, the subject-area <-> catalog mapping and the
// "what to enter in HAC" diff. Pure functions, no React.
import { detectWeight, WEIGHTS } from './gpa.js'
import { FISD_CATALOG } from './fisdCatalog.js'
import { currentSchoolYear } from './courses.js'

// ---------- course names ----------

// Delivery / credit-type prefixes HAC puts on course names in the Career Plan.
// They are not levels: EA = credit by exam (CBE), CR = credit recovery / summer,
// OC = off-campus. "@VL" / "Online" mark virtual sections.
const PREFIX_TAGS = { EA: 'Credit by exam', CR: 'Summer', OC: 'Off campus' }

export function courseTags(name) {
  const n = String(name || '')
  const tags = []
  const pm = n.match(/^(EA|CR|OC)\s+/)
  if (pm) tags.push(PREFIX_TAGS[pm[1]])
  if (/@VL\b/.test(n) || /\bOnline\b/i.test(n)) tags.push('Virtual')
  return tags
}

// "CR AP Comp Sci A-Math S1" -> "AP Comp Sci A-Math"; "AP Calculus BC YR" ->
// "AP Calculus BC"; "AP English Language YR@VL" -> "AP English Language".
export function displayCourseName(name) {
  let n = String(name || '').replace(/\s+/g, ' ').trim()
  n = n.replace(/^(EA|CR|OC)\s+/, '')
  n = n.replace(/@VL\b/g, '').trim()
  n = n.replace(/\s+Online\s*$/i, '') // "Geometry Adv HS S1 Online": Online sits after the semester
  n = n.replace(/\s+(S[12]|YR)\s*$/i, '').replace(/\s+YR\s+(S[12])$/i, '')
  return n.trim() || name
}

// Key that joins the S1 + S2 halves of a course within one year.
const semesterKey = (name) => displayCourseName(name).toUpperCase().replace(/[^A-Z0-9]/g, '')

// GPA weight for a course name (future courses carry their level in the name,
// so the live rule applies: trust the name, never guess). Credit-by-exam courses
// get no weight tag — they are not graded.
export function courseWeight(name, code) {
  if (/^EA\s+/.test(name || '')) return null
  return detectWeight(displayCourseName(name), code, { live: true })
}
export const weightTag = (w) => (w == null ? null : w >= WEIGHTS.AP ? 'AP' : w >= WEIGHTS.ADV ? 'Adv' : 'Reg')

// ---------- career plan ----------

// Collapse the career plan's per-semester rows ("X S1" + "X S2", codes …A/…B)
// into one entry per course per year, with the credits summed.
export function mergeSemesters(courses) {
  const out = new Map()
  for (const c of courses || []) {
    const k = `${c.year || ''}|${semesterKey(c.name)}`
    const cur = out.get(k)
    if (!cur) {
      out.set(k, {
        key: k, year: c.year, grade: c.grade,
        name: displayCourseName(c.name), rawName: c.name,
        codes: [c.code].filter(Boolean), credit: c.credit || 0,
        complete: !!c.complete, tags: courseTags(c.name),
        weight: courseWeight(c.name, c.code),
      })
    } else {
      cur.credit += c.credit || 0
      cur.complete = cur.complete && !!c.complete
      if (c.code && !cur.codes.includes(c.code)) cur.codes.push(c.code)
    }
  }
  return [...out.values()]
}

// Where a course sits in time: done (credit earned), current (this school year,
// not complete), requested (a future year's HAC request), or incomplete (a past
// year HAC still shows in italics).
export function courseStatus(entry, nowYear = currentSchoolYear()) {
  if (entry.complete) return 'done'
  if (!entry.year) return 'requested'
  if (entry.year < nowYear) return 'incomplete'
  if (entry.year === nowYear) return 'current'
  return 'requested'
}

// "01. Language Arts" / "01. Language Arts (FLA)" -> "01";
// "Language Arts for Endorsements (FLANG)" -> "FLANG"; "No Subject Area" -> "NOCODE".
export function subjectKey(nameOrSubject) {
  const s = typeof nameOrSubject === 'string' ? { name: nameOrSubject } : (nameOrSubject || {})
  const m = String(s.name || '').match(/^(\d+)\./)
  if (m) return m[1].padStart(2, '0')
  return s.code || String(s.name || '').replace(/\s+/g, '').toUpperCase() || '?'
}
// "01. Language Arts (FLA)" -> "Language Arts"
export function subjectTitle(name) {
  return String(name || '').replace(/^\d+\.\s*/, '').replace(/\s*\([A-Z]+\)\s*$/, '').trim()
}

// Credits earned so far (complete rows) and the plan's own totals.
export function planSummary(cp) {
  const subjects = cp?.subjects || []
  let earned = 0, inProgress = 0, requested = 0
  const nowYear = currentSchoolYear()
  for (const s of subjects) for (const c of s.courses || []) {
    const st = courseStatus(c, nowYear)
    if (st === 'done') earned += c.credit || 0
    else if (st === 'current') inProgress += c.credit || 0
    else if (st === 'requested') requested += c.credit || 0
  }
  return {
    earned, inProgress, requested,
    needed: cp?.totals?.toDate?.creditNeeded ?? subjects.reduce((n, s) => n + (s.creditNeeded || 0), 0),
    estimated: cp?.totals?.toDate?.estCredit ?? subjects.reduce((n, s) => n + (s.estCredit || 0), 0),
  }
}

// ---------- catalog (for the course picker) ----------

// Loose match between a HAC request code and a catalog code: strip the
// year/semester letters HAC appends ("MTH45305Y" -> "MTH45305", "MTH11100AM" ->
// "MTH11100") and the virtual-section "V" prefix.
export function codeCore(code) {
  let c = String(code || '').toUpperCase().replace(/\s+/g, '')
  c = c.replace(/[A-Z]+$/, '')
  return c
}
const sameCourse = (a, b) => {
  const x = codeCore(a), y = codeCore(b)
  return !!x && (x === y || x.replace(/^V/, '') === y.replace(/^V/, ''))
}
export const hasCourse = (codes, code) => codes.some((c) => sameCourse(c, code))

// Catalog level -> the short label shown on a picker row.
const LEVEL_LABEL = { AP: 'AP', Advanced: 'Adv', GT: 'GT', 'Dual Credit': 'Dual credit', 'International Baccalaureate': 'IB' }

let catalogCache = null
// Every high-school course in the FISD course catalog (src/lib/fisdCatalog.js,
// generated by scripts/gen-fisd-catalog.mjs).
export function catalogCourses() {
  if (catalogCache) return catalogCache
  catalogCache = FISD_CATALOG.map(([code, name, hacName, credit, grades, level, subjects, department, prereq]) => ({
    code, name, hacName, credit, grades, subjects, department, prereq,
    level: LEVEL_LABEL[level] || null,
    weight: courseWeight(hacName || name, code),
    virtual: /@VL\b/.test(hacName) || /\bvirtual\b/i.test(name),
    search: `${name} ${hacName} ${code} ${department}`.toLowerCase(),
  }))
  return catalogCache
}

// grade = the grade the student will be in that year (a number); courses not
// offered to that grade sort after the ones that are.
export function searchCatalog(query, { subject = null, grade = null, limit = 80 } = {}) {
  const words = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const ok = [], later = []
  for (const c of catalogCourses()) {
    if (subject && !c.subjects.includes(subject)) continue
    if (words.length && !words.every((w) => c.search.includes(w))) continue
    ;(grade && !c.grades.includes(grade) ? later : ok).push(c)
  }
  return [...ok, ...later].slice(0, limit)
}

// "Grades 10–12", "Grade 12", "Grades 9, 11"
export function gradesLabel(grades) {
  const g = grades || []
  if (!g.length) return ''
  if (g.length === 1) return `Grade ${g[0]}`
  const run = g.every((n, i) => i === 0 || n === g[i - 1] + 1)
  return run ? `Grades ${g[0]}–${g[g.length - 1]}` : `Grades ${g.join(', ')}`
}

// ---------- the HAC diff ----------

// Everything that still has to be done in HAC for `year`, grouped by subject
// area: adds not yet requested, drops still requested. Entries already
// reflected in HAC are left out (pruneSatisfied clears them from the draft).
export function hacTodo(requests, entries) {
  const bySubject = new Map()
  const codesOf = (s) => (s.courses || []).map((c) => c.code)
  for (const e of entries || []) {
    const subj = (requests?.subjects || []).find((s) => subjectKey(s) === e.subject)
    const codes = subj ? codesOf(subj) : []
    const inHac = hasCourse(codes, e.code)
    if (e.kind === 'add' ? inHac : !inHac) continue
    const k = e.subject
    if (!bySubject.has(k)) bySubject.set(k, { subject: e.subject, name: subj?.name || e.subjectName || e.subject, adds: [], drops: [] })
    bySubject.get(k)[e.kind === 'add' ? 'adds' : 'drops'].push(e)
  }
  return [...bySubject.values()]
}

export const HAC_REQUESTS_URL = 'https://hac.friscoisd.org/HomeAccess/Classes/Requests'
export const HAC_CAREER_PLAN_URL = 'https://hac.friscoisd.org/HomeAccess/Classes/CareerPlan'
