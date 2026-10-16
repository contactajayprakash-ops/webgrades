// Boot-preflight parity check.
//
// index.html starts the first live /batch (the current quarter) from an inline
// <script> before the bundle exists, and src/api/hac.js adopts that request only
// when its quarter matches the one the app itself asks for. The inline snippet
// therefore carries its own copy of guessCurrentQuarter (src/lib/courses.js). If
// the two ever disagree, nothing breaks — the app just ignores the preflight and
// makes its own request — but the speedup silently vanishes. This test runs the
// inline expression, lifted verbatim from index.html, against the real function
// for every month. Run: `node scripts/test-boot-parity.mjs`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { guessCurrentQuarter } from '../src/lib/courses.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')

const m = html.match(/var m = new Date\(\)\.getMonth\(\);\s*var q = (.+?);/)
if (!m) {
  console.error('FAIL  could not find the inline quarter expression in index.html')
  process.exit(1)
}
// eslint-disable-next-line no-new-func
const inlineQuarter = new Function('m', `return ${m[1]}`)

let failed = 0
for (let month = 0; month < 12; month++) {
  const want = guessCurrentQuarter(new Date(2026, month, 15))
  const got = inlineQuarter(month)
  if (want !== got) {
    failed++
    console.error(`FAIL  month=${month} app=${want} inline=${got}`)
  }
}

// The inline request must be the hot wave the app sends: one `class` request for
// that quarter, nothing else (hac.js refuses to adopt anything different).
if (!/requests: \[\{ type: 'class', quarter: q \}\]/.test(html)) {
  failed++
  console.error('FAIL  inline preflight no longer sends exactly [{ type: "class", quarter: q }]')
}

if (failed) {
  console.error(`\n${failed} check(s) failed — the boot preflight would be ignored by the app. Do not ship.`)
  process.exit(1)
}
console.log('ok    inline quarter guess matches guessCurrentQuarter for all 12 months; hot-wave shape intact')
