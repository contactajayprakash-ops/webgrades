// Pure GPA row-building, shared by the GPA page and the Dashboard so a GPA
// number shown on the dashboard is computed the EXACT same way (single source
// of truth — no risk of the two screens disagreeing).
import { effectiveAverage } from './whatif.js'
import { detectWeight, parseGrade, semesterGrade, liveSemesterAverage } from './gpa.js'
import { cleanCourseName, courseKey, transcriptPeriod } from './courses.js'
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
  const grades = prefs.cumulative.grades || {}
  // current year — official transcript grades when posted, else live estimate.
  // A manual grade override lets a class with no posted grade (a 0/F ungraded
  // class) still count with a predicted grade, so cumulative "what-if" works.
  for (const c of currentLive) {
    if (!included[c.key]) continue
    const pg = resolvedPeriod(c, period)
    const grade = grades[c.key] != null ? grades[c.key] : pg?.grade
    if (grade == null) continue
    const credit = prefs.cumulative.credits?.[c.key] ?? pg?.credit ?? (period === 'year' ? 1 : 0.5)
    rows.push({
      key: c.key, name: c.name, year: latestYear,
      grade, autoGrade: pg?.grade ?? null,
      weight: prefs.cumulative.weights[c.key] ?? detectWeight(c.rawName),
      credit, include: true,
    })
  }
  // prior years — completed, so they ALWAYS count at their full-year grade
  // and full credit, in every period (a cumulative GPA is a running total).
  for (const c of priorCourses) {
    if (!included[c.code]) continue
    const pg = transcriptPeriod(c, 'year')
    if (!pg) continue
    rows.push({
      key: c.code, name: transcriptCourseName(c.description) || c.code, year: c.year,
      grade: prefs.cumulative.grades?.[c.code] ?? pg.grade, autoGrade: pg.grade,
      weight: prefs.cumulative.weights[c.code] ?? detectWeight(c.description, c.courseCode),
      credit: prefs.cumulative.credits?.[c.code] ?? pg.credit, include: true,
    })
  }
  // manually-added courses (summer / not-yet-transcripted). Grade, weight, and
  // credit live in the same override maps, keyed `manual:<id>`. Completed work,
  // so they count in every period at their full grade + credit.
  for (const m of prefs.cumulative.manual || []) {
    const key = `manual:${m.id}`
    if (!included[key]) continue
    const grade = parseGrade(grades[key])
    if (grade == null) continue
    rows.push({
      key, name: m.name || 'Added course', year: 'Added', manual: true,
      grade, autoGrade: grade,
      weight: prefs.cumulative.weights[key] ?? 5,
      credit: prefs.cumulative.credits?.[key] ?? 1, include: true,
    })
  }
  return rows
}

// Derive the transcript year groupings the cumulative views need.
//
// The latest transcript group is the CURRENT year only if the live classwork
// matches it. HAC posts a finished year under the current calendar year (e.g.
// 9th-grade finals show up labeled "2025-2026 · Grade 09") while the actually-
// current classes (10th grade) haven't been transcripted yet. In that case the
// latest group is completed PRIOR work and the live classwork is the current
// year — otherwise those courses get orphaned (counted nowhere) and the current
// year is mislabeled with the wrong grade level.
export function splitTranscript(transcript, currentLiveRaw = null) {
  const txGroups = Array.isArray(transcript) ? transcript : []
  const latestYear = txGroups.reduce((m, g) => (g.year > m ? g.year : m), '')
  const latestGroup = txGroups.find((g) => g.year === latestYear) || null

  let currentGroup = latestGroup
  if (latestGroup && currentLiveRaw && currentLiveRaw.length) {
    const txCur = (latestGroup.courses || []).map((c) => ({ ...c, code: c.courseCode || `${latestYear}-${c.description}` }))
    // The latest group is the current year only if a real chunk of the live
    // classwork lines up with it (not just one coincidental grade match). If
    // barely anything matches, it's a completed year posted under this label.
    const matched = Object.keys(matchOfficial(currentLiveRaw, txCur)).length
    const need = Math.max(2, Math.ceil((txCur.length || 0) / 3))
    if (matched < need) currentGroup = null
  }

  const priorGroups = currentGroup ? txGroups.filter((g) => g.year !== latestYear) : txGroups

  // Grade level to show for the live (current) year. When the current year isn't
  // on the transcript yet, guess it as one past the highest completed grade.
  const gradeNums = txGroups.map((g) => parseInt(g.grade, 10)).filter(Number.isFinite)
  const currentGrade = currentGroup
    ? currentGroup.grade
    : (gradeNums.length ? String(Math.max(...gradeNums) + 1).padStart(2, '0') : null)

  return { txGroups, latestYear, currentGroup, priorGroups, currentGrade }
}
