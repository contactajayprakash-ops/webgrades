import { parseGrade } from './gpa.js'
import { cleanCourseName } from './courses.js'

// A per-account snapshot of the grades the student last *saw*, so we can
// highlight what changed since their last visit (distinct from the in-session
// sync toast). New snapshot shape: { [courseName]: { avg, a: { name: grade } } }
// — richer than the old flat { [courseName]: avg } so we can surface the exact
// assignment that posted, not just the course average. Old flat snapshots are
// still read (treated as avg-only) so nobody's history breaks.
const keyFor = (u) => `wg_seen_${u || '_anon'}`

export function loadSeen(username) {
  try { return JSON.parse(localStorage.getItem(keyFor(username))) || null } catch (_) { return null }
}

export function saveSeen(username, snapshot) {
  try { localStorage.setItem(keyFor(username), JSON.stringify(snapshot)) } catch (_) {}
}

// A graded assignment's display grade, or null if it's not really graded yet.
const gradeOf = (a) => {
  const g = a && a.grade
  if (g == null || String(g).trim() === '') return null
  return parseGrade(g) == null ? null : String(g).trim()
}

// Map of graded assignments for one class: { assignmentName: grade }.
function assignmentsOf(course) {
  const a = {}
  for (const asg of course.assignments || []) {
    const g = gradeOf(asg)
    if (g != null && asg.assignmentName) a[asg.assignmentName] = g
  }
  return a
}

// Snapshot the current classes: avg + per-assignment grades.
export function snapshotOf(classes) {
  const s = {}
  for (const c of classes || []) s[c.courseName] = { avg: c.overallAverage, a: assignmentsOf(c) }
  return s
}

// Normalize a stored entry (handles the legacy flat string form).
function entryOf(seen, courseName) {
  const e = seen && seen[courseName]
  if (e == null) return null
  if (typeof e === 'object') return { avg: e.avg, a: e.a || {}, hadAssignments: true }
  return { avg: e, a: {}, hadAssignments: false } // legacy: avg only
}

// Course names whose average OR any assignment changed vs the last-seen snapshot.
export function changedSince(seen, classes) {
  if (!seen) return []
  const out = []
  for (const c of classes || []) {
    const e = entryOf(seen, c.courseName)
    if (!e) { out.push(c.courseName); continue } // brand-new class
    if (e.avg !== c.overallAverage) { out.push(c.courseName); continue }
    if (e.hadAssignments && JSON.stringify(assignmentsOf(c)) !== JSON.stringify(e.a)) out.push(c.courseName)
  }
  return out
}

// The specific assignments graded/changed since last seen, for the feed:
// [{ course, name, grade, isNew }]. Skips classes with no assignment baseline
// (legacy snapshot / first-ever visit) so we don't flood the feed on upgrade.
export function postedSince(seen, classes) {
  if (!seen) return []
  const out = []
  for (const c of classes || []) {
    const e = entryOf(seen, c.courseName)
    if (!e || !e.hadAssignments) continue
    const cur = assignmentsOf(c)
    for (const [name, grade] of Object.entries(cur)) {
      if (e.a[name] !== grade) out.push({ course: cleanCourseName(c.courseName), name, grade, isNew: !(name in e.a) })
    }
  }
  return out
}
