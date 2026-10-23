// Career Plan → GPA engine (src/lib/careerPlan.js + gpaCompute.js).
//
// The Pi scrapes HAC's Classes > Career Plan as `careerplan`. The client reads it
// for the level of every past course (the transcript drops "Adv"), for credit-
// by-exam rows (EA prefix — left out of the GPA unless "Count EA" is on) and for
// summer rows (CR prefix — parsed, counted like any course, no longer shown). Future-year columns are the
// student's own requests and must be ignored.
//
// The fixture mirrors a real 10th grader's Career Plan + transcript structure
// (course names, codes, years) with made-up grades. Checked against HAC's own
// cumulative GPA on 2026-10-23: EA rows out, athletics in, "TACS1" at the Adv
// level reproduced HAC's number to the rounding digit.
//
// Run: node scripts/test-careerplan.mjs
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
const { parsePlanName, indexCareerPlan, matchPlanCourse, matchPlanCourses, planCourseForLive, planFacts, planYearFor } = await import('../src/lib/careerPlan.js')
const { buildCumRows, buildPriorCourses, transcriptPlanFacts } = await import('../src/lib/gpaCompute.js')
const { yearBuilding } = await import('../src/lib/courses.js')
const { levelSubject } = await import('../src/lib/levels.js')

let failed = 0
const check = (name, cond) => {
  if (cond) console.log(`ok    ${name}`)
  else { failed++; console.error(`FAIL  ${name}`) }
}

// ---- name parsing ----
let p = parsePlanName('EA Algebra 2 S1')
check('EA prefix → ea, base "Algebra 2", S1', p.ea && !p.cr && p.base === 'Algebra 2' && p.sem === 'S1')
p = parsePlanName('CR AP Comp Sci A-Math S2')
check('CR prefix → cr, base keeps AP', p.cr && !p.ea && p.base === 'AP Comp Sci A-Math' && p.sem === 'S2')
p = parsePlanName('Geometry Adv HS S1 Online')
check('embedded S1 + Online stripped', p.base === 'Geometry Adv HS' && p.sem === 'S1' && p.online)
p = parsePlanName('OC Health')
check('OC prefix recorded, no sem', p.oc && p.base === 'Health' && p.sem === null)
p = parsePlanName('AP English Language YR@VL')
check('plain name untouched', !p.ea && !p.cr && p.base === 'AP English Language YR@VL')
p = parsePlanName(' Tennis\tJV EQ1 S1 ')
check('stray tabs/spaces collapsed', p.base === 'Tennis JV EQ1' && p.sem === 'S1')

// ---- subject keys line up across the three sources ----
check('subject: "Algebra 1 Adv HS" = "Algebra I"', levelSubject('Algebra 1 Adv HS') === levelSubject('Algebra I'))
check('subject: "Geometry Adv HS S1 Online" = "Geometry"', levelSubject('Geometry Adv HS S1 Online') === levelSubject('Geometry'))
check('subject: "EA Biology" = "Biology"', levelSubject('EA Biology') === levelSubject('Biology'))
check('subject: "Computer Science 1 Adv" = "Computer Science I"', levelSubject('Computer Science 1 Adv') === levelSubject('Computer Science I'))

