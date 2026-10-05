import { useEffect, useRef, useSyncExternalStore } from 'react'
import { getThemeName, subscribeGlassMode } from '../lib/glassMode.js'

// Deep-space backdrop for the Galaxy theme: seeded SVG star layers + nebula
// blobs with pointer parallax and twinkle, plus the cursor-following light on
// every glass surface (--mx/--my/--a consumed by the galaxy CSS). Mounted
// globally; renders nothing unless the theme is 'galaxy'.

const C = ['#ffffff', '#e4e9ff', '#cfc6ff', '#b4cdff']

function buildLayers() {
  // Seeded PRNG so the sky is identical every open (no twinkle "pop" on boot).
  let s0 = 7
  const rnd = () => { s0 = s0 * 16807 % 2147483647; return s0 / 2147483647 }
  const gs = () => (rnd() + rnd() + rnd() - 1.5) / 1.5

  const stars = (n, r0, r1, o0, o1, band, halo) => {
    let o = ''
    for (let i = 0; i < n; i++) {
      let x, y
      if (rnd() < band) { x = rnd() * 1092; y = 380 - (x - 560) * 0.532 + gs() * 110 } // milky-way band
      else { x = rnd() * 1092; y = rnd() * 764 }
      const r = r0 + Math.pow(rnd(), 2) * (r1 - r0)
      const c = C[Math.floor(rnd() * 4)]
      if (halo && r > 1.3) o += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(r * 6).toFixed(1)}" fill="url(#hz§)" opacity=".45"/>`
      o += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(2)}" fill="${c}" opacity="${(o0 + rnd() * (o1 - o0)).toFixed(2)}"/>`
    }
    return o
  }
  const blur = (id, sd) => `<filter id="${id}§" filterUnits="userSpaceOnUse" x="-600" y="-600" width="2300" height="2000"><feGaussianBlur stdDeviation="${sd}"/></filter>`

  return [
    [6, '', `<defs>${blur('n', 70)}${blur('m', 32)}<linearGradient id="bs§" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#05061a"/><stop offset=".55" stop-color="#03040d"/><stop offset="1" stop-color="#0a0626"/></linearGradient></defs><rect width="1092" height="764" fill="url(#bs§)"/>`
      + `<g filter="url(#n§)"><ellipse cx="230" cy="190" rx="380" ry="190" fill="#3a1b78" opacity=".42" transform="rotate(-18 230 190)"/><ellipse cx="880" cy="520" rx="420" ry="210" fill="#10306c" opacity=".5"/><ellipse cx="920" cy="120" rx="240" ry="120" fill="#5a1f7a" opacity=".28"/><ellipse cx="140" cy="660" rx="320" ry="170" fill="#0c2a58" opacity=".42"/><ellipse cx="560" cy="380" rx="720" ry="95" fill="#5a3fb0" opacity=".3" transform="rotate(-28 560 380)"/></g>`
      + `<g filter="url(#m§)"><ellipse cx="560" cy="380" rx="520" ry="34" fill="#8a76e6" opacity=".16" transform="rotate(-28 560 380)"/><ellipse cx="400" cy="450" rx="160" ry="28" fill="#6a8cf0" opacity=".12" transform="rotate(-28 400 450)"/></g>`],
    [12, '', stars(170, 0.35, 0.9, 0.25, 0.7, 0.55, 0)],
    [20, 'tw1', stars(26, 0.6, 1.3, 0.5, 0.9, 0.4, 0)],
    [26, 'tw2', stars(26, 0.6, 1.3, 0.5, 0.9, 0.4, 0)],
    [34, '', `<defs><radialGradient id="hz§"><stop offset="0" stop-color="#cdd7ff" stop-opacity=".9"/><stop offset="1" stop-color="#8a9bff" stop-opacity="0"/></radialGradient></defs>` + stars(40, 0.8, 2.2, 0.6, 1, 0.35, 1)],
  ]
}

// Surfaces that receive the cursor light (galaxy CSS paints the ::after glow).
const GLOW_SEL = '.card, .navpill, .nav-menu, .profile-pop, .card-menu, .login-card, .tab-bar, .impact'

export default function GalaxyBg() {
  const theme = useSyncExternalStore(subscribeGlassMode, getThemeName, () => 'dark')
  const ref = useRef(null)

  useEffect(() => {
    if (theme !== 'galaxy') return
    const bg = ref.current
    if (!bg) return
    // build the sky once per mount
    bg.innerHTML = ''
    buildLayers().forEach((l, i) => {
      const d = document.createElement('div')
      d.className = 'glx-lay ' + l[1]
      d.style.setProperty('--k', l[0])
      d.innerHTML = `<svg viewBox="0 0 1092 764" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${l[2].replace(/§/g, i)}</svg>`
      bg.appendChild(d)
    })
    bg.insertAdjacentHTML('beforeend', '<div class="glx-vig"></div>')

    // pointer parallax on the sky
    const onMove = (e) => {
      bg.style.setProperty('--px', (e.clientX / innerWidth * 2 - 1).toFixed(3))
      bg.style.setProperty('--py', (e.clientY / innerHeight * 2 - 1).toFixed(3))
    }
    // cursor-following light across glass surfaces
    const onGlow = (e) => {
      const t = e.target.closest && e.target.closest(GLOW_SEL)
      if (!t) return
      const r = t.getBoundingClientRect()
      t.style.setProperty('--mx', (e.clientX - r.left) + 'px')
      t.style.setProperty('--my', (e.clientY - r.top) + 'px')
      t.style.setProperty('--a', 1)
    }
    const onGlowOut = (e) => {
      const t = e.target.closest && e.target.closest(GLOW_SEL)
      if (t) t.style.setProperty('--a', 0.45)
    }
    addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointermove', onGlow, { passive: true })
    document.addEventListener('pointerout', onGlowOut, { passive: true })
    return () => {
      removeEventListener('pointermove', onMove)
      document.removeEventListener('pointermove', onGlow)
      document.removeEventListener('pointerout', onGlowOut)
    }
  }, [theme])

  if (theme !== 'galaxy') return null
  return <div className="glx-bg" ref={ref} aria-hidden="true" />
}
