// Pure GPA row-building, shared by the GPA page and the Dashboard so a GPA
// number shown on the dashboard is computed the EXACT same way (single source
// of truth — no risk of the two screens disagreeing).
import { effectiveAverage } from './whatif.js'
import { detectWeight, parseGrade, semesterGrade, liveSemesterAverage } from './gpa.js'
import { cleanCourseName, courseKey, transcriptPeriod, currentSchoolYear } from './courses.js'
import { transcriptCourseName } from './courseCatalog.js'

export const PERIOD_QUARTERS = { s1: ['1', '2'], s2: ['3', '4'], year: ['1', '2', '3', '4'] }

// Period grade + credit for a resolved current-year course. s1/s2 are the
// OFFICIAL transcript semester grades when posted, else the live estimate.
export function resolvedPeriod(c, period) {
  if (period === 's1') return c.s1 == null ? null : { grade: c.s1, credit: 0.5 }
  if (period === 's2') return c.s2 == null ? null : { grade: c.s2, credit: 0.5 }
  const sems = [c.s1, c.s2].filter((x) => x != null)
  if (!sems.length) return null
  return { grade: sems.reduce((a, b) => a + b, 0) / sems.length, credit: c.credit }
}

// Match each live current-year course to its transcript course so we can use
// HAC's official semester grades. Live `semesterGrade` equals the posted sem1
// for every course, so grades are a reliable join key (text breaks ties).
const normName = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export function matchOfficial(liveCourses, txCourses) {
  const pairs = []
  for (const L of liveCourses) for (const T of txCourses) {
    const t1 = parseGrade(T.sem1), t2 = parseGrade(T.sem2)
    let s = 0
    if (L.rawS1 != null && t1 != null && L.rawS1 === t1) s += 100
    if (L.rawS2 != null && t2 != null && L.rawS2 === t2) s += 50
    const a = normName(L.name), b = normName(T.description)
    if (a && b && (a.includes(b) || b.includes(a))) s += 20
    if (s > 0) pairs.push({ L, T, s })
  }
  pairs.sort((a, b) => b.s - a.s)
  const uL = new Set(), uT = new Set(), map = {}
  for (const p of pairs) {
    if (uL.has(p.L.key) || uT.has(p.T.code)) continue
    map[p.L.key] = { sem1: parseGrade(p.T.sem1), sem2: parseGrade(p.T.sem2), credit: parseGrade(p.T.credit) }
    uL.add(p.L.key); uT.add(p.T.code)
  }
  return map
}

// ---- LIVE rows (classwork) ----
export function buildLiveRows({ quarters, period, edits, weights, liveGrades = {}, liveExcluded = {} }) {
  const mergeQuarters = (qs) => {
    const map = new Map() // courseName -> grades[]
    for (const q of qs) {
      for (const c of quarters[q]?.classes || []) {
        if (!map.has(c.courseName)) map.set(c.courseName, [])
        const g = effectiveAverage(q, c, edits).avg
        if (g != null) map.get(c.courseName).push(g)
      }
    }
    return Array.from(map.entries()).map(([name, grades]) => {
      // Live semester average = average of the rounded quarters (NOT re-rounded),
      // so the live GPA stays consistent with the quarter GPAs.
      const auto = liveSemesterAverage(grades)
      return { key: name, name: cleanCourseName(name), rawName: name, autoGrade: auto }
    })
  }
  const semRows = period === 's2' ? mergeQuarters(['3', '4'])
    : period === 's1' ? mergeQuarters(['1', '2'])
    : [...mergeQuarters(['1', '2']), ...mergeQuarters(['3', '4'])]

  const needed = PERIOD_QUARTERS[period]
  const ready = needed.every((q) => quarters[q] && !quarters[q].error)
  const anyError = needed.some((q) => quarters[q]?.error)
  const weightForLive = (name) => weights[courseKey(name)] ?? detectWeight(name)
  const rows = semRows.map((r) => ({
    key: r.key, name: r.name,
    grade: liveGrades[r.key] !== undefined ? liveGrades[r.key] : r.autoGrade,
    autoGrade: r.autoGrade,
    weight: weightForLive(r.rawName),
    credit: 0.5,
    include: !liveExcluded[r.key] && (liveGrades[r.key] !== undefined ? liveGrades[r.key] : r.autoGrade) != null,
  }))
  return { rows, ready, anyError, error: needed.map((q) => quarters[q]?.error).find(Boolean) }
}

