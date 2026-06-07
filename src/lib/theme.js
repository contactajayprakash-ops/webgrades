// Device-wide appearance prefs (theme, accent, perf toggles). Kept in its own
// localStorage key — separate from per-account data — and applied by mutating
// CSS custom properties / <html> attributes that index.css reads. Defaults match
// the original look exactly, so an untouched install renders identically.
const KEY = 'wg_theme'

export const DEFAULT_THEME = {
  theme: 'dark',       // 'dark' | 'light'
  accentId: 'blue',    // see ACCENTS
  reduceBlur: false,   // lighter backdrop blur (faster on Chromebooks)
  reduceMotion: false, // kill animations/transitions
}

// Each accent turns the two knobs (--accent, --accent-2); every other brand
// blue in the CSS is derived from them. 'blue' is the original palette.
export const ACCENTS = [
  { id: 'blue',   label: 'Blue',   accent: '#0a84ff', accent2: '#5e5ce6' },
  { id: 'purple', label: 'Purple', accent: '#7d5cff', accent2: '#bf5af2' },
  { id: 'pink',   label: 'Pink',   accent: '#ff375f', accent2: '#ff7ab6' },
  { id: 'red',    label: 'Red',    accent: '#ff453a', accent2: '#ff9f0a' },
  { id: 'orange', label: 'Orange', accent: '#ff9f0a', accent2: '#ffd426' },
  { id: 'green',  label: 'Green',  accent: '#30d158', accent2: '#34c8a8' },
  { id: 'teal',   label: 'Teal',   accent: '#32ade6', accent2: '#5e5ce6' },
]

export const accentById = (id) => ACCENTS.find((a) => a.id === id) || ACCENTS[0]

export function loadTheme() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (raw) return { ...DEFAULT_THEME, ...raw }
  } catch (_) {}
  return { ...DEFAULT_THEME }
}

export function saveTheme(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch (_) {}
  applyTheme(state)
  window.location.reload();

}

// Lighten a #rrggbb toward white (for the brighter end of gradients/favicon).
function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (255 - c) * amt))
  return '#' + ch.map((x) => x.toString(16).padStart(2, '0')).join('')
}

function faviconSvg(accent) {
  const bright = lighten(accent.accent, 0.34)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="${bright}"/><stop offset="1" stop-color="${accent.accent2}"/></linearGradient></defs>`
    + `<rect width="32" height="32" rx="8" fill="url(#g)"/>`
    + `<path d="M6.5 10 L11 22 L16 13.5 L21 22 L25.5 10" fill="none" stroke="#fff" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/>`
    + `</svg>`
}

function setLink(rel, accent) {
  let link = document.querySelector(`link[rel="${rel}"]`)
  if (!link) { link = document.createElement('link'); link.rel = rel; document.head.appendChild(link) }
  if (rel === 'icon') link.type = 'image/svg+xml'
  link.href = 'data:image/svg+xml,' + encodeURIComponent(faviconSvg(accent))
}

// Apply a theme state to the live document. Safe to call on every boot.
export function applyTheme(state) {
  const s = { ...DEFAULT_THEME, ...(state || {}) }
  const accent = accentById(s.accentId)
  const root = document.documentElement

  root.style.setProperty('--accent', accent.accent)
  root.style.setProperty('--accent-2', accent.accent2)

  const toggle = (attr, on) => (on ? root.setAttribute(attr, '1') : root.removeAttribute(attr))
  if (s.theme === 'light') root.setAttribute('data-theme', 'light')
  else root.removeAttribute('data-theme')
  toggle('data-reduce-blur', s.reduceBlur)
  toggle('data-reduce-motion', s.reduceMotion)

  // Favicon follows the accent (apple-touch-icon too).
  setLink('icon', accent)
  setLink('apple-touch-icon', accent)

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = s.theme === 'light' ? '#eef0f5' : '#0a0a0d'
}