// ---- a Career Plan doc in the Pi's shape (real structure, 2026-10-23: a 10th grader) ----
const row = (year, grade, name, code, section, credit, complete) => ({ year, grade, name, code, section, credit, complete, raw: `${name} (${code}${section ? ` - ${section}` : ''})` })
const doc = {
  plan: 'Foundation Plan with Endorsements',
  years: [
    { grade: '08', year: '2024-2025', label: 'Grade 08 (2024 - 2025)' },
    { grade: '09', year: '2025-2026', label: 'Grade 09 (2025 - 2026)' },
    { grade: '10', year: '2026-2027', label: 'Grade 10 (2026 - 2027)' },
    { grade: '11', year: '2027-2028', label: 'Grade 11 (2027 - 2028)' },
    { grade: '12', year: '2028-2029', label: 'Grade 12 (2028 - 2029)' },
  ],
  subjects: [
    { name: '01. Language Arts', creditNeeded: 4, estCredit: 4, courses: [
      row('2025-2026', '09', 'GT HumanitiesI/Eng 1 Adv S1', 'ELA11500A', '2', 0.5, true),
      row('2025-2026', '09', 'GT HumanitiesI/Eng 1 Adv S2', 'ELA11500B', '2', 0.5, true),
      row('2026-2027', '10', 'English 2 Adv S1', 'ELA12200A', '2', 0.5, false),
      row('2026-2027', '10', 'English 2 Adv S2', 'ELA12200B', '2', 0.5, false),
      row('2027-2028', '11', 'AP English Language YR@VL', 'VELA13300Y', '', 1, false),
    ] },
    { name: '02. Mathematics', creditNeeded: 4, estCredit: 8, courses: [
      row('2024-2025', '08', 'EA Algebra 2 S1', 'EAMT200A', '91', 0.5, true),
      row('2024-2025', '08', 'EA Algebra 2 S2', 'EAMT200B', '92', 0.5, true),
      row('2024-2025', '08', 'Algebra 1 Adv HS S1', 'MTH11100AM', '6', 0.5, true),   // taken in 7th grade; HAC files it here
      row('2024-2025', '08', 'Algebra 1 Adv HS S2', 'MTH11100BM', '6', 0.5, true),
      row('2024-2025', '08', 'Geometry Adv HS S1 Online', 'MTH23300AM', '1', 0.5, true),
      row('2024-2025', '08', 'Geometry Adv HS S2 Online', 'MTH23300BM', '1', 0.5, true),
      row('2025-2026', '09', 'CR AP Comp Sci A-Math S1', 'CRMT420A', '91', 0.5, true),
      row('2025-2026', '09', 'CR AP Comp Sci A-Math S2', 'CRMT420B', '92', 0.5, true),
      row('2025-2026', '09', 'AP Pre Calculus S1', 'MTH34300A', '5', 0.5, true),
      row('2025-2026', '09', 'AP Pre Calculus S2', 'MTH34300B', '5', 0.5, true),
      row('2026-2027', '10', 'AP Calculus AB S1', 'MTH45300A', '3', 0.5, false),
      row('2027-2028', '11', 'AP Calculus BC YR', 'MTH45305Y', '', 1, false),
    ] },
    { name: '03. Science', creditNeeded: 4, estCredit: 7, courses: [
      row('2024-2025', '08', 'EA Biology S1', 'EASC110A', '91', 0.5, true),
      row('2024-2025', '08', 'EA Biology S2', 'EASC110B', '92', 0.5, true),
      row('2025-2026', '09', 'Chemistry Adv S1', 'SCI22200A', '1', 0.5, true),
      row('2025-2026', '09', 'Chemistry Adv S2', 'SCI22200B', '1', 0.5, true),
      row('2026-2027', '10', 'AP Biology S1', 'SCI13300A', '2', 0.5, false),
    ] },
    { name: '04. Social Studies', creditNeeded: 4, estCredit: 4, courses: [
      row('2025-2026', '09', 'AP Human Geography S1', 'SST11500A', '7', 0.5, true),
      row('2025-2026', '09', 'AP Human Geography S2', 'SST11500B', '7', 0.5, true),
    ] },
    { name: '07. Health', creditNeeded: 0.5, estCredit: 0.5, courses: [
      row('2024-2025', '08', 'OC Health', 'ZOHL110', '4', 0.5, true),
    ] },
    { name: '08. Technology Applications', creditNeeded: 1, estCredit: 5, courses: [
      row('2025-2026', '09', 'CR AP Comp Sci A-LOTE S1', 'CRWL490A', '91', 0.5, true),   // the same summer course, listed again
      row('2025-2026', '09', 'CR AP Comp Sci A-LOTE S2', 'CRWL490B', '92', 0.5, true),
      row('2025-2026', '09', 'Computer Science I', 'T03580200', '13', 1, true),           // HAC's echo of the transcript record (state name, no level)
      row('2025-2026', '09', 'Computer Science 1 Adv S1', 'TEC21200A', '2', 0.5, true),  // the scheduled course — knows the level
      row('2025-2026', '09', 'Computer Science 1 Adv S2', 'TEC21200B', '2', 0.5, true),
      row('2027-2028', '11', 'AP Computer Science Prin YR', 'TEC21250Y', '', 1, false),
    ] },
    { name: '09. World Languages', creditNeeded: 2, estCredit: 7, courses: [
      row('2024-2025', '08', 'EA Other Foreign Lang 1 S1', 'EAWL199A', '91', 0.5, true),
      row('2024-2025', '08', 'EA Other Foreign Lang 1 S2', 'EAWL199B', '92', 0.5, true),
      row('2024-2025', '08', 'Spanish 1 HS S1', 'FLG21100AM', '6', 0.5, true),
      row('2024-2025', '08', 'Spanish 1 HS S2', 'FLG21100BM', '6', 0.5, true),
      row('2025-2026', '09', 'Spanish 2 S1', 'FLG22100A', '2', 0.5, true),
      row('2025-2026', '09', 'Spanish 2 S2', 'FLG22100B', '2', 0.5, true),
      row('2026-2027', '10', 'Spanish 3 Adv S1', 'FLG23200A', '1', 0.5, false),
    ] },
    { name: '10. Physical Education/Equivalent/Athletics', creditNeeded: 1, estCredit: 1, courses: [
      row('2025-2026', '09', 'Tennis JV EQ1 S1', 'SUBA1911A', '1', 0.5, true),
      row('2025-2026', '09', 'Tennis JV EQ1 S2', 'SUBA1911B', '1', 0.5, true),
    ] },
  ],
}
const today = new Date(2026, 9, 23) // Oct 2026 → school year 2026-2027
const idx = indexCareerPlan(doc, today)

