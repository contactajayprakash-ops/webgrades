// A per-account snapshot of the grades the student last *saw*, so we can
// highlight what changed since their last visit (distinct from the in-session
// sync toast). Snapshot shape: { [courseName]: overallAverage }.
const keyFor = (u) => `wg_seen_${u || '_anon'}`

export function loadSeen(username) {
  try { return JSON.parse(localStorage.getItem(keyFor(username))) || null } catch (_) { return null }
}

export function saveSeen(username, snapshot) {
  try { localStorage.setItem(keyFor(username), JSON.stringify(snapshot)) } catch (_) {}
}

// Snapshot the current classes (courseName -> overallAverage).
export function snapshotOf(classes) {
  const s = {}
  for (const c of classes || []) s[c.courseName] = c.overallAverage
  return s
}

// Course names whose average changed (or are brand new) vs the last-seen snapshot.
export function changedSince(seen, classes) {
  if (!seen) return []
  const out = []
  for (const c of classes || []) {
    if (!(c.courseName in seen) || seen[c.courseName] !== c.overallAverage) out.push(c.courseName)
  }
  return out
}
