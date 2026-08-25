import { useEffect, useRef } from 'react'
import { applyTheme, loadTheme } from '../lib/theme.js'
import { SETTINGS_META_KEY as META_KEY } from '../lib/settingsMeta.js'
import { syncAllowedFor } from '../lib/syncPolicy.js'

// Logical name -> localStorage key that syncs across a user's devices. `wg_theme`
// is one JSON blob holding EVERY appearance/dashboard setting, so any future
// setting added there syncs automatically — no change needed here. To sync a
// setting stored under a NEW key, add a line to this map. `prefs` (the cumulative
// GPA setup: selected courses, weights, credits, grade overrides, added classes)
// is per-account, so its key includes the username.
const keyMap = (username) => ({
  theme: 'wg_theme',
  agendaView: 'wg_agenda_view',
  prefs: `wg_prefs_${username || '_anon'}`,
})
const localUpdatedAt = () => Number(localStorage.getItem(META_KEY)) || 0

function collect(username) {
  const map = keyMap(username)
  const data = {}
  for (const [logical, key] of Object.entries(map)) {
    const v = localStorage.getItem(key)
    if (v != null) data[logical] = v
  }
  return data
}

function applyCloud(data, updatedAt, username) {
  const map = keyMap(username)
  for (const [logical, key] of Object.entries(map)) {
    if (data && data[logical] != null) {
      try { localStorage.setItem(key, data[logical]) } catch (_) {}
    }
  }
  try { localStorage.setItem(META_KEY, String(updatedAt || Date.now())) } catch (_) {}
  applyTheme(loadTheme()) // apply the (possibly new) appearance live
}

// Keep appearance/settings + GPA setup in sync across a user's devices
// (last-write-wins on updatedAt). Pull-on-login, push-on-change. Silently
// degrades to local-only when offline / Firestore unreachable.
export function useSettingsSync(session) {
  const sessionRef = useRef(session)
  sessionRef.current = session
  const pushTimer = useRef(null)
  const didInitial = useRef(false) // false only for the first user this app session

  // Reconcile whenever the signed-in user changes.
  //  - First user of the session (or a reload): last-write-wins, so an offline
  //    tweak isn't clobbered by an older cloud copy.
  //  - Switching to ANOTHER profile: adopt that profile's synced settings (the
  //    device's current settings belong to the profile you just left).
  useEffect(() => {
    const s = session
    if (!s?.username || !s?.password) return
    const isSwitch = didInitial.current
    didInitial.current = true
    clearTimeout(pushTimer.current) // drop any push queued by the previous profile
    if (!syncAllowedFor(s.username)) return // dev-browser lock: this account doesn't sync here
    let cancelled = false
    ;(async () => {
      try {
        const { pullSettings, pushSettings } = await import('../lib/settingsSync.js')
        const cloud = await pullSettings(s.username, s.password)
        if (cancelled) return
        if (isSwitch) {
          // adopt the target profile's settings; don't seed from the prior user
          if (cloud) applyCloud(cloud.data || {}, cloud.updatedAt, s.username)
          return
        }
        const localTs = localUpdatedAt()
        if (!cloud) {
          pushSettings(s.username, s.password, collect(s.username), localTs || Date.now()).catch(() => {})
        } else if ((cloud.updatedAt || 0) > localTs) {
          applyCloud(cloud.data || {}, cloud.updatedAt, s.username)
        } else if (localTs > (cloud.updatedAt || 0)) {
          pushSettings(s.username, s.password, collect(s.username), localTs).catch(() => {})
        }
      } catch (_) { /* stay local */ }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.username])

  // Push (debounced) on any local settings / GPA-setup change.
  useEffect(() => {
    const onChange = () => {
      const s = sessionRef.current
      if (!s?.username || !s?.password || !syncAllowedFor(s.username)) return
      clearTimeout(pushTimer.current)
      pushTimer.current = setTimeout(async () => {
        try {
          const { pushSettings } = await import('../lib/settingsSync.js')
          await pushSettings(s.username, s.password, collect(s.username), localUpdatedAt() || Date.now())
        } catch (_) {}
      }, 800)
    }
    window.addEventListener('wg-settings-changed', onChange)
    return () => window.removeEventListener('wg-settings-changed', onChange)
  }, [])
}