check('index built', idx.ok && idx.plan === 'Foundation Plan with Endorsements')
check('future years dropped (requests)', !idx.byYear.has('2027-2028') && !idx.byYear.has('2028-2029'))
check('current + past years kept', idx.trustedYears.join(',') === '2024-2025,2025-2026,2026-2027')
const alg2 = idx.byYear.get('2024-2025').find((g) => g.name === 'Algebra 2')
check('EA Algebra 2 merged S1+S2 → 1 credit, ea', alg2 && alg2.ea && !alg2.cr && alg2.credit === 1 && alg2.sems.length === 2)
const csa = idx.byYear.get('2025-2026').find((g) => g.name === 'AP Comp Sci A-Math')
check('CR AP Comp Sci A → cr, weight 6', csa && csa.cr && !csa.ea && csa.weight === 6)
const chem = idx.byYear.get('2025-2026').find((g) => g.name === 'Chemistry Adv')
check('Chemistry Adv → 5.5', chem && chem.weight === 5.5 && !chem.ea && !chem.cr)
const cs1 = idx.byYear.get('2025-2026').find((g) => g.name === 'Computer Science I')
check('Computer Science I (state name) → 5.0', cs1 && cs1.weight === 5)
check('Computer Science 1 Adv → 5.5', idx.byYear.get('2025-2026').find((g) => g.name === 'Computer Science 1 Adv')?.weight === 5.5)
check('levels map keyed like levels.js', idx.levels[`2025-2026|${levelSubject('Chemistry')}`] === 5.5 && idx.levels[`2024-2025|${levelSubject('Geometry')}`] === 5.5)
check('empty / missing doc is harmless', !indexCareerPlan(null).ok && !indexCareerPlan({}).ok && indexCareerPlan(undefined).byYear.size === 0)

// ---- which plan column a transcript year reads ----
check('planYearFor: a plan year maps to itself', planYearFor(idx, '2025-2026') === '2025-2026')
check('planYearFor: a year BEFORE the plan starts reads the first column', planYearFor(idx, '2023-2024') === '2024-2025')
check('planYearFor: a year after the trusted ones → null', planYearFor(idx, '2029-2030') === null)

// ---- transcript rows (terse abbreviations) find their plan row ----
const m = (year, desc) => matchPlanCourse(idx, year, desc)
check('"ALG 2" (2024-2025) → EA Algebra 2', m('2024-2025', 'ALG 2')?.name === 'Algebra 2')
check('"BIO" (2024-2025) → EA Biology', m('2024-2025', 'BIO')?.ea === true)
check('"ALG 1" taken in 2023-2024 → Algebra 1 Adv HS from the first column', m('2023-2024', 'ALG 1')?.name === 'Algebra 1 Adv HS')
check('"GEOM" (2024-2025) → Geometry Adv HS', m('2024-2025', 'GEOM')?.name === 'Geometry Adv HS')
check('"HLTHED1" (2024-2025) → OC Health', m('2024-2025', 'HLTHED1')?.name === 'Health')
check('"SPAN 1" (2024-2025) → Spanish 1 HS', m('2024-2025', 'SPAN 1')?.name === 'Spanish 1 HS')
check('"OTHR FL1" (2024-2025) → EA Other Foreign Lang 1', m('2024-2025', 'OTHR FL1')?.ea === true)
check('"CHEM" (2025-2026) → Chemistry Adv', m('2025-2026', 'CHEM')?.weight === 5.5)
check('"ENG 1" (2025-2026) → GT Humanities / Eng 1 Adv', m('2025-2026', 'ENG 1')?.name === 'GT HumanitiesI/Eng 1 Adv')
check('"APCSA" (2025-2026) → a CR AP Comp Sci A row', m('2025-2026', 'APCSA')?.cr === true)
check('"APPRECAL" (2025-2026) → AP Pre Calculus', m('2025-2026', 'APPRECAL')?.name === 'AP Pre Calculus')
check('"APHUMGEOW" (2025-2026) → AP Human Geography', m('2025-2026', 'APHUMGEOW')?.name === 'AP Human Geography')
check('"TACS1" (2025-2026) → Computer Science 1 Adv (scheduled row beats the PEIMS echo)', m('2025-2026', 'TACS1')?.name === 'Computer Science 1 Adv')
check('"SPAN 2" (2025-2026) → Spanish 2', m('2025-2026', 'SPAN 2')?.name === 'Spanish 2')
check('"SUBATH1" (2025-2026) → Tennis JV EQ1 (PE/athletics by subject area)', m('2025-2026', 'SUBATH1')?.name === 'Tennis JV EQ1')
check('"BIO" in a year with no Biology → null', m('2025-2026', 'BIO') === null)
check('"PHYS" with no match → null (no false positive)', m('2025-2026', 'PHYS') === null)
check('year after the plan → null', m('2029-2030', 'BIO') === null)

