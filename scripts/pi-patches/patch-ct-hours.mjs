// patch-ct-hours.mjs — the pollers' 6am–11pm Central window: DST-aware
// America/Chicago hour instead of a fixed UTC-5 offset (an hour off under CST),
// and the boot-time baseline snapshot pass respects the window too. Applies to
// the server as left by patch-session-quarter.mjs (md5 c2a420bad20dc38dbaee233e0740b0c8);
// result md5 14fa4f01076782453ac965f8e7ea6ba0.
// Exact-string replace of server.mjs -> server.mjs.new; every anchor must appear exactly once.
import fs from 'node:fs'
const src = fs.readFileSync('server.mjs', 'utf8')
const pairs = [
 [
  "// Poll each subscriber's CURRENT grades, diff against lastSeen, push the new ones.\nconst POLL_INTERVAL_MS = Number(process.env.PUSH_POLL_MS || 15 * 60 * 1000); // 15 min\nlet polling = false;\nconst inActiveHours = () => {\n  // Poll waking hours EVERY day — teachers post grades in the evening and on\n  // weekends too, so a Mon–Fri 9-to-5 gate misses most real drops. Coarse\n  // Central-Time gate (offset assumes CDT; close enough for a window this wide).\n  const ct = new Date(Date.now() - 5 * 60 * 60 * 1000);\n  const hr = ct.getUTCHours();\n  return hr >= 6 && hr < 23; // 6am–11pm CT, all 7 days\n};\n",
  "// Poll each subscriber's CURRENT grades, diff against lastSeen, push the new ones.\nconst POLL_INTERVAL_MS = Number(process.env.PUSH_POLL_MS || 15 * 60 * 1000); // 15 min\nlet polling = false;\n// The hour in Central Time right now (0–23), DST-aware. The Pi's own clock is\n// not on Central Time, so never use getHours(); and a fixed UTC offset was an\n// hour off for the CST half of the year.\nconst ctHour = () =>\n  Number(new Intl.DateTimeFormat(\"en-US\", { timeZone: \"America/Chicago\", hour: \"numeric\", hour12: false })\n    .format(new Date()).replace(/^24$/, \"0\"));\nconst inActiveHours = () => {\n  // Poll waking hours EVERY day — teachers post grades in the evening and on\n  // weekends too, so a Mon–Fri 9-to-5 gate misses most real drops.\n  const hr = ctHour();\n  return hr >= 6 && hr < 23; // 6am–11pm CT, all 7 days\n};\n"
 ],
 [
  "\nif (SNAPSHOT_ENABLED) {\n  setInterval(() => { if (inActiveHours()) snapshotPollOnce(); }, SNAP_POLL_MS);\n  setTimeout(() => snapshotPollOnce(), 12000); // baseline shortly after boot\n  console.log(`[${ctTime()}] Snapshot poller: cycle ${Math.round(SNAP_POLL_MS / 60000)}m, concurrency ${SNAP_CONCURRENCY}, full≈daily, 6am–11pm CT`);\n}\n\n",
  "\nif (SNAPSHOT_ENABLED) {\n  setInterval(() => { if (inActiveHours()) snapshotPollOnce(); }, SNAP_POLL_MS);\n  setTimeout(() => { if (inActiveHours()) snapshotPollOnce(); }, 12000); // baseline shortly after boot (not at night)\n  console.log(`[${ctTime()}] Snapshot poller: cycle ${Math.round(SNAP_POLL_MS / 60000)}m, concurrency ${SNAP_CONCURRENCY}, full≈daily, 6am–11pm CT`);\n}\n\n"
 ]
]
let out = src
for (const [a, b] of pairs) {
  const n = out.split(a).length - 1
  if (n !== 1) { console.error(`anchor found ${n} times: ${a.slice(0, 80)}`); process.exit(1) }
  out = out.replace(a, () => b)
}
fs.writeFileSync('server.mjs.new', out)
console.log(`ok — ${pairs.length} replacements written to server.mjs.new`)
