// Regression test for splitTranscript (cumulative GPA year/grade-level split).
//
// Bug: a just-completed 9th-grade year is labeled with LAST school year
// ("2025-2026 · Grade 09") while the current 10th-grade classes aren't on the
// transcript yet. The old code decided "is the latest group the current year?"
// by matching live GRADES to the transcript — which false-matches for high-GPA
// students whose grades all cluster in the 90s, so 10th-grade classes got
// labeled grade 09 and the real 9th-grade courses were dropped from the
// cumulative setup. The fix compares the group's school-year LABEL to today.
//
// Run: node scripts/test-transcript-split.mjs
import { splitTranscript } from '../src/lib/gpaCompute.js'

let failed = 0
const check = (name, cond) => {
  if (cond) { console.log(`ok    ${name}`)
  } else { failed++; console.error(`FAIL  ${name}`) }
}

// Real shape from account 242250 (a 4.989-GPA 10th grader), Sept of the 2026-27
// school year. Latest transcript group is last year's 9th grade.
const transcript = [
  { year: '2022-2023', grade: '06', courses: [{ courseCode: 'A', sem1: '95' }] },
  { year: '2024-2025', grade: '08', courses: [{ courseCode: 'B', sem1: '97' }] },
  { year: '2025-2026', grade: '09', courses: [
    { courseCode: 'C', description: 'BIO', sem1: '94', sem2: '99' },
    { courseCode: 'D', description: 'ENG 1', sem1: '93', sem2: '95' },
    { courseCode: 'E', description: 'GEOM', sem1: '98', sem2: '99' },
  ] },
]
// Current 10th-grade live classes — DIFFERENT courses, but grades collide with
// the 9th-grade grades (the trap that broke the old grade-based matcher).
const live = [
  { key: 'k1', name: 'English 2 Adv', rawS1: 94, rawS2: null },
  { key: 'k2', name: 'Chemistry Adv', rawS1: 95, rawS2: null },
  { key: 'k3', name: 'AP World History', rawS1: 98, rawS2: null },
]
const sept2026 = new Date(2026, 8, 15)
const r = splitTranscript(transcript, live, sept2026)

check('start-of-year: latest 9th-grade group is NOT treated as current', r.currentGroup === null)
check('start-of-year: 9th-grade year stays in prior (counted)', r.priorGroups.some((g) => g.grade === '09'))
check('start-of-year: all three prior years present', r.priorGroups.length === 3)
check('start-of-year: current classes labeled grade 10 (not 09)', r.currentGrade === '10')

// Mid-year: once the current year IS transcripted, its label matches today's
// school year → it's correctly the current group.
const transcript2 = [
  ...transcript,
  { year: '2026-2027', grade: '10', courses: [{ courseCode: 'X', description: 'ENG 2', sem1: '95' }] },
]
const jan2027 = new Date(2027, 0, 15) // still the 2026-2027 school year
const r2 = splitTranscript(transcript2, live, jan2027)
check('mid-year: current-year group IS treated as current', r2.currentGroup?.year === '2026-2027')
check('mid-year: current grade level comes from that group (10)', r2.currentGrade === '10')
check('mid-year: prior groups exclude the current year', !r2.priorGroups.some((g) => g.year === '2026-2027'))

if (failed) { console.error(`\n${failed} check(s) failed.`); process.exit(1) }
console.log('\nAll splitTranscript checks passed.')
