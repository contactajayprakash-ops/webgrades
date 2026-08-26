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

export const isAssessment = (cat) => /assess|aol/i.test(cat || '')
export const isProgress = (cat) => /progress|prog|\bpc\b/i.test(cat || '')

// Frisco's overall grade is Assessment-driven: a class reads N/A until an
// Assessment (AOL) grade is posted, even if Progress (PC) grades exist. Honor
// that so (a) an ungraded class isn't counted as a 0 that drags the GPA negative,
// and (b) a what-if edit to a PC doesn't fabricate an overall grade. Rules:
//   - nothing graded            -> N/A
//   - uses AOL/PC categories but no graded Assessment -> N/A
//   - not an AOL/PC-graded class -> leave it alone (use estimate/official)
// A hypothetical added row counts as an assessment, so projecting a future grade
// still works.
export function categoryNA(rows) {
  const graded = (rows || []).filter((r) => r.score != null)
  if (!graded.length) return true
  const usesCategories = rows.some((r) => isAssessment(r.category) || isProgress(r.category))
  if (!usesCategories) return false
  return !graded.some((r) => isAssessment(r.category) || r.hypo)
}

// The rows that actually count toward the overall estimate. In an AOL/PC-graded
// class the overall is Assessment-driven, so only Assessments (AOL) count —
// Progress checks (PC) are formative and don't move the class average. (Without
// this, editing an AOL to 100 still averages in a graded PC and reads e.g. 88
// instead of 100.) Hypothetical added rows count, so projecting still works. A
// class that doesn't use AOL/PC categories pools all assignments as before.
export function countingRows(rows) {
  const usesCategories = (rows || []).some((r) => isAssessment(r.category) || isProgress(r.category))
  if (!usesCategories) return rows || []
  return (rows || []).filter((r) => isAssessment(r.category) || r.hypo)
}

// N/A-aware official average for a raw course (no what-if edits) — for display
// where 0% would otherwise show for a not-yet-really-graded class.
export function officialAverage(course) {
  const rows = (course.assignments || []).map((a) => ({ category: a.category, score: parseGrade(a.grade) }))
  return categoryNA(rows) ? null : parseGrade(course.overallAverage)
}

// Effective average for a class in a quarter: the points-based estimate when
// the student has edited something, otherwise HAC's official average — but N/A
// until the class is really graded (see categoryNA).
export function effectiveAverage(quarter, course, edits) {
  const rows = classRows(quarter, course, edits)
  const anyEdit = rows.some((r) => r.edited)
  const official = parseGrade(course.overallAverage)
  const na = categoryNA(rows)
  return {
    rows,
    official: na ? null : official,
    edited: anyEdit,
    avg: na ? null : (anyEdit ? estimateAverage(countingRows(rows)) : official),
  }
}
