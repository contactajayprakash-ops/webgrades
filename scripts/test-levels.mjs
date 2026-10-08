// Course-level memory (src/lib/levels.js) + live-name weights.
//
// Current-year HAC names carry the level ("Biology Adv" vs "Biology"), so they
// are trusted as-is. The transcript drops it ("BIO"), so it guesses Adv unless
// a level was remembered from that year's live class names.
//
// Run: node scripts/test-levels.mjs
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
const { liveWeight, detectWeight } = await import('../src/lib/gpa.js')
const { levelSubject, rememberLevels, loadLevels, transcriptWeight, mergeLevelsJson } = await import('../src/lib/levels.js')

let failed = 0
const check = (name, cond) => {
  if (cond) console.log(`ok    ${name}`)
  else { failed++; console.error(`FAIL  ${name}`) }
}

// Live names: trust them.
check('live "Biology" is on-level', liveWeight('SCI11100A - 3 Biology S1') === 5)
check('live "Biology Adv" is 5.5', liveWeight('SCI11200A - 1 Biology Adv S1') === 5.5)
check('live "Algebra 1" is on-level', liveWeight('Algebra 1') === 5)
check('live "Geometry Adv" is 5.5', liveWeight('Geometry Adv') === 5.5)
check('live "AP Human Geography" is 6', liveWeight('AP Human Geography') === 6)
check('live "GT HumanitiesI/Eng 1 Adv" is 5.5', liveWeight('ELA11500A - 2 GT HumanitiesI/Eng 1 Adv S1') === 5.5)
// Transcript guesses unchanged.
check('transcript "BIO" still guesses 5.5', detectWeight('BIO') === 5.5)
check('transcript "ALG1" still guesses 5.5', detectWeight('ALG1') === 5.5)

// Subject keys line up between live names and transcript abbreviations.
check('subject Biology', levelSubject('Biology Adv') === 'BIOLOGY')
check('subject English 1', levelSubject('English 1 Adv') === levelSubject('English I'))
check('subject Algebra 1', levelSubject('Algebra 1') === levelSubject('Algebra I'))

// Varsha-style year: on-level Biology + Algebra 1, Adv English 1.
rememberLevels('u1', ['SCI11100A - 3 Biology S1', 'Algebra 1', 'English 1 Adv', 'AP Human Geography'], '2026-2027')
const lv = loadLevels('u1')
check('BIO in 2026-2027 uses remembered on-level', transcriptWeight('BIO', 'X', '2026-2027', lv) === 5)
check('ALG1 in 2026-2027 uses remembered on-level', transcriptWeight('ALG1', 'X', '2026-2027', lv) === 5)
check('ENG 1 in 2026-2027 uses remembered Adv', transcriptWeight('ENG 1', 'X', '2026-2027', lv) === 5.5)
check('APHUMGEOW stays 6', transcriptWeight('APHUMGEOW', 'X', '2026-2027', lv) === 6)
check('BIO in another year falls back to the guess', transcriptWeight('BIO', 'X', '2025-2026', lv) === 5.5)
check('no memory falls back to the guess', transcriptWeight('CHEM', 'X', '2026-2027', {}) === 5.5)

// Cloud merge never drops local entries.
const merged = JSON.parse(mergeLevelsJson('{"a":5}', '{"b":5.5,"a":6}'))
check('merge keeps local + adds cloud', merged.a === 5 && merged.b === 5.5)

if (failed) { console.error(`\n${failed} failed`); process.exit(1) }
console.log('\nall level checks passed')
