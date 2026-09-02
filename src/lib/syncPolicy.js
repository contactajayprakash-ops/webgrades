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
