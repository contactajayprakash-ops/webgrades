import { Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useSettingsSync } from '../hooks/useSettingsSync.js'
import { Icon } from './icons.jsx'
import { OfflineBanner, Loading } from './ui.jsx'
import ProfileSwitcher from './ProfileSwitcher.jsx'
import PullToRefresh from './PullToRefresh.jsx'
import Glass, { GlassLink } from './Glass.jsx'
import GalaxyBg from './GalaxyBg.jsx'
import ThemeFX from './ThemeFX.jsx'
import { getNavSide, subscribeGlassMode } from '../lib/glassMode.js'

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'home', end: true },
  { to: '/grades', label: 'Grades', icon: 'book' },
  { to: '/gpa', label: 'GPA', icon: 'calc' },
  { to: '/agenda', label: 'Agenda', icon: 'checklist', badge: 'New' },
  { section: 'Records' },
  { to: '/schedule', label: 'Schedule', icon: 'clock' },
  { to: '/week', label: 'This Week', icon: 'agenda' },
  { to: '/ipr', label: 'Interim Progress', icon: 'clipboard' },
  { to: '/transcript', label: 'Transcript', icon: 'scroll' },
  { to: '/attendance', label: 'Attendance', icon: 'calendar' },
  { section: 'More' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

// Primary tabs shown in the desktop floating glass pill; the rest live behind
// "More", which drops down from the pill (with the profile switcher).
const PRIMARY = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/grades', label: 'Grades' },
  { to: '/gpa', label: 'GPA' },
  { to: '/agenda', label: 'Agenda', badge: 'New' },
]

// The extra pages behind "More" (everything not already a primary pill tab).
const SECONDARY = NAV.slice(4) // starts at the "Records" section

// The four primary tabs for the iPhone floating tab bar.
const TABS = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/grades', label: 'Grades', icon: 'book' },
  { to: '/gpa', label: 'GPA', icon: 'calc' },
  { to: '/schedule', label: 'Schedule', icon: 'clock' },
]

const titleFor = (path) => NAV.find((n) => n.to && (n.end ? path === n.to : path.startsWith(n.to)))?.label || 'WebGrades'