// ---- CUMULATIVE building blocks ----
// Current-year courses from live classwork (computed whole-number semester grades).
export function buildCurrentLiveRaw({ quarters, edits }) {
  const map = new Map()
  for (const q of ['1', '2', '3', '4']) {
    for (const c of quarters[q]?.classes || []) {
      const k = courseKey(c.courseName)
      if (!map.has(k)) map.set(k, { key: k, name: cleanCourseName(c.courseName), rawName: c.courseName, q: {} })
      const g = effectiveAverage(q, c, edits).avg
      if (g != null) map.get(k).q[q] = g
    }
  }
  return Array.from(map.values()).map((c) => {
    const s1 = semesterGrade([c.q['1'], c.q['2']])
    const s2 = semesterGrade([c.q['3'], c.q['4']])
    return { ...c, rawS1: s1, rawS2: s2 }
  })
}

// Resolved current courses: use HAC's posted semester grades + credit when
// available (year finalized), else fall back to the live estimate (mid-year).
// `quartersOverride` (prefs.cumulative.quarters) lets a student predict per
// quarter: each course's effective quarters = their override ?? the live per
// -quarter average (c.q), and s1/s2 derive from those with HAC-official rounding
// (round each quarter, average, round) — the exact method the transcript uses.
export function buildCurrentLive({ currentLiveRaw, currentGroup, latestYear, quartersOverride = {} }) {
  const txCur = (currentGroup?.courses || []).map((c) => ({ ...c, code: c.courseCode || `${latestYear}-${c.description}` }))
  const officialMap = txCur.length ? matchOfficial(currentLiveRaw, txCur) : {}
  return currentLiveRaw.map((c) => {
    const o = officialMap[c.key]
    // Effective per-quarter grades: override wins, else the live average.
    const qov = quartersOverride[c.key] || {}
    const qEff = {}
    for (const n of ['1', '2', '3', '4']) {
      const v = qov[n] != null ? qov[n] : c.q?.[n]
      qEff[n] = v == null ? null : Number(v)
    }
    // Quarter-derived semesters (HAC-official). Official posted transcript grade
    // still wins when the year is finalized.
    const qS1 = semesterGrade([qEff['1'], qEff['2']])
    const qS2 = semesterGrade([qEff['3'], qEff['4']])
    const s1 = o && o.sem1 != null ? o.sem1 : qS1
    const s2 = o && o.sem2 != null ? o.sem2 : qS2
    // Credit reflects how much of the (full-year) course is done: 0.25 per
    // quarter that has a grade — so a course with only Q1 counts 0.25 toward the
    // running cumulative, and grows to 1.0 as all four quarters fill in. Official
    // posted transcript credit wins when the year is finalized.
    const nQ = ['1', '2', '3', '4'].filter((n) => qEff[n] != null).length
    const credit = o && o.credit != null && s1 != null && s2 != null ? o.credit : (nQ * 0.25 || 0.5)
    return { ...c, qEff, nQ, s1, s2, credit, official: !!o, sems: [s1, s2].filter((x) => x != null).join(' / ') || '—' }
  })
}

export function buildPriorCourses(priorGroups) {
  const out = []
  for (const g of priorGroups) for (const c of g.courses || []) {
    out.push({ ...c, code: c.courseCode || `${g.year}-${c.description}`, year: g.year })
  }
  return out
}

