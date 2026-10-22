// Boot-preflight parity check.
//
// index.html starts the first live /batch (the current grades) from an inline
// <script> before the bundle exists, and src/api/hac.js adopts that request only
// when it is exactly the hot wave the app itself sends: one `class` request with
// no quarter (HAC's default view; the Pi reports which quarter that is). If the
// two ever disagree, nothing breaks — the app just ignores the preflight and
// makes its own request — but the speedup silently vanishes. This test checks
// the inline request, the app's hot wave and hac.js's adopt rule agree.
// Run: `node scripts/test-boot-parity.mjs`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
const html = read('index.html')
const auth = read('src/context/AuthContext.jsx')
const hac = read('src/api/hac.js')

let failed = 0
const check = (ok, msg) => { if (!ok) { failed++; console.error(`FAIL  ${msg}`) } }

check(/requests: \[\{ type: 'class' \}\]/.test(html),
  'inline preflight no longer sends exactly [{ type: "class" }]')
check(!/getMonth\(\)/.test(html.split('window.__wgBatch')[1]?.split('</script>')[0] || ''),
  'inline preflight guesses a quarter from the calendar again')
check(/const WAVE_HOT = \[\['class', \{\}\]\]/.test(auth),
  "AuthContext hot wave is no longer [['class', {}]]")
check(/r\.type !== 'class' \|\| Object\.keys\(r\)\.length !== 1/.test(hac),
  'hac.js takePreflight no longer adopts a single no-quarter class request')

if (failed) {
  console.error(`\n${failed} check(s) failed — the boot preflight would be ignored by the app. Do not ship.`)
  process.exit(1)
}
console.log('ok    inline preflight, app hot wave and hac.js adopt rule all use [{ type: "class" }]')
