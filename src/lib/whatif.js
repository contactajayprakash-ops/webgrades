import { parseGrade } from './gpa.js'
import { estimateAverage } from './courses.js'

// One assignment field is identified by quarter + course name + row index
// (or "extraN" for hypothetical rows the student adds).
export const editKey = (quarter, courseName, i) => `${quarter}::${courseName}::${i}`

// Build a class's assignment rows for a quarter, applying any what-if edits.
export function classRows(quarter, course, edits) {
  const rows = (course.assignments || []).map((a, i) => {
    const k = editKey(quarter, course.courseName, i)
    const e = edits[k]
    return {
      key: k,
      name: a.assignmentName || 'Assignment',
      category: a.category,
      dateDue: a.dateDue,
      score: e && e.score !== undefined ? e.score : parseGrade(a.grade),
      total: e && e.total !== undefined ? e.total : (parseGrade(a.totalPoints) ?? 100),
      edited: !!e,
    }
  })
  // hypothetical assignments the student added
  const prefix = `${quarter}::${course.courseName}::extra`
  for (const k of Object.keys(edits)) {
    if (!k.startsWith(prefix)) continue
    const e = edits[k]
    rows.push({ key: k, name: e.name || 'New assignment', score: e.score ?? null, total: e.total ?? 100, edited: true, hypo: true })
  }
  return rows
}

// Effective average for a class in a quarter: the points-based estimate when
// the student has edited something, otherwise HAC's official average.
export function effectiveAverage(quarter, course, edits) {
  const rows = classRows(quarter, course, edits)
  const anyEdit = rows.some((r) => r.edited)
  const official = parseGrade(course.overallAverage)
  return {
    rows,
    official,
    edited: anyEdit,
    avg: anyEdit ? estimateAverage(rows) : official,
  }
}
