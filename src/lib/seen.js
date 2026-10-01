import { parseGrade } from './gpa.js'
import { cleanCourseName } from './courses.js'
import { isAssessment, isProgress } from './whatif.js'

// Frisco classes split assignments into Assessment (AOL) and Progress (PC)
// categories, and the SAME assignment name appears in BOTH with different grades
// (e.g. "1D Forces Math" is an AOL 100 and a PC 80). Keying a grade by name
// alone collapses the pair — the second row silently overwrites the first — so
// an AOL 100 disappears behind its same-named PC 80 and never shows in "Recently
// posted". Tag the key with the category so both survive. Falls back to the bare
// name for uncategorized assignments (and legacy snapshots match unchanged).
const catTag = (cat) => (isAssessment(cat) ? 'aol' : isProgress(cat) ? 'pc' : '')
const asgKey = (name, cat) => { const t = catTag(cat); return t ? `${name}\u0000${t}` : name }

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

// When WebGrades FIRST saw each assignment graded — our proxy for "posted on HAC"
// (HAC doesn't expose a real post timestamp). Persisted per account and NEVER
// reset by "mark seen" (unlike the seen snapshot), so each assignment keeps its
// own first-seen time. Shape: { "<courseName>||<assignmentName>": ms }. A value
// of 0 means "seeded" — present before we started tracking, so we show no time
// for it rather than a bogus "just now".
const postedKeyFor = (u) => `wg_posted_${u || '_anon'}`
const idOf = (courseName, name) => `${courseName}||${name}`

export function loadPosted(username) {
  try { return JSON.parse(localStorage.getItem(postedKeyFor(username))) || null } catch (_) { return null }
}

// Record the first-seen time of every currently-graded assignment. The first ever
// call for an account (no store yet) seeds all current assignments at 0 (unknown
// time) so we don't stamp a whole gradebook as "just now"; every later call
// stamps only genuinely new keys with the real time. Returns the map.
export function recordPosted(username, classes) {
  const stored = loadPosted(username)
  const baseline = stored == null
  const map = stored || {}
  const now = Date.now()
  for (const c of classes || []) {
    for (const asg of c.assignments || []) {
      const g = gradeOf(asg)
      if (g == null || !asg.assignmentName || isSubtotalName(asg.assignmentName)) continue
      const id = idOf(c.courseName, asgKey(asg.assignmentName, asg.category))
      if (!(id in map)) map[id] = baseline ? 0 : now
    }
  }
  try { localStorage.setItem(postedKeyFor(username), JSON.stringify(map)) } catch (_) {}
  return map
}

// A graded assignment's display grade, or null if it's not really graded yet.
const gradeOf = (a) => {
  const g = a && a.grade
  if (g == null || String(g).trim() === '') return null
  return parseGrade(g) == null ? null : String(g).trim()
}

// HAC's per-class category-summary rows (Category | Weight | Points | Percent)
// share the assignment row markup, so they leak in as fake assignments with a
// bare-number "name" ("100.00", "200.00"). The Pi now filters these at the
// parser, but guard here too so already-cached data / older snapshots don't
// surface them in "Recently posted" before the next re-scrape.
const isSubtotalName = (n) => /^\s*-?\d+(\.\d+)?\s*$/.test(String(n || ''))

// Map of graded assignments for one class: { asgKey(name, category): grade }.
// Keyed by name+category (not name alone) so an AOL and PC row sharing a name
// both survive instead of one clobbering the other.
function assignmentsOf(course) {
  const a = {}
  for (const asg of course.assignments || []) {
    const g = gradeOf(asg)
    if (g != null && asg.assignmentName && !isSubtotalName(asg.assignmentName)) a[asgKey(asg.assignmentName, asg.category)] = g
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
// [{ course, name, grade, isNew, category, postedAt }]. Skips classes with no
// assignment baseline (legacy snapshot / first-ever visit) so we don't flood the
// feed on upgrade. `postedMap` (from recordPosted) supplies each row's first-seen
// time; 0/absent means unknown (seeded before tracking) and the UI shows no time.
export function postedSince(seen, classes, postedMap = null) {
  if (!seen) return []
  const out = []
  for (const c of classes || []) {
    const e = entryOf(seen, c.courseName)
    if (!e || !e.hadAssignments) continue
    // Walk the raw rows (not the deduped map) so each AOL/PC row keeps its own
    // name + category + grade; a composite key keeps same-named rows distinct.
    const seenKeys = new Set()
    for (const asg of c.assignments || []) {
      const grade = gradeOf(asg)
      const name = asg.assignmentName
      if (grade == null || !name || isSubtotalName(name)) continue
      const key = asgKey(name, asg.category)
      if (seenKeys.has(key)) continue // identical dup rows within a class
      seenKeys.add(key)
      // Fall back to the bare-name entry so a pre-upgrade snapshot (keyed by name
      // alone) still matches the unchanged row instead of flooding the feed.
      const prev = key in e.a ? e.a[key] : e.a[name]
      if (prev !== grade) out.push({
        course: cleanCourseName(c.courseName), name, grade,
        isNew: !(key in e.a) && !(name in e.a), category: asg.category,
        postedAt: (postedMap && postedMap[idOf(c.courseName, key)]) || 0,
      })
    }
  }
  return out
}
