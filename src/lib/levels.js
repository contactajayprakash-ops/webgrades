// Remembered course levels (Adv vs on-level), per account.
//
// The TRANSCRIPT doesn't say whether "BIO" was Biology or Biology Adv, so
// detectWeight() has to guess (5.5 for the courses most Frisco students take
// advanced). But while a course is CURRENT, its HAC classwork name does say
// ("Biology Adv" vs "Biology"). So every time live classwork lands we remember
// each course's level, keyed by school year + subject, and when that year later
// shows up on the transcript the remembered level replaces the guess.
//
// Stored as `wg_levels_<username>` = { "<year>|<SUBJECT>": weight }. Synced with
// the other settings (useSettingsSync), merged rather than replaced on pull.
import { detectWeight, WEIGHTS } from './gpa.js'
import { cleanCourseName, currentSchoolYear } from './courses.js'
import { transcriptCourseName } from './courseCatalog.js'

export const levelsKeyFor = (username) => `wg_levels_${username || '_anon'}`

const ROMAN = { I: '1', II: '2', III: '3', IV: '4' }

// Level-free subject key shared by live names and transcript abbreviations:
// "Biology Adv" / "BIO" -> "BIOLOGY", "English 1 Adv" / "ENG 1" -> "ENGLISH1".
export function levelSubject(name) {
  let n = String(name || '').toUpperCase()
  n = n.replace(/@.*$/, '')
  n = n.replace(/\b(?:ADV(?:ANCED)?|GT|HON(?:ORS)?|PRE-?\s?AP|PAP)\b/g, ' ')
  n = n.replace(/\b(IV|III|II|I)\b/g, (m) => ROMAN[m])
  return n.replace(/[^A-Z0-9]/g, '')
}

export function loadLevels(username) {
  try {
    const v = JSON.parse(localStorage.getItem(levelsKeyFor(username)) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch (_) { return {} }
}

// Record the level of every live (current-year) course name. Writes only when
// something changed. Deliberately does NOT mark settings changed: that stamp
// decides last-write-wins for the whole settings doc, and this runs on every
// data load — the levels ride along with the next real settings push instead.
export function rememberLevels(username, liveNames, year = currentSchoolYear()) {
  if (!username || !liveNames?.length) return
  const levels = loadLevels(username)
  let changed = false
  for (const raw of liveNames) {
    const subject = levelSubject(cleanCourseName(raw))
    if (!subject) continue
    const k = `${year}|${subject}`
    const w = detectWeight(raw, null, { live: true })
    if (levels[k] !== w) { levels[k] = w; changed = true }
  }
  if (!changed) return
  try { localStorage.setItem(levelsKeyFor(username), JSON.stringify(levels)) } catch (_) {}
}

// Union of two stored level maps (JSON strings); `a` wins on conflict.
export function mergeLevelsJson(a, b) {
  const parse = (s) => { try { const v = JSON.parse(s || '{}'); return v && typeof v === 'object' ? v : {} } catch (_) { return {} } }
  return JSON.stringify({ ...parse(b), ...parse(a) })
}

// Weight for a prior-year TRANSCRIPT course: the level remembered from when it
// was a live class that year, else the name-based guess. An explicit AP/IB/DC
// transcript name stays 6.0 either way.
export function transcriptWeight(description, courseCode, year, levels) {
  const guess = detectWeight(description, courseCode)
  if (guess >= WEIGHTS.AP || !levels || !year) return guess
  const subject = levelSubject(transcriptCourseName(description))
  const remembered = subject ? levels[`${year}|${subject}`] : undefined
  return remembered ?? guess
}
