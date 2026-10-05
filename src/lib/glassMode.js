// Reactive store for the "Liquid Glass" rendering mode.
//   'enhanced' — surfaces render through quick-liquid (real SVG refraction on
//                Chromium, CSS-glass fallback on Safari/Firefox).
//   'standard' — the original hand-tuned CSS glass; zero extra JS/GPU cost.
// Driven by the device theme (see theme.js); <Glass> subscribes so a Settings
// toggle switches every surface live, no reload. Kept tiny + framework-free so
// theme.js can set it before React mounts (no first-paint flash).
let mode = 'enhanced'
let appearance = 'dark' // follows the APP theme (data-theme), not the OS scheme
let themeName = 'dark'  // scheme-level name ('dark'|'light'|'galaxy') for glass appearance
let themeId = 'dark'    // exact theme id (incl. aurora/neon/ember/tide) for theme FX
let navSide = false     // desktop sidebar nav (Layout re-renders its nav on change)
const subs = new Set()
const emit = () => { for (const fn of subs) { try { fn() } catch (_) {} } }

export function getGlassMode() { return mode }
export function getGlassAppearance() { return appearance }
export function getThemeName() { return themeName }
export function getNavSide() { return navSide }
export function getThemeId() { return themeId }

export function setGlassMode(next, theme, side, id) {
  const m = next === 'standard' ? 'standard' : 'enhanced'
  const a = theme === 'light' ? 'light' : 'dark'
  const t = theme === 'light' || theme === 'galaxy' ? theme : 'dark'
  const n = !!side
  const i = id || t
  if (m === mode && a === appearance && t === themeName && n === navSide && i === themeId) return
  mode = m; appearance = a; themeName = t; navSide = n; themeId = i
  emit()
}

export function subscribeGlassMode(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}