// Each plan row is used once (two APCSA rows: Math + LOTE credit).
const used = new Set()
const a = matchPlanCourse(idx, '2025-2026', 'APCSA', used)
const b = matchPlanCourse(idx, '2025-2026', 'APCSA', used)
check('a second APCSA transcript row takes the other CR row', a && b && a !== b && a.cr && b.cr)

// Whole-transcript matching is best fit first: a row that only resembles a
// course can't take it from the row that IS that course, whatever the order.
const mm = matchPlanCourses(idx, [
  { key: 'x', year: '2025-2026', description: 'COMPUTER SCIENCE' },   // vague: fits both CS rows a bit
  { key: 'y', year: '2025-2026', description: 'TACS1' },      // exact
])
check('best fit first: "TACS1" gets Computer Science 1 Adv even listed second', mm.get('y')?.name === 'Computer Science 1 Adv')
check('best fit first: the vague row gets the other CS row, not nothing', mm.get('x')?.name === 'Computer Science I')

// An explicit AP transcript abbreviation can never be demoted by a fuzzy match.
check('planFacts keeps AP for "APCSA"', planFacts(idx, '2025-2026', 'APCSA').weight === 6)
check('planFacts: EA row flagged, weight from the plan', planFacts(idx, '2024-2025', 'BIO').ea && planFacts(idx, '2024-2025', 'BIO').weight === 5)
check('planFacts: no match → nulls', planFacts(idx, '2025-2026', 'PHYS').weight === null && !planFacts(idx, '2025-2026', 'PHYS').ea)

// ---- current-year live classes match by course code ----
check('live "ELA12200A - 2 English 2 Adv S1" → plan row', planCourseForLive(idx, 'ELA12200A - 2 English 2 Adv S1')?.name === 'English 2 Adv')
check('live unknown code → null', planCourseForLive(idx, 'XYZ99999A - 1 Nothing S1') === null)

// ---- the cumulative rows: EA out by default, CR in, weights from the plan ----
// Real transcript structure (codes are "PEIMS - section"), made-up grades. The
// summer AP CSA is NOT on the transcript — that is the suggestion case below.
const transcript = [
  { year: '2023-2024', grade: '07', courses: [
    { courseCode: '03100500 - 1', description: 'ALG 1', sem1: '99', sem2: '98', credit: '1.0' },
  ] },
  { year: '2024-2025', grade: '08', courses: [
    { courseCode: '03810100 - 1', description: 'HLTHED1', sem1: '100', credit: '0.5' },
    { courseCode: '03440100 - 1', description: 'SPAN 1', sem1: '96', sem2: '97', credit: '1.0' },
    { courseCode: '03100700 - 1', description: 'GEOM', sem1: '97', sem2: '99', credit: '1.0' },
    { courseCode: '03100600 - 1', description: 'ALG 2', sem1: '98', sem2: '97', credit: '1.0' },   // EA
    { courseCode: '03993200 - 1', description: 'OTHR FL1', sem1: '90', sem2: '90', credit: '1.0' }, // EA (and never GPA)
    { courseCode: '03010200 - 1', description: 'BIO', sem1: '95', sem2: '96', credit: '1.0' },     // EA
  ] },
  { year: '2025-2026', grade: '09', courses: [
    { courseCode: 'A3360100 - 1', description: 'APHUMGEOW', sem1: '97', sem2: '98', credit: '1.0' },
    { courseCode: 'PES00000 - 1', description: 'SUBATH1', sem1: '100', sem2: '100', credit: '1.0' },
    { courseCode: '03580200 - 1', description: 'TACS1', sem1: '98', sem2: '99', credit: '1.0' },
    { courseCode: '03440200 - 1', description: 'SPAN 2', sem1: '95', sem2: '96', credit: '1.0' },
    { courseCode: '03040000 - 1', description: 'CHEM', sem1: '94', sem2: '96', credit: '1.0' },
    { courseCode: '03220100 - 1', description: 'ENG 1', sem1: '93', sem2: '95', credit: '1.0' },
    { courseCode: 'A3100100 - 1', description: 'APPRECAL', sem1: '96', sem2: '97', credit: '1.0' },
  ] },
]
const prior = buildPriorCourses(transcript)
const K = Object.fromEntries(prior.map((c) => [c.description, c.code])) // description -> row key
const included = Object.fromEntries(prior.filter((c) => c.description !== 'OTHR FL1').map((c) => [c.code, true]))
const prefsOff = { cumulative: { included, weights: {}, credits: {}, grades: {}, quarters: {}, manual: [], countEa: false } }
const prefsOn = { cumulative: { ...prefsOff.cumulative, countEa: true } }
const args = { currentLive: [], priorCourses: prior, included, period: 'year', latestYear: '2025-2026', levels: {} }

