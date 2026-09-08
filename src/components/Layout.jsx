import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useSettingsSync } from '../hooks/useSettingsSync.js'
import { Icon } from './icons.jsx'
import { OfflineBanner } from './ui.jsx'
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

// Primary tabs shown in the desktop floating glass pill (cinejoy-style). The
// rest live behind "More", which slides the full nav in as a glass sheet.
const PRIMARY = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/grades', label: 'Grades' },
  { to: '/gpa', label: 'GPA' },
  { to: '/agenda', label: 'Agenda' },
]

// The four primary tabs for the iPhone floating tab bar; everything else lives
// behind "More" (which slides the full sidebar in as a sheet).
const TABS = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/grades', label: 'Grades', icon: 'book' },
  { to: '/gpa', label: 'GPA', icon: 'calc' },
  { to: '/schedule', label: 'Schedule', icon: 'clock' },
]

const titleFor = (path) => NAV.find((n) => n.to && (n.end ? path === n.to : path.startsWith(n.to)))?.label || 'WebGrades'

export default function Layout() {
  const { activeUsername, session, syncAll } = useAuth()
  useSettingsSync(session) // keep appearance + GPA setup synced across devices
  const [open, setOpen] = useState(false)   // the glass nav sheet (More / mobile)
  const [q, setQ] = useState('')            // sheet search filter
  const loc = useLocation()

  // The "New" nav badge retires itself once the page has been opened once.
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

  // Close the sheet on navigation.
  useEffect(() => { setOpen(false) }, [loc.pathname])

  // Tab title follows the current page.
  useEffect(() => {
    const label = titleFor(loc.pathname)
    document.title = label === 'WebGrades' ? 'WebGrades' : `WebGrades - ${label}`
  }, [loc.pathname])

  const query = q.trim().toLowerCase()
  const links = NAV.filter((it) => it.to)
  const filtered = query ? links.filter((it) => it.label.toLowerCase().includes(query)) : null
  const currentTitle = titleFor(loc.pathname)

  // The full-nav glass sheet — opened by "More" (desktop) or the menu (mobile).
  const SheetInner = (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-head">
        <div className="brand" style={{ padding: 0 }}>
          <span className="logo">W</span>
          <span>Web<span className="accent">Grades</span></span>
        </div>
        <button className="circle-btn" aria-label="Close" onClick={() => setOpen(false)} style={{ fontSize: 18, lineHeight: 1 }}>✕</button>
      </div>

      <label className="sidebar-search">
        <Icon.search width={15} height={15} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search navigation" />
      </label>

      <nav className="nav-scroll">
        {(filtered || NAV).map((item, i) =>
          item.section ? (
            <div className="nav-section" key={`s${i}`}>{item.section}</div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              onClick={() => setOpen(false)}
            >
              {(() => { const C = Icon[item.icon]; return <C className="ico" width={22} height={22} /> })()}
              <span className="nav-label">{item.label}</span>
              {item.badge && !seenBadges[item.to] && <span className="nav-badge">{item.badge}</span>}
            </NavLink>
          )
        )}
        {filtered && filtered.length === 0 && <div className="nav-empty">No results</div>}
      </nav>

      <div className="sidebar-foot">
        <ProfileSwitcher />
      </div>
    </aside>
  )

  return (
    <div className="app-shell v2">
      {/* Desktop floating Liquid Glass nav */}
      <header className="topbar">
        <NavLink to="/" end className="tb-brand">
          <span className="logo">W</span>
          <span className="tb-word">Web<span className="accent">Grades</span></span>
        </NavLink>

        <nav className="navpill" aria-label="Primary">
          {PRIMARY.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end}
              className={({ isActive }) => `np-tab ${isActive ? 'active' : ''}`}>
              {t.label}
            </NavLink>
          ))}
          <button className="np-tab" onClick={() => setOpen(true)}>More</button>
          <span className="np-sep" />
          <button className="np-icon" onClick={() => setOpen(true)} aria-label="Menu">
            <Icon.search width={17} height={17} />
          </button>
          <NavLink to="/settings" className={({ isActive }) => `np-icon ${isActive ? 'active' : ''}`} aria-label="Settings">
            <Icon.settings width={17} height={17} />
          </NavLink>
        </nav>
      </header>

      {SheetInner}
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}

      <div className="shell-body">
        {/* iPhone translucent top chrome */}
        <div className="mobile-topbar">
          <button className="circle-btn" onClick={() => setOpen(true)} aria-label="Menu">
            <Icon.sidebar width={17} height={17} />
          </button>
          <div className="m-title">{currentTitle}</div>
          <div style={{ width: 34 }} />
        </div>

        {/* key by account so switching profiles remounts the views with fresh state */}
        <main className="main" key={activeUsername}>
          <PullToRefresh onRefresh={syncAll}>
            <OfflineBanner />
            <Outlet />
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
        <button className={`tab-item ${open ? 'active' : ''}`} onClick={() => setOpen(true)}>
          <span className="tab-glass" />
          <Icon.more className="ico" width={24} height={24} />
          <span>More</span>
        </button>
      </nav>
    </div>
  )
}
