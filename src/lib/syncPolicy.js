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
