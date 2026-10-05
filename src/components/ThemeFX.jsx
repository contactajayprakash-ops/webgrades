import { useEffect, useRef, useSyncExternalStore } from 'react'
import { getThemeId, subscribeGlassMode } from '../lib/glassMode.js'

// Scene builder + mouse effect for each animated theme (galaxy has its own
// component). Every theme is a different EXPERIENCE, not a recolor:
//   aurora — undulating light ribbons + stars; the mouse drags a vertical
//            aurora beam across the sky, ribbons parallax.
//   neon   — synthwave: perspective grid scrolling toward you + horizon sun;
//            the mouse is a magenta/cyan crosshair scanline pair.
//   ember  — rising ember particles + breathing hearth glow; the mouse carries
//            a flickering heat-haze.
//   tide   — caustic light + rolling waves + rising bubbles; the mouse is a
//            light refraction spot, and CLICKS drop expanding ripples.
// All animation is transform/opacity (composited); pointer work is one
// rAF-throttled handler; everything unmounts cleanly on theme switch.

const seeded = (seed) => { let s0 = seed; return () => { s0 = s0 * 16807 % 2147483647; return s0 / 2147483647 } }

function buildAurora(bg) {
  const rnd = seeded(11)
  // star field (sparse, cold, pixel-scale — the viewBox matches ~screen px)
  let stars = ''
  for (let i = 0; i < 110; i++) {
    const x = (rnd() * 1440).toFixed(0), y = (rnd() * 650).toFixed(0)
    const r = (0.5 + rnd() * 1.3).toFixed(2)
    stars += `<circle cx="${x}" cy="${y}" r="${r}" fill="#dfe9ff" opacity="${(0.25 + rnd() * 0.6).toFixed(2)}"/>`
  }
  bg.innerHTML = `
    <svg class="fx-stars" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">${stars}</svg>
    <div class="fx-par" style="--k:10"><div class="fx-ribbon fx-r1"></div></div>
    <div class="fx-par" style="--k:18"><div class="fx-ribbon fx-r2"></div></div>
    <div class="fx-par" style="--k:28"><div class="fx-ribbon fx-r3"></div></div>
    <div class="fx-beam"></div>`
  const beam = bg.querySelector('.fx-beam')
  return (x) => {
    bg.style.setProperty('--px', (x / innerWidth * 2 - 1).toFixed(3))
    beam.style.transform = `translate3d(${x - 90}px,0,0)`
  }
}

function buildNeon(bg) {
  const rnd = seeded(23)
  let stars = ''
  for (let i = 0; i < 70; i++) {
    const x = (rnd() * 1440).toFixed(0), y = (rnd() * 480).toFixed(0)
    stars += `<circle cx="${x}" cy="${y}" r="${(0.6 + rnd() * 1.4).toFixed(2)}" fill="#ff9ff0" opacity="${(0.3 + rnd() * 0.5).toFixed(2)}"/>`
  }
  bg.innerHTML = `
    <svg class="fx-stars" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">${stars}</svg>
    <div class="fx-sun"></div>
    <div class="fx-gridwrap"><div class="fx-grid"></div></div>
    <div class="fx-cross-v"></div><div class="fx-cross-h"></div>`
  const v = bg.querySelector('.fx-cross-v'), h = bg.querySelector('.fx-cross-h')
  return (x, y) => {
    v.style.transform = `translate3d(${x}px,0,0)`
    h.style.transform = `translate3d(0,${y}px,0)`
  }
}

function buildEmber(bg) {
  const rnd = seeded(37)
  let embers = ''
  for (let i = 0; i < 34; i++) {
    const left = (rnd() * 100).toFixed(1)
    const size = (2 + rnd() * 3.4).toFixed(1)
    const dur = (7 + rnd() * 9).toFixed(1)
    const delay = (-rnd() * 16).toFixed(1)
    const dx = ((rnd() * 2 - 1) * 90).toFixed(0)
    embers += `<i class="fx-spark" style="left:${left}%;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${delay}s;--dx:${dx}px"></i>`
  }
  bg.innerHTML = `<div class="fx-hearth"></div>${embers}<div class="fx-warm"></div>`
  const warm = bg.querySelector('.fx-warm')
  return (x, y) => { warm.style.transform = `translate3d(${x}px,${y}px,0)` }
}

function buildTide(bg) {
  const rnd = seeded(53)
  let bubbles = ''
  for (let i = 0; i < 14; i++) {
    const left = (rnd() * 100).toFixed(1)
    const size = (5 + rnd() * 11).toFixed(1)
    const dur = (11 + rnd() * 12).toFixed(1)
    const delay = (-rnd() * 20).toFixed(1)
    bubbles += `<i class="fx-bubble" style="left:${left}%;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${delay}s"></i>`
  }
  bg.innerHTML = `
    <div class="fx-caustic fx-c1"></div><div class="fx-caustic fx-c2"></div>
    ${bubbles}
    <div class="fx-wave fx-w1"></div><div class="fx-wave fx-w2"></div>
    <div class="fx-sunray"></div>`
  const ray = bg.querySelector('.fx-sunray')
  const move = (x, y) => { ray.style.transform = `translate3d(${x}px,${y}px,0)` }
  move.onClick = (x, y) => {
    const r = document.createElement('i')
    r.className = 'fx-ripple'
    r.style.left = x + 'px'; r.style.top = y + 'px'
    bg.appendChild(r)
    r.addEventListener('animationend', () => r.remove())
  }
  return move
}

const BUILDERS = { aurora: buildAurora, neon: buildNeon, ember: buildEmber, tide: buildTide }

export default function ThemeFX() {
  const id = useSyncExternalStore(subscribeGlassMode, getThemeId, () => 'dark')
  const ref = useRef(null)

  useEffect(() => {
    const build = BUILDERS[id]
    const bg = ref.current
    if (!build || !bg) return
    const move = build(bg)

    let raf = 0, ev = null
    const tick = () => { raf = 0; if (ev) { const { clientX: x, clientY: y } = ev; ev = null; move(x, y) } }
    const onMove = (e) => { ev = e; if (!raf) raf = requestAnimationFrame(tick) }
    const onClick = move.onClick ? (e) => move.onClick(e.clientX, e.clientY) : null
    document.addEventListener('pointermove', onMove, { passive: true })
    if (onClick) document.addEventListener('pointerdown', onClick, { passive: true })
    return () => {
      document.removeEventListener('pointermove', onMove)
      if (onClick) document.removeEventListener('pointerdown', onClick)
      if (raf) cancelAnimationFrame(raf)
      bg.innerHTML = ''
    }
  }, [id])

  if (!BUILDERS[id]) return null
  return <div className={`fx-bg fx-${id}`} ref={ref} aria-hidden="true" />
}
