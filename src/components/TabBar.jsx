import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from './icons.jsx'
import Glass, { useGlassState } from './Glass.jsx'

// iPhone floating tab bar, modeled on the iOS 26 Liquid Glass tab bar (Apple
// Music): the selected tab sits in a glass lens; press anywhere on the bar and
// the lens lifts, swells and follows the finger 1:1 across the tabs, then
// springs onto the tab you let go on (with your release velocity) and opens it.
// No web library does this (the existing recreations are SwiftUI / React
// Native / Flutter), so the motion is a small hand-rolled spring.

// Apple's spring parameterization (damping ratio + response, WWDC18 "Designing
// Fluid Interfaces") → stiffness/damping for a unit mass.
function springStep(s, target, dt, zeta, response) {
  const k = (2 * Math.PI / response) ** 2
  const c = (4 * Math.PI * zeta) / response
  s.v += (-k * (s.x - target) - c * s.v) * dt
  s.x += s.v * dt
}

// Soft edge past the first/last tab instead of a hard stop.
function rubberband(over, dim, c = 0.55) {
  return (over * dim * c) / (dim + c * Math.abs(over))
}

const reducedMotion = () =>
  document.documentElement.getAttribute('data-reduce-motion') === '1' ||
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function TabBar({ tabs, moreActive, onMore, glass = true }) {
  const loc = useLocation()
  const navigate = useNavigate()
  const { appearance } = useGlassState()
  const lensRef = useRef(null)
  const itemRefs = useRef([])
  const count = tabs.length + 1 // + More

  const routeIdx = tabs.findIndex((t) => (t.end ? loc.pathname === t.to : loc.pathname.startsWith(t.to)))
  const activeIdx = moreActive ? tabs.length : routeIdx // -1 → no lens (a page only reachable via More)

  const [hover, setHoverState] = useState(-1)  // tab under the lifted lens while dragging
  const hoverRef = useRef(-1)
  const setHover = (i) => { hoverRef.current = i; setHoverState(i) }
  const [lifted, setLifted] = useState(false)

  // Animation state lives in refs: the rAF loop writes the transform directly so
  // a drag never re-renders React.
  const st = useRef({
    x: { x: 0, v: 0 }, w: { x: 0, v: 0 }, lift: { x: 0, v: 0 },
    tx: 0, tw: 0, tlift: 0, raf: 0, last: 0, shown: false,
    drag: null, // { id, startX, moved, hist: [{x,t}] }
  })

  // Tab geometry relative to the lens's positioning box (the nav, or quick-
  // liquid's content wrapper in enhanced glass mode).
  const geom = useCallback(() => {
    const lens = lensRef.current
    const box = lens?.offsetParent
    if (!box) return null
    const b = box.getBoundingClientRect()
    return itemRefs.current.slice(0, count).map((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left - b.left, width: r.width, mid: r.left - b.left + r.width / 2 }
    })
  }, [count])

  const paint = useCallback(() => {
    const s = st.current, lens = lensRef.current
    if (!lens) return
    const lift = Math.max(0, s.lift.x)
    // Liquid stretch: the lens elongates along its travel with speed.
    const stretch = Math.min(Math.abs(s.x.v) / 4000, 0.18)
    const sx = 1 + lift * 0.14 + stretch
    const sy = 1 + lift * 0.22 - stretch * 0.4
    lens.style.width = `${s.w.x}px`
    lens.style.transform = `translate3d(${s.x.x}px,0,0) scale(${sx},${sy})`
    lens.style.setProperty('--lift', lift.toFixed(3))
  }, [])

  const tick = useCallback((now) => {
    const s = st.current
    const dt = Math.min(0.032, (now - (s.last || now)) / 1000) || 1 / 60
    s.last = now
    const dragging = !!s.drag?.moved
    // While dragging x tracks the finger directly; otherwise spring to the tab
    // (a little bounce: the release carried momentum).
    if (!dragging) springStep(s.x, s.tx, dt, 0.78, 0.38)
    springStep(s.w, s.tw, dt, 1, 0.3)
    springStep(s.lift, s.tlift, dt, 0.72, 0.32)
    paint()
    const settled = !dragging &&
      Math.abs(s.x.x - s.tx) < 0.3 && Math.abs(s.x.v) < 4 &&
      Math.abs(s.w.x - s.tw) < 0.3 && Math.abs(s.lift.x - s.tlift) < 0.002 && Math.abs(s.lift.v) < 0.01
    if (settled) {
      s.x.x = s.tx; s.x.v = 0; s.w.x = s.tw; s.w.v = 0; s.lift.x = s.tlift; s.lift.v = 0
      paint(); s.raf = 0; s.last = 0
      return
    }
    s.raf = requestAnimationFrame(tick)
  }, [paint])

  const kick = useCallback(() => {
    const s = st.current
    if (reducedMotion()) {
      if (!s.drag?.moved) s.x.x = s.tx
      s.w.x = s.tw; s.lift.x = 0; s.x.v = s.w.v = s.lift.v = 0
      paint(); return
    }
    if (!s.raf) s.raf = requestAnimationFrame(tick)
  }, [paint, tick])

  // Park the lens on the active tab (route change, resize, first paint).
  const settleOn = useCallback((idx, animate) => {
    const g = geom(), s = st.current
    if (!g || idx < 0 || !g[idx]) return
    s.tx = g[idx].left; s.tw = g[idx].width
    if (!animate || !s.shown) {
      s.x.x = s.tx; s.w.x = s.tw; s.x.v = s.w.v = 0; s.shown = true
      paint()
    } else kick()
  }, [geom, kick, paint])

  useLayoutEffect(() => {
    if (!st.current.drag) settleOn(activeIdx, true)
  }, [activeIdx, settleOn])

  useEffect(() => {
    const onResize = () => { if (!st.current.drag) settleOn(activeIdx, false) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [activeIdx, settleOn])

  // Enhanced glass upgrades the bar in place (quick-liquid re-mounts the
  // children inside its own wrapper), so a fresh lens node re-parks itself.
  const activeRef = useRef(activeIdx)
  activeRef.current = activeIdx
  const setLens = useCallback((el) => {
    lensRef.current = el
    if (!el) return
    st.current.shown = false
    requestAnimationFrame(() => { if (lensRef.current === el) settleOn(activeRef.current, false) })
  }, [settleOn])

  useEffect(() => () => cancelAnimationFrame(st.current.raf), [])

  const idxAt = (g, x) => {
    let best = 0, d = Infinity
    g.forEach((t, i) => { const dd = Math.abs(t.mid - x); if (dd < d) { d = dd; best = i } })
    return best
  }

  const localX = (e) => e.clientX - lensRef.current.offsetParent.getBoundingClientRect().left

  const placeUnderFinger = (g, x) => {
    const s = st.current
    const idx = idxAt(g, x)
    const w = g[idx].width
    const min = g[0].left, max = g[g.length - 1].left + g[g.length - 1].width - w
    let left = x - w / 2
    if (left < min) left = min - rubberband(min - left, w)
    if (left > max) left = max + rubberband(left - max, w)
    s.tw = w
    return { idx, left }
  }

  const onPointerDown = (e) => {
    if (e.button > 0 || !lensRef.current?.offsetParent) return
    const g = geom(); if (!g) return
    const s = st.current
    const x = localX(e)
    s.drag = { id: e.pointerId, startX: e.clientX, moved: false, hist: [{ x: e.clientX, t: e.timeStamp }], g }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) {}
    // Response on touch-down: the lens lifts and swells under the finger at once.
    s.tlift = 1
    s.shown = true
    const { idx, left } = placeUnderFinger(g, x)
    s.tx = left
    setLifted(true); setHover(idx)
    kick()
  }

  const onPointerMove = (e) => {
    const s = st.current, d = s.drag
    if (!d || e.pointerId !== d.id) return
    if (!d.moved && Math.abs(e.clientX - d.startX) < 6) return
    if (!d.moved) { d.moved = true; s.x.v = 0 }
    d.hist.push({ x: e.clientX, t: e.timeStamp })
    if (d.hist.length > 5) d.hist.shift()
    const { idx, left } = placeUnderFinger(d.g, localX(e))
    // 1:1 tracking; velocity from the recent history feeds the stretch + release.
    const a = d.hist[0], b = d.hist[d.hist.length - 1]
    const v = b.t > a.t ? ((b.x - a.x) / (b.t - a.t)) * 1000 : 0
    s.x.x = left; s.x.v = v; s.tx = left
    if (idx !== hoverRef.current) {
      setHover(idx)
      try { navigator.vibrate?.(6) } catch (_) {}
    }
    kick()
  }

  const open = (idx) => {
    if (idx === tabs.length) onMore()
    else if (idx >= 0) navigate(tabs[idx].to)
  }

  const finish = (e, commit) => {
    const s = st.current, d = s.drag
    if (!d || e.pointerId !== d.id) return
    s.drag = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch (_) {}
    const g = d.g
    let target = activeIdx
    if (commit) {
      // Project where the flick was heading (Apple's decay projection), then
      // land on the tab nearest that point.
      target = d.moved
        ? idxAt(g, s.x.x + s.w.x / 2 + ((s.x.v / 1000) * 0.99) / (1 - 0.99))
        : idxAt(g, localX(e))
      suppressClick.current = true
      setTimeout(() => { suppressClick.current = false }, 400)
    }
    s.tlift = 0
    setLifted(false); setHover(-1)
    if (target >= 0 && g[target]) { s.tx = g[target].left; s.tw = g[target].width }
    else s.shown = false
    kick()
    if (commit && target >= 0) open(target)
  }

  // The pointer handlers own taps; swallow the follow-up native click so the
  // NavLink doesn't navigate twice. Keyboard activation (no pointer) passes.
  const suppressClick = useRef(false)
  const onClickCapture = (e) => {
    if (suppressClick.current) { e.preventDefault(); e.stopPropagation() }
  }

  const showLens = activeIdx >= 0 || lifted
  const on = (i) => (hover >= 0 ? hover === i : activeIdx === i)

  const content = (
    <>
      <span ref={setLens} className={`tab-lens${lifted ? ' lifted' : ''}${showLens ? '' : ' off'}`} aria-hidden="true" />
      {tabs.map((t, i) => {
        const C = Icon[t.icon]
        return (
          <NavLink key={t.to} to={t.to} end={t.end} ref={(el) => { itemRefs.current[i] = el }}
            className={() => `tab-item${on(i) ? ' active' : ''}`} draggable={false}>
            <C className="ico" width={24} height={24} />
            <span>{t.label}</span>
          </NavLink>
        )
      })}
      <button ref={(el) => { itemRefs.current[tabs.length] = el }}
        className={`tab-item${on(tabs.length) ? ' active' : ''}`} onClick={onMore}>
        <Icon.more className="ico" width={24} height={24} />
        <span>More</span>
      </button>
    </>
  )

  const props = {
    className: `tab-bar lg-tabs${lifted ? ' pressing' : ''}`,
    'aria-label': 'Tabs',
    onPointerDown,
    onPointerMove,
    onPointerUp: (e) => finish(e, true),
    onPointerCancel: (e) => finish(e, false),
    onClickCapture,
  }
  // Thicker than the desktop pill: it floats over scrolling rows, so the tint
  // has to hide them (the engine scales dark tint ×1.75 → ~0.6 effective).
  const material = { material: 'thick', tintOpacity: appearance === 'light' ? 0.62 : 0.4, borderRadius: 999 }
  return glass
    ? <Glass as="nav" config={material} {...props}>{content}</Glass>
    : <nav {...props}>{content}</nav>
}
