// Pure GPA row-building, shared by the GPA page and the Dashboard so a GPA
// number shown on the dashboard is computed the EXACT same way (single source
// of truth — no risk of the two screens disagreeing).
import { effectiveAverage } from './whatif.js'
import { detectWeight, parseGrade, semesterGrade, liveSemesterAverage } from './gpa.js'
import { cleanCourseName, courseKey, transcriptPeriod } from './courses.js'

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
export function buildCurrentLive({ currentLiveRaw, currentGroup, latestYear }) {
  const txCur = (currentGroup?.courses || []).map((c) => ({ ...c, code: c.courseCode || `${latestYear}-${c.description}` }))
  const officialMap = txCur.length ? matchOfficial(currentLiveRaw, txCur) : {}
  return currentLiveRaw.map((c) => {
    const o = officialMap[c.key]
    const s1 = o && o.sem1 != null ? o.sem1 : c.rawS1
    const s2 = o && o.sem2 != null ? o.sem2 : c.rawS2
    const credit = o && o.credit != null && s1 != null && s2 != null ? o.credit : (s1 != null && s2 != null ? 1 : 0.5)
    return { ...c, s1, s2, credit, official: !!o, sems: [s1, s2].filter((x) => x != null).join(' / ') || '—' }
  })
}

export function buildPriorCourses(priorGroups) {
  const out = []
  for (const g of priorGroups) for (const c of g.courses || []) {
    out.push({ ...c, code: c.courseCode || `${g.year}-${c.description}`, year: g.year })
  }
  return out
}

export function buildCumRows({ currentLive, priorCourses, included, period, prefs, latestYear }) {
  const rows = []
  // current year — official transcript grades when posted, else live estimate
  for (const c of currentLive) {
    if (!included[c.key]) continue
    const pg = resolvedPeriod(c, period)
    if (!pg) continue
    rows.push({
      key: c.key, name: c.name, year: latestYear,
      grade: prefs.cumulative.grades?.[c.key] ?? pg.grade, autoGrade: pg.grade,
      weight: prefs.cumulative.weights[c.key] ?? detectWeight(c.rawName),
      credit: prefs.cumulative.credits?.[c.key] ?? pg.credit, include: true,
    })
  }
  // prior years — completed, so they ALWAYS count at their full-year grade
  // and full credit, in every period (a cumulative GPA is a running total).
  for (const c of priorCourses) {
    if (!included[c.code]) continue
    const pg = transcriptPeriod(c, 'year')
    if (!pg) continue
    rows.push({
      key: c.code, name: c.description || c.code, year: c.year,
      grade: prefs.cumulative.grades?.[c.code] ?? pg.grade, autoGrade: pg.grade,
      weight: prefs.cumulative.weights[c.code] ?? detectWeight(c.description, c.courseCode),
      credit: prefs.cumulative.credits?.[c.code] ?? pg.credit, include: true,
    })
  }
  return rows
}

// Derive the transcript year groupings the cumulative views need.
export function splitTranscript(transcript) {
  const txGroups = Array.isArray(transcript) ? transcript : []
  const latestYear = txGroups.reduce((m, g) => (g.year > m ? g.year : m), '')
  const currentGroup = txGroups.find((g) => g.year === latestYear)
  const priorGroups = txGroups.filter((g) => g.year !== latestYear)
  return { txGroups, latestYear, currentGroup, priorGroups }
}
