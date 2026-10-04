// Reactive store for the "Liquid Glass" rendering mode.
//   'enhanced' — surfaces render through quick-liquid (real SVG refraction on
//                Chromium, CSS-glass fallback on Safari/Firefox).
//   'standard' — the original hand-tuned CSS glass; zero extra JS/GPU cost.
// Driven by the device theme (see theme.js); <Glass> subscribes so a Settings
// toggle switches every surface live, no reload. Kept tiny + framework-free so
// theme.js can set it before React mounts (no first-paint flash).
let mode = 'enhanced'
let appearance = 'dark' // follows the APP theme (data-theme), not the OS scheme
const subs = new Set()
const emit = () => { for (const fn of subs) { try { fn() } catch (_) {} } }

export function getGlassMode() { return mode }
export function getGlassAppearance() { return appearance }

export function setGlassMode(next, theme) {
  const m = next === 'standard' ? 'standard' : 'enhanced'
  const a = theme === 'light' ? 'light' : 'dark'
  if (m === mode && a === appearance) return
  mode = m; appearance = a
  emit()
}

export function subscribeGlassMode(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}