const facts = transcriptPlanFacts(idx, prior)
check('facts keyed by transcript row key', facts[K['ALG 2']]?.ea && facts[K['CHEM']]?.weight === 5.5 && facts[K['ALG 1']]?.match?.name === 'Algebra 1 Adv HS')
check('facts: every real row but none spurious', prior.every((c) => facts[c.code]?.match) )

const rowsOff = buildCumRows({ ...args, prefs: prefsOff, plan: idx })
const keysOff = new Set(rowsOff.map((r) => r.baseKey))
check('EA rows left out by default (ALG 2, BIO)', !keysOff.has(K['ALG 2']) && !keysOff.has(K['BIO']))
check('everything else counted', ['ALG 1', 'HLTHED1', 'SPAN 1', 'GEOM', 'APHUMGEOW', 'SUBATH1', 'TACS1', 'SPAN 2', 'CHEM', 'ENG 1', 'APPRECAL'].every((d) => keysOff.has(K[d])))
const w = (rows, k) => rows.find((r) => r.baseKey === k)?.weight
check('CHEM weighted 5.5 from "Chemistry Adv"', w(rowsOff, K['CHEM']) === 5.5)
check('TACS1 weighted 5.5 from "Computer Science 1 Adv"', w(rowsOff, K['TACS1']) === 5.5)
check('ALG 1 (7th grade) weighted 5.5 from "Algebra 1 Adv HS"', w(rowsOff, K['ALG 1']) === 5.5)
check('SPAN 1 / SPAN 2 weighted 5.0 (on-level names)', w(rowsOff, K['SPAN 1']) === 5 && w(rowsOff, K['SPAN 2']) === 5)
check('SUBATH1 weighted 5.0 and counted', w(rowsOff, K['SUBATH1']) === 5)
check('APPRECAL stays 6.0', w(rowsOff, K['APPRECAL']) === 6)
check('HLTHED1 weighted 5.0, one semester', w(rowsOff, K['HLTHED1']) === 5 && rowsOff.filter((r) => r.baseKey === K['HLTHED1']).length === 1)

const rowsOn = buildCumRows({ ...args, prefs: prefsOn, plan: idx })
const keysOn = new Set(rowsOn.map((r) => r.baseKey))
check('"Count EA" on → EA rows counted', keysOn.has(K['ALG 2']) && keysOn.has(K['BIO']))
check('EA Algebra 2 counts at the plan level (5.0) when on', w(rowsOn, K['ALG 2']) === 5)

// A manual weight override still wins over the plan.
const prefsOv = { cumulative: { ...prefsOff.cumulative, weights: { [K['CHEM']]: 5 } } }
check('manual weight override beats the plan', w(buildCumRows({ ...args, prefs: prefsOv, plan: idx }), K['CHEM']) === 5)

// Without a plan nothing changes (old behaviour: guesses).
const rowsNone = buildCumRows({ ...args, prefs: prefsOff, plan: null })
check('no plan → EA rows not detectable, so counted as before', rowsNone.some((r) => r.baseKey === K['ALG 2']))
check('no plan → ALG 2 keeps the old 5.5 guess', w(rowsNone, K['ALG 2']) === 5.5)

// ---- HAC's per-year "Summer School" building label is not shown ----
check('yearBuilding hides "Summer School - High School"', yearBuilding('Summer School - High School') === null)
check('yearBuilding keeps a real school', yearBuilding('Lone Star High School') === 'Lone Star High School')

if (failed) { console.error(`\n${failed} failed`); process.exit(1) }
console.log('\nall career plan checks passed')
