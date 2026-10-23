// Course Plan page logic (src/lib/planner.js + src/lib/plan.js): course naming,
// semester merging, HAC <-> catalog code matching, the "to enter in HAC" diff
// and the draft pruning that clears an entry once HAC shows it.
//
// Run: node scripts/test-planner.mjs
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.window = globalThis.window || { dispatchEvent() {}, addEventListener() {} }
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(t, o) { this.type = t; this.detail = o?.detail } }

const P = await import('../src/lib/planner.js')
const D = await import('../src/lib/plan.js')

let failed = 0
const check = (name, cond) => {
  if (cond) console.log(`ok    ${name}`)
  else { failed++; console.error(`FAIL  ${name}`) }
}

// ---- names ----
check('CR prefix + S1 stripped', P.displayCourseName('CR AP Comp Sci A-Math S1') === 'AP Comp Sci A-Math')
check('YR@VL stripped', P.displayCourseName('AP English Language YR@VL') === 'AP English Language')
check('Online after S1 stripped', P.displayCourseName('Geometry Adv HS S1 Online') === 'Geometry Adv HS')
check('EA tag', P.courseTags('EA Algebra 2 S1').includes('Credit by exam'))
check('virtual tag', P.courseTags('AP English Language YR@VL').includes('Virtual'))
check('EA gets no weight', P.courseWeight('EA Algebra 2 S1', 'MTH21100A') === null)
check('AP weight tag', P.weightTag(P.courseWeight('AP Calculus BC YR', 'MTH45305Y')) === 'AP')

// ---- semesters ----
const merged = P.mergeSemesters([
  { year: '2025-2026', name: 'Chemistry Adv S1', code: 'SCI23200A', credit: 0.5, complete: true },
  { year: '2025-2026', name: 'Chemistry Adv S2', code: 'SCI23200B', credit: 0.5, complete: false },
  { year: '2026-2027', name: 'Chemistry Adv S1', code: 'SCI23200A', credit: 0.5, complete: false },
])
check('S1+S2 merge within a year only', merged.length === 2)
check('merged credit sums', merged[0].credit === 1 && merged[0].codes.length === 2)
check('merged complete only when both halves are', merged[0].complete === false)
check('online S1+S2 halves merge', P.mergeSemesters([
  { year: '2024-2025', name: 'Geometry Adv HS S1 Online', code: 'MTH12200A', credit: 0.5, complete: true },
  { year: '2024-2025', name: 'Geometry Adv HS S2 Online', code: 'MTH12200B', credit: 0.5, complete: true },
]).length === 1)

// ---- subjects ----
check('subjectKey numbered', P.subjectKey('01. Language Arts (FLA)') === '01')
check('subjectKey unnumbered uses code', P.subjectKey({ name: 'Math for Endorsements (FMATH)', code: 'FMATH' }) === 'FMATH')
check('subjectTitle', P.subjectTitle('10. Physical Education/Equivalent/Athletics (PE)') === 'Physical Education/Equivalent/Athletics')

// ---- codes ----
check('year suffix ignored', P.hasCourse(['MTH45305Y'], 'MTH45305'))
check('virtual V prefix ignored', P.hasCourse(['VELA13300Y'], 'ELA13300Y'))
check('different course does not match', !P.hasCourse(['MTH45305Y'], 'MTH45300Y'))

// ---- catalog ----
const all = P.catalogCourses()
check('catalog loaded', all.length > 400)
check('catalog rows have credit + grades', all.every((c) => typeof c.credit === 'number' && Array.isArray(c.grades) && c.grades.length))
check('no middle-school-only courses', all.every((c) => c.grades.some((g) => g >= 9)))
const calc = P.searchCatalog('calculus bc', { subject: '02' })
check('search finds AP Calculus BC in Math', calc.some((c) => c.code === 'MTH45305Y'))
const csp = P.searchCatalog('computer science principles', { subject: '08' })
check('AP CS Principles files under Technology Applications', csp.some((c) => c.code === 'TEC21250Y'))
const g9 = P.searchCatalog('', { subject: '01', grade: 9, limit: 999 })
const firstLate = g9.findIndex((c) => !c.grades.includes(9))
check('grade-eligible courses sort first', firstLate === -1 || g9.slice(firstLate).every((c) => !c.grades.includes(9)))
check('gradesLabel run', P.gradesLabel([10, 11, 12]) === 'Grades 10–12' && P.gradesLabel([12]) === 'Grade 12')

// ---- draft + HAC diff ----
const Y = '2027-2028'
const requests = {
  year: Y, grade: '11',
  subjects: [
    { name: '02. Mathematics (MATH)', code: 'MATH', courses: [{ code: 'MTH45305Y', name: 'AP Calculus BC YR', credit: 1 }] },
    { name: '03. Science (SCI)', code: 'SCI', courses: [] },
  ],
}
let plan = D.loadPlan('tester')
plan = D.addCourse(plan, Y, { code: 'SCI35500Y', name: 'AP Physics C', credit: 1, subject: '03', subjectName: '03. Science (SCI)' })
plan = D.dropCourse(plan, Y, { code: 'MTH45305Y', name: 'AP Calculus BC YR', credit: 1, subject: '02', subjectName: '02. Mathematics (MATH)' })
let todo = P.hacTodo(requests, D.plannedFor(plan, Y))
check('todo has the add and the drop', todo.length === 2
  && todo.find((t) => t.subject === '03').adds[0].code === 'SCI35500Y'
  && todo.find((t) => t.subject === '02').drops[0].code === 'MTH45305Y')
const codesNow = ['SCI35500Y', 'MTH45305Y'] // HAC took the add, the drop is not done yet
const pruned = D.pruneSatisfied(plan, Y, (c) => P.hasCourse(codesNow, c))
check('prune clears the add HAC now shows, keeps the pending drop',
  D.plannedFor(pruned, Y).length === 1 && D.plannedFor(pruned, Y)[0].kind === 'drop')
check('prune returns the same object when nothing changes', D.pruneSatisfied(pruned, Y, (c) => P.hasCourse(codesNow, c)) === pruned)
D.savePlan('tester', pruned)
check('draft round-trips through storage', D.plannedFor(D.loadPlan('tester'), Y).length === 1)
check('drafts are per account', D.plannedFor(D.loadPlan('someone-else'), Y).length === 0)

if (failed) { console.error(`\n${failed} failed`); process.exit(1) }
console.log('\nall planner checks passed')
