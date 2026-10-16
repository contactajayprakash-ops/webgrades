// Per-BROWSER sync gate. On a dev/testing browser you can lock cloud sync to a
// single account, so test-account logins here never read or write the cloud.
// Stored in localStorage — which is unique to this browser instance and is NOT
// itself part of the settings sync — so the lock stays on this browser only and
// never follows you to other devices.
const LOCK_KEY = 'wg_sync_only' // username allowed to sync here; '' = all allowed

export function syncLock() {
  try { return localStorage.getItem(LOCK_KEY) || '' } catch (_) { return '' }
}

export function setSyncLock(username) {
  try {
    if (username) localStorage.setItem(LOCK_KEY, username)
    else localStorage.removeItem(LOCK_KEY)
  } catch (_) {}
}

// Is cloud sync allowed for this account on this browser?
export function syncAllowedFor(username) {
  const lock = syncLock()
  return !lock || lock === username
}

// Per-BROWSER toggle for keeping OTHER signed-in profiles warm in the background.
// Default ON; a dev/shared machine can turn it off so it doesn't quietly
// re-scrape every account's grades on a timer. Browser-local like the lock above,
// so it never follows you to another device.
const BG_PROFILES_KEY = 'wg_bg_profiles' // 'off' disables; absent = on (default)

export function bgProfilesEnabled() {
  try { return localStorage.getItem(BG_PROFILES_KEY) !== 'off' } catch (_) { return true }
}

export function setBgProfilesEnabled(on) {
  try {
    if (on) localStorage.removeItem(BG_PROFILES_KEY)
    else localStorage.setItem(BG_PROFILES_KEY, 'off')
  } catch (_) {}
}

// The per-browser "Auto-check for new grades" timer (wg_poll_min, 2–20 min) was
// removed on 2026-10-16: every open tab re-scraping HAC on a clock was load on
// the Pi for nothing now that opens are fast and the Pi's own pollers (snapshot +
// Web Push) watch for new grades server-side. The app still re-syncs on open,
// focus and pull-to-refresh.

// Rollout gate for reading the Pi's server-side grade snapshot on cold open
// (server-side snapshot sync). Now ON by default — rolled out to everyone. A
// per-browser override (`wg_snapshot_read` = 'on'|'off') can still force it
// either way (e.g. 'off' on a browser you want to test the pure-scrape path on).
// A snapshot read never makes the app worse (silent fall-through on any miss),
// so this only controls WHO gets the cold-open speedup, not correctness.
const SNAPSHOT_READ_KEY = 'wg_snapshot_read' // 'on' | 'off'; absent = default
const SNAPSHOT_READ_DEFAULT = true

export function snapshotReadEnabled() {
  try {
    const v = localStorage.getItem(SNAPSHOT_READ_KEY)
    return v === 'on' ? true : v === 'off' ? false : SNAPSHOT_READ_DEFAULT
  } catch (_) { return SNAPSHOT_READ_DEFAULT }
}

export function setSnapshotReadEnabled(on) {
  try { localStorage.setItem(SNAPSHOT_READ_KEY, on ? 'on' : 'off') } catch (_) {}
}
