// Local grade notifications, fired by the background sync when new grades are
// detected. Client-side only: they show while the app is open or backgrounded
// (best as an installed PWA). Fully-closed delivery would need server push.
//
// Prefs are per-DEVICE (the OS permission is per-device anyway) and stored in
// their own localStorage key, so toggling them never triggers the theme reload.
import { isAssessment, isProgress } from './whatif.js'

const KEY = 'wg_notify'
const DEFAULT = { enabled: false, kinds: 'aol' } // 'aol' (default) | 'pc' | 'both'

export function notifySupported() {
  return typeof window !== 'undefined' && 'Notification' in window
    && 'serviceWorker' in navigator
}

export function notifyPermission() {
  return notifySupported() ? Notification.permission : 'denied'
}

export async function requestNotifyPermission() {
  if (!notifySupported()) return 'denied'
  try { return await Notification.requestPermission() } catch (_) { return 'denied' }
}

export function loadNotifyPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (raw) return { ...DEFAULT, ...raw }
  } catch (_) {}
  return { ...DEFAULT }
}

export function saveNotifyPrefs(p) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...DEFAULT, ...p })) } catch (_) {}
}

// Does a grade of this category count, given the chosen kinds?
export function eventMatches(category, kinds) {
  const aol = isAssessment(category)
  const pc = isProgress(category)
  if (kinds === 'both') return aol || pc
  if (kinds === 'pc') return pc
  return aol // default: Assessments (AOL) only
}

// Show one notification summarizing the new grades (collapses via a shared tag).
export async function showGradeNotification(events) {
  if (!notifySupported() || Notification.permission !== 'granted' || !events.length) return
  const line = (e) => `${e.course} — ${e.name}: ${e.grade}`
  const title = events.length === 1 ? 'New grade posted' : `${events.length} new grades posted`
  const body = events.length === 1 ? line(events[0]) : events.slice(0, 4).map(line).join('\n')
  const opts = { body, tag: 'wg-grades', renotify: true, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: '/' } }
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(title, opts) // required on Android; works everywhere
  } catch (_) {
    try { new Notification(title, opts) } catch (_) {} // desktop fallback
  }
}
