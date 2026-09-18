import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useSettingsSync } from '../hooks/useSettingsSync.js'
import { Icon } from './icons.jsx'
import { OfflineBanner, Loading } from './ui.jsx'
import ProfileSwitcher from './ProfileSwitcher.jsx'
import PullToRefresh from './PullToRefresh.jsx'

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
      {/* Desktop floating Liquid Glass nav */}
      <header className="topbar">
        <NavLink to="/" end className="tb-brand">
          <span className="logo">W</span>
          <span className="tb-word">Web<span className="accent">Grades</span></span>
        </NavLink>

        <div className="topbar-right">
          <nav className="navpill" aria-label="Primary">
            {PRIMARY.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end}
                className={({ isActive }) => `np-tab ${isActive ? 'active' : ''}`}>
                {t.label}
                {t.badge && !seenBadges[t.to] && <span className="np-dot" aria-hidden="true" />}
              </NavLink>
            ))}
            <button className={`np-tab ${menu ? 'active' : ''}`} onClick={() => setMenu((m) => !m)}>More</button>
            <span className="np-sep" />
            <NavLink to="/settings" className={({ isActive }) => `np-icon ${isActive ? 'active' : ''}`} aria-label="Settings">
              <Icon.settings width={17} height={17} />
            </NavLink>
          </nav>

          <ProfileSwitcher compact />

          {menu && (
            <>
              <div className="nav-menu-backdrop" onClick={() => setMenu(false)} />
              <div className="nav-menu" role="menu">
                <div className="nav-menu-list">
                  {SECONDARY.map((item, i) => item.section
                    ? <div className="nav-section" key={`s${i}`}>{item.section}</div>
                    : navRow(item, () => setMenu(false)))}
                </div>
              </div>
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
        <div className="mobile-topbar">
          <button className="circle-btn" onClick={() => setSheet(true)} aria-label="Menu">
            <Icon.sidebar width={17} height={17} />
          </button>
          <div className="m-title">{currentTitle}</div>
          <div style={{ width: 34 }} />
        </div>

        <main className="main" key={activeUsername}>
          <PullToRefresh onRefresh={() => syncAll({ full: true })}>
            <OfflineBanner />
            <Suspense fallback={<Loading />}><Outlet /></Suspense>
          </PullToRefresh>
        </main>
      </div>

      {/* Floating Liquid Glass tab bar (iPhone) */}
      <nav className="tab-bar" aria-label="Tabs">
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
      </nav>
    </div>
  )
}
