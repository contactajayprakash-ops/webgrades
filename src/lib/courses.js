import { parseGrade } from './gpa.js'

// HAC course headings look like:
//   "ELA11500A - 2 GT HumanitiesI/Eng 1 Adv S1"
//   "MTH34300A - 5 AP Pre Calculus S1"
// Strip the leading "<code> - <section>" and trailing semester marker for display.
export function cleanCourseName(raw) {
  if (!raw) return 'Unknown'
  let n = raw.replace(/\s+/g, ' ').trim()
  n = n.replace(/^[A-Z0-9]+\s*-\s*\d+\s+/, '') // drop "ELA11500A - 2 "
  n = n.replace(/\s+S[12]$/i, '') // drop trailing " S1" / " S2"
  return n.trim() || raw
}

// A stable key for a course across quarters/semesters (so weight overrides
// stick). Drops the A/B suffix that distinguishes S1 vs S2 sections.
export function courseKey(raw) {
  return cleanCourseName(raw).toUpperCase().replace(/\s+EQ\d+$/i, '').trim()
}

export const SEMESTERS = [
  { id: 's1', label: 'Semester 1', short: 'S1', quarters: ['1', '2'] },
  { id: 's2', label: 'Semester 2', short: 'S2', quarters: ['3', '4'] },
]

export const QUARTERS = [
  { value: '1', label: 'Q1', sem: 's1' },
  { value: '2', label: 'Q2', sem: 's1' },
  { value: '3', label: 'Q3', sem: 's2' },
  { value: '4', label: 'Q4', sem: 's2' },
]

export function semesterOfQuarter(q) {
  return QUARTERS.find((x) => x.value === String(q))?.sem || 's2'
}

// Estimate a class average from its assignment list (points-based).
// APPROXIMATION — HAC weights by category, which the scrape doesn't expose.
export function estimateAverage(rows) {
  let earned = 0
  let possible = 0
  for (const a of rows || []) {
    const g = parseGrade(a.score ?? a.grade)
    const tp = parseGrade(a.total ?? a.totalPoints)
    if (g == null || tp == null || tp <= 0) continue
    earned += g
    possible += tp
  }
  if (possible <= 0) return null
  return (earned / possible) * 100
}

// Average the numeric semester grades on a transcript course (ignores "P", null).
export function transcriptGrade(course) {
  const vals = [course.sem1, course.sem2, course.final]
    .map((v) => parseGrade(v))
    .filter((v) => v != null)
  if (!vals.length) return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
}

export const PERIODS = [
  { id: 's1', label: 'Semester 1' },
  { id: 's2', label: 'Semester 2' },
  { id: 'year', label: 'Full Year' },
]

// For a transcript course + a time period, return { grade, credit } or null.
// Sem-scoped views give a full-year course half its credit; full-year views
// give it all of it with the averaged grade.
export function transcriptPeriod(course, period) {
  const s1 = parseGrade(course.sem1)
  const s2 = parseGrade(course.sem2)
  const fullCredit = parseGrade(course.credit) ?? 0.5
  const bothSems = s1 != null && s2 != null
  const halfCredit = bothSems ? Math.round((fullCredit / 2) * 100) / 100 : fullCredit

  if (period === 's1') return s1 == null ? null : { grade: s1, credit: halfCredit }
  if (period === 's2') return s2 == null ? null : { grade: s2, credit: halfCredit }
  const g = transcriptGrade(course)
  return g == null ? null : { grade: g, credit: fullCredit }
}
