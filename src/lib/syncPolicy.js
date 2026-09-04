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

// Per-BROWSER background auto-check interval for the ACTIVE account, in minutes.
// How often the app quietly re-checks HAC for new grades while it's open (even
// unfocused). Default 5 min; a slider in Settings lets you pick 2–20. Stored
// browser-local like the toggles above, so it never follows you to another
// device. Read live on each poll tick, so a change takes effect without reload.
const POLL_MIN_KEY = 'wg_poll_min'
export const POLL_MIN_DEFAULT = 5
export const POLL_MIN_MIN = 2
export const POLL_MIN_MAX = 20

const clampPoll = (n) => Math.min(POLL_MIN_MAX, Math.max(POLL_MIN_MIN, Math.round(n)))

export function pollIntervalMin() {
  try {
    const raw = parseInt(localStorage.getItem(POLL_MIN_KEY), 10)
    return Number.isFinite(raw) ? clampPoll(raw) : POLL_MIN_DEFAULT
  } catch (_) { return POLL_MIN_DEFAULT }
}

export function setPollIntervalMin(min) {
  try { localStorage.setItem(POLL_MIN_KEY, String(clampPoll(min))) } catch (_) {}
}

export function pollIntervalMs() { return pollIntervalMin() * 60_000 }
