// Web Push subscription (server-sent notifications). Works on installed PWAs
// across iOS 16.4+, Android, and Chromebook using the standard VAPID protocol —
// no Firebase, no Apple Developer account. The backend (Pi) stores the
// subscription + credentials, polls HAC, and pushes when a grade posts.
//
// The public VAPID key is safe to ship; the private key lives only on the Pi.
const BASE = import.meta.env.VITE_API_BASE || '/api'
export const PUSH_PUBLIC_KEY = 'BO3rd72X1_RNnzJ-Kx4XsV0Crar0Cnwsyx4xG0YKiG-OAOMJkOXLFFlvtr1YHiY1mmvy1BsYObPMv7RO3SGeOf0'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator
    && 'PushManager' in window && 'Notification' in window
}

// True if this device already has an active push subscription — used to avoid
// double-notifying (server push + the client-side background fallback).
export async function hasPushSubscription() {
  try {
    if (!pushSupported()) return false
    const reg = await navigator.serviceWorker.ready
    return !!(await reg.pushManager.getSubscription())
  } catch (_) { return false }
}

// Subscribe this device and register it with the backend (which stores the
// subscription + creds and pushes on new grades). Safe to call again to update
// the category preference. Returns { ok, reason? }.
export async function subscribeToPush({ username, password, kinds }) {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' }
  try {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUSH_PUBLIC_KEY),
      })
    }
    const res = await fetch(`${BASE}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, kinds, subscription: sub }),
    })
    return { ok: res.ok }
  } catch (e) {
    return { ok: false, reason: e?.message || 'error' }
  }
}

// Unregister this device from server push.
export async function unsubscribeFromPush({ username }) {
  if (!pushSupported()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    try {
      await fetch(`${BASE}/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, endpoint: sub.endpoint }),
      })
    } catch (_) {}
    try { await sub.unsubscribe() } catch (_) {}
  } catch (_) {}
}