export default function Layout() {
  const { activeUsername, session, syncAll } = useAuth()
  useSettingsSync(session)
  const [sheet, setSheet] = useState(false)   // mobile nav sheet
  const [menu, setMenu] = useState(false)     // desktop "More" dropdown
  const [q, setQ] = useState('')              // sheet search filter
  const loc = useLocation()
  // Desktop sidebar mode re-renders the nav (full list w/ icons, no More menu).
  const navSide = useSyncExternalStore(subscribeGlassMode, getNavSide, () => false)

  // Sidebar mode is ADAPTIVE: the rail is a full-height column (brand → nav →
  // Settings → profile docked at the bottom). Only as many nav rows as actually
  // fit are shown; the rest collapse behind a "More" row whose dropdown opens
  // beside the rail. Recomputed on resize, so every screen height gets the
  // right split instead of an overflowing list.
  const [sideRows, setSideRows] = useState(99)
  useEffect(() => {
    if (!navSide) return
    const calc = () => {
      const ROW = 54        // nav row height + gap
      const OVERHEAD = 300  // topbar padding + brand + seps + Settings row + profile row
      setSideRows(Math.max(3, Math.floor((window.innerHeight - OVERHEAD) / ROW)))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [navSide])

  // Bouncy sliding pill behind the active nav tab (galaxy-file style). Placed by
  // measurement so it works in the top bar AND the docked sidebar, in plain and
  // quick-liquid (ql-content) DOM alike — buttons and slider share an offset
  // parent either way. Re-placed on route/menu change, resize, and nav reflow.
  useEffect(() => {
    const place = () => {
      const nav = document.querySelector('.app-shell.v2 .navpill')
      const pill = nav?.querySelector('.np-slider')
      if (!nav || !pill) return
      const actives = nav.querySelectorAll('.np-tab.active')
      const act = actives[actives.length - 1] // menu-open "More" wins over the route tab
      if (!act) { pill.classList.remove('on'); return }
      pill.classList.add('on')
      pill.style.width = act.offsetWidth + 'px'
      pill.style.height = act.offsetHeight + 'px'
      pill.style.transform = `translate(${act.offsetLeft}px, ${act.offsetTop}px)`
    }
    place()
    const t1 = setTimeout(place, 120)  // fonts settle
    const t2 = setTimeout(place, 600)  // quick-liquid upgrade re-parents the tabs
    const ro = new ResizeObserver(place)
    const nav = document.querySelector('.app-shell.v2 .navpill')
    if (nav) ro.observe(nav)
    window.addEventListener('resize', place)
    return () => { clearTimeout(t1); clearTimeout(t2); ro.disconnect(); window.removeEventListener('resize', place) }
  }, [loc.pathname, menu, navSide])

  // Sidebar mode: the More dropdown opens BESIDE the rail, vertically aligned
  // with the More row itself (clamped on-screen) instead of pinned to the bottom.
  useEffect(() => {
    if (!menu || !navSide) return
    const align = () => {
      const m = document.querySelector('.nav-menu')
      const btn = [...document.querySelectorAll('.navpill .np-tab')].find((t) => t.textContent.trim() === 'More')
      if (!m || !btn) return
      const h = m.getBoundingClientRect().height
      const top = Math.max(12, Math.min(btn.getBoundingClientRect().top, window.innerHeight - h - 12))
      m.style.top = top + 'px'
      m.style.bottom = 'auto'
    }
    align()
    const t = setTimeout(align, 250) // re-align after the entrance animation settles
    return () => clearTimeout(t)
  }, [menu, navSide])

  const [seenBadges, setSeenBadges] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wg_nav_seen')) || {} } catch (_) { return {} }
  })
  useEffect(() => {
    const hit = NAV.find((n) => n.to && n.badge && (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))
    if (hit && !seenBadges[hit.to]) {
      const next = { ...seenBadges, [hit.to]: true }
      setSeenBadges(next)
      try { localStorage.setItem('wg_nav_seen', JSON.stringify(next)) } catch (_) {}
    }
  }, [loc.pathname, seenBadges])

  // Close both menus on navigation.
  useEffect(() => { setSheet(false); setMenu(false) }, [loc.pathname])

  useEffect(() => {
    const label = titleFor(loc.pathname)
    document.title = label === 'WebGrades' ? 'WebGrades' : `WebGrades - ${label}`
  }, [loc.pathname])

  const query = q.trim().toLowerCase()
  const links = NAV.filter((it) => it.to)
  const filtered = query ? links.filter((it) => it.label.toLowerCase().includes(query)) : null
  const currentTitle = titleFor(loc.pathname)

  // Shared renderer for a nav row (used by both the desktop dropdown + mobile sheet).
  const navRow = (item, onClick) => {
    const C = Icon[item.icon]
    return (
      <NavLink key={item.to} to={item.to} end={item.end} onClick={onClick}
        className={({ isActive }) => `menu-row ${isActive ? 'active' : ''}`}>
        <C className="ico" width={20} height={20} />
        <span className="menu-label">{item.label}</span>
        {item.badge && !seenBadges[item.to] && <span className="nav-badge">{item.badge}</span>}
      </NavLink>
    )
  }

  return (
    <div className="app-shell v2">
      {/* Cinematic animated background as a REAL element (not a body::before gated
          by :has(.app-shell.v2)) — that pseudo-element + :has combo intermittently
          dropped to pure black after a route/Suspense subtree swap. */}
      <div className="v2-bg" aria-hidden="true" />
      <GalaxyBg />
      <ThemeFX />
      {/* Desktop floating Liquid Glass nav */}
      <header className="topbar">
        <GlassLink to="/" className="tb-brand" config={{ material: 'thin', borderRadius: 999 }}>
          <span className="logo">W</span>
          <span className="tb-word">Web<span className="accent">Grades</span></span>
        </GlassLink>

        <div className="topbar-right">
          <Glass as="nav" className={`navpill ${navSide ? 'navpill-side' : ''}`} config={{ material: 'thin', borderRadius: navSide ? 30 : 999 }} aria-label="Primary">
            <span className="np-slider" aria-hidden="true" />
            {navSide ? (() => {
              // Rail rows: primary tabs always; then as many record links as fit;
              // the remainder behind More. Settings is always the last nav row.
              const links = NAV.filter((i) => i.to)
              const primaryL = links.slice(0, 4)
              const settingsL = links[links.length - 1]
              const secL = links.slice(4, -1)
              const slots = sideRows - primaryL.length
              const showAll = slots >= secL.length
              const visible = showAll ? secL : secL.slice(0, Math.max(0, slots - 1))
              const overflow = showAll ? [] : secL.slice(Math.max(0, slots - 1))
              const row = (item) => {
                const C = Icon[item.icon]
                return (
                  <NavLink key={item.to} to={item.to} end={item.end}
                    className={({ isActive }) => `np-tab ${isActive && !menu ? 'active' : ''}`}>
                    <C width={20} height={20} aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.badge && !seenBadges[item.to] && <span className="np-dot" aria-hidden="true" />}
                  </NavLink>
                )
              }
              return (
                <>
                  {primaryL.map(row)}
                  <span className="np-sep" aria-hidden="true" />
                  {visible.map(row)}
                  {overflow.length > 0 && (
                    <button className={`np-tab ${menu ? 'active' : ''}`} onClick={() => setMenu((m) => !m)}>
                      <Icon.more width={20} height={20} aria-hidden="true" />
                      <span>More</span>
                    </button>
                  )}
                  <span className="np-sep" aria-hidden="true" />
                  {row(settingsL)}
                  <div className="np-rail-profile"><ProfileSwitcher /></div>
                </>
              )
            })() : (
              <>
                {PRIMARY.map((t) => (
                  <NavLink key={t.to} to={t.to} end={t.end}
                    className={({ isActive }) => `np-tab ${isActive && !menu ? 'active' : ''}`}>
                    {t.label}
                    {t.badge && !seenBadges[t.to] && <span className="np-dot" aria-hidden="true" />}
                  </NavLink>
                ))}
                <button className={`np-tab ${menu ? 'active' : ''}`} onClick={() => setMenu((m) => !m)}>More</button>
                <span className="np-sep" />
                <NavLink to="/settings" className={({ isActive }) => `np-icon ${isActive ? 'active' : ''}`} aria-label="Settings">
                  <Icon.settings width={17} height={17} />
                </NavLink>
              </>
            )}
          </Glass>

          {!navSide && <ProfileSwitcher compact />}

          {menu && (
            <>
              <div className="nav-menu-backdrop" onClick={() => setMenu(false)} />
              <Glass className="nav-menu" role="menu" animateIn config={{ material: 'thick', borderRadius: 24 }}>
                <div className="nav-menu-list">
                  {(navSide
                    ? NAV.filter((i) => i.to).slice(4, -1).slice(Math.max(0, sideRows - 5))
                    : SECONDARY
                  ).map((item, i) => item.section
                    ? <div className="nav-section" key={`s${i}`}>{item.section}</div>
                    : navRow(item, () => setMenu(false)))}
                </div>
              </Glass>
            </>
          )}
        </div>
      </header>

      {/* Mobile nav sheet (opened from the bottom tab bar / mobile top bar) */}
      <aside className={`sidebar ${sheet ? 'open' : ''}`}>
        <div className="sidebar-head">
          <div className="brand" style={{ padding: 0 }}>
            <span className="logo">W</span>
            <span>Web<span className="accent">Grades</span></span>
          </div>
          <button className="circle-btn" aria-label="Close" onClick={() => setSheet(false)} style={{ fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <label className="sidebar-search">
          <Icon.search width={15} height={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search navigation" />
        </label>
        <nav className="nav-scroll">
          {(filtered || NAV).map((item, i) => item.section
            ? <div className="nav-section" key={`s${i}`}>{item.section}</div>
            : navRow(item, () => setSheet(false)))}
          {filtered && filtered.length === 0 && <div className="nav-empty">No results</div>}
        </nav>
        <div className="sidebar-foot"><ProfileSwitcher /></div>
      </aside>
      {sheet && <div className="backdrop" onClick={() => setSheet(false)} />}

      <div className="shell-body">
        <Glass className="mobile-topbar" config={{ material: 'regular', borderRadius: 0 }}>
          <button className="circle-btn" onClick={() => setSheet(true)} aria-label="Menu">
            <Icon.sidebar width={17} height={17} />
          </button>
          <div className="m-title">{currentTitle}</div>
          <div style={{ width: 34 }} />
        </Glass>

        <main className="main" key={activeUsername}>
          <PullToRefresh onRefresh={() => new Promise((onHot) => { syncAll({ full: true, onHot }) })}>
            <OfflineBanner />
            <Suspense fallback={<Loading />}><Outlet /></Suspense>
          </PullToRefresh>
        </main>
      </div>

      {/* Floating Liquid Glass tab bar (iPhone) */}
      <Glass as="nav" className="tab-bar" config={{ material: 'thin', borderRadius: 999 }} aria-label="Tabs">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}
            className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}>
            <span className="tab-glass" />
            {(() => { const C = Icon[t.icon]; return <C className="ico" width={24} height={24} /> })()}
            <span>{t.label}</span>
          </NavLink>
        ))}
        <button className={`tab-item ${sheet ? 'active' : ''}`} onClick={() => setSheet(true)}>
          <span className="tab-glass" />
          <Icon.more className="ico" width={24} height={24} />
          <span>More</span>
        </button>
      </Glass>
    </div>
  )
}