// Cumulative rows — ONE ROW PER SEMESTER, because Frisco computes GPA on
// semester grades, not on a course's year average. This matters for the
// UNWEIGHTED 4.0: an 89 in a semester is a B (3.0), and averaging it with a 9x
// other semester into a 9x "year grade" would hide it (reading 4.0 instead of
// 3.5). Splitting per semester also leaves the WEIGHTED 6.0 unchanged — its
// formula is linear, so two 0.5-credit semesters equal one 1.0-credit year
// average. Selection stays per COURSE (baseKey); the GPA is computed per row.
export function buildCumRows({ currentLive, priorCourses, included, period, prefs, latestYear }) {
  const rows = []
  const weights = prefs.cumulative.weights || {}
  const weightsSem = prefs.cumulative.weightsSem || {}
  const creditsOv = prefs.cumulative.credits || {}
  const grades = prefs.cumulative.grades || {}
  const wantS1 = period !== 's2'
  const wantS2 = period !== 's1'
  const push = (baseKey, name, year, semTag, grade, credit, weight, manual) => {
    if (grade == null || !(credit > 0)) return
    rows.push({
      key: semTag ? `${baseKey}#${semTag}` : baseKey, baseKey,
      name: semTag ? `${name} · ${semTag}` : name, year, grade, autoGrade: grade,
      weight, credit, include: true, manual,
    })
  }

  // Current year — each semester's grade (from the quarters) at 0.25 credit per
  // graded quarter in it, so S1 = 0.25 (Q1 only) … 0.5 (Q1+Q2), and likewise S2.
  for (const c of currentLive) {
    if (!included[c.key]) continue
    const weight = weights[c.key] ?? detectWeight(c.rawName)
    // Per-semester weight when a class changes course mid-year (e.g. SS Research
    // 5.0 in S1 becomes AP Psych 6.0 in S2). Each semester is its own GPA row, so
    // splitting the weight is exact — no averaging hack.
    const ws = weightsSem[c.key]
    const w1 = ws && ws.s1 != null ? ws.s1 : weight
    const w2 = ws && ws.s2 != null ? ws.s2 : weight
    let cS1 = ['1', '2'].filter((n) => c.qEff?.[n] != null).length * 0.25
    let cS2 = ['3', '4'].filter((n) => c.qEff?.[n] != null).length * 0.25
    // A full-credit override scales the two semesters proportionally.
    if (creditsOv[c.key] != null && cS1 + cS2 > 0) {
      const k = creditsOv[c.key] / (cS1 + cS2); cS1 *= k; cS2 *= k
    }
    const curYear = currentSchoolYear()
    if (wantS1) push(c.key, c.name, curYear, 'S1', c.s1, cS1, w1)
    if (wantS2) push(c.key, c.name, curYear, 'S2', c.s2, cS2, w2)
  }

  // Prior years — the transcript's two SEMESTER grades, each at half the course
  // credit (or full credit for a one-semester course).
  for (const c of priorCourses) {
    if (!included[c.code]) continue
    const weight = weights[c.code] ?? detectWeight(c.description, c.courseCode)
    const s1 = parseGrade(c.sem1), s2 = parseGrade(c.sem2)
    const full = creditsOv[c.code] ?? parseGrade(c.credit) ?? 1
    const both = s1 != null && s2 != null
    const half = both ? Math.round((full / 2) * 100) / 100 : full
    const name = transcriptCourseName(c.description) || c.code
    if (wantS1 && s1 != null) push(c.code, name, c.year, both ? 'S1' : '', s1, half, weight)
    if (wantS2 && s2 != null) push(c.code, name, c.year, both ? 'S2' : '', s2, half, weight)
  }

  // Manually-added courses — a single user grade at full credit (one entry).
  for (const m of prefs.cumulative.manual || []) {
    const key = `manual:${m.id}`
    if (!included[key]) continue
    push(key, m.name || 'Added course', 'Added', '', parseGrade(grades[key]),
      creditsOv[key] ?? 1, weights[key] ?? 5, true)
  }
  return rows
}

// Derive the transcript year groupings the cumulative views need.
//
// The latest transcript group is the CURRENT year only if its school-year LABEL
// is this school year. HAC posts a just-finished year under last school year's
// label (e.g. 9th-grade finals show up as "2025-2026 · Grade 09") while the
// actually-current classes (10th grade) aren't transcripted yet. Telling them
// apart by the year label (vs today's school year) is robust; the old heuristic
// compared live grades to the transcript and false-matched for high-GPA students
// whose grades all cluster in the 90s — labeling the current year as 9th grade
// and orphaning the real 9th-grade courses out of the cumulative setup.
export function splitTranscript(transcript, currentLiveRaw = null, today = new Date()) {
  const txGroups = Array.isArray(transcript) ? transcript : []
  const latestYear = txGroups.reduce((m, g) => (g.year > m ? g.year : m), '')
  const latestGroup = txGroups.find((g) => g.year === latestYear) || null

  // Current only if the latest group's year IS this school year. A group labeled
  // with an earlier school year is completed prior work, no matter what its
  // grades happen to be. (A missing/blank year label falls back to "assume
  // current" so nothing is worse than before.)
  const curYear = currentSchoolYear(today)
  const currentGroup = latestGroup && latestGroup.year && latestGroup.year !== curYear ? null : latestGroup

  const priorGroups = currentGroup ? txGroups.filter((g) => g.year !== latestYear) : txGroups

  // Grade level to show for the live (current) year. When the current year isn't
  // on the transcript yet, guess it as one past the highest completed grade.
  const gradeNums = txGroups.map((g) => parseInt(g.grade, 10)).filter(Number.isFinite)
  const currentGrade = currentGroup
    ? currentGroup.grade
    : (gradeNums.length ? String(Math.max(...gradeNums) + 1).padStart(2, '0') : null)

  return { txGroups, latestYear, currentGroup, priorGroups, currentGrade }
}
