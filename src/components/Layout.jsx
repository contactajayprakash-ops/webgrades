import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Icon } from './icons.jsx'
import { OfflineBanner } from './ui.jsx'
import ProfileSwitcher from './ProfileSwitcher.jsx'

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'home', end: true },
  { to: '/grades', label: 'Grades', icon: 'book' },
  { to: '/gpa', label: 'GPA', icon: 'calc' },
  { to: '/target', label: 'Targets', icon: 'target' },
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

// The four primary tabs for the iPhone floating tab bar; everything else lives
// behind "More" (which slides the full sidebar in as a sheet, like an app's
// overflow). Mirrors the Apple Music tab-bar pattern.
const TABS = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/grades', label: 'Grades', icon: 'book' },
  { to: '/gpa', label: 'GPA', icon: 'calc' },
  { to: '/schedule', label: 'Schedule', icon: 'clock' },
]

const titleFor = (path) => NAV.find((n) => n.to && (n.end ? path === n.to : path.startsWith(n.to)))?.label || 'WebGrades'

export default function Layout() {
  const { activeUsername } = useAuth()
  const [open, setOpen] = useState(false)   // mobile sidebar sheet
  const [slim, setSlim] = useState(false)   // desktop collapsed rail
  const [q, setQ] = useState('')            // sidebar search filter
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

  const query = q.trim().toLowerCase()
  const links = NAV.filter((it) => it.to)
  const filtered = query ? links.filter((it) => it.label.toLowerCase().includes(query)) : null

  const SidebarInner = (
    <aside className={`sidebar ${open ? 'open' : ''} ${slim ? 'slim' : ''}`}>
      <div className="sidebar-head">
        <div className="brand" style={{ padding: 0 }}>
          <span className="logo">W</span>
          {!slim && <span>Web<span className="accent">Grades</span></span>}
        </div>
        <div className="s-actions">
          <button className="circle-btn" title={slim ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSlim((s) => !s)}>
            <Icon.sidebar width={17} height={17} />
          </button>
        </div>
      </div>

      {!slim && (
        <label className="sidebar-search">
          <Icon.search width={15} height={15} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            aria-label="Search navigation"
          />
        </label>
      )}

      <nav className="nav-scroll">
        {(filtered || NAV).map((item, i) =>
          item.section ? (
            !slim && <div className="nav-section" key={`s${i}`}>{item.section}</div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={slim ? item.label : undefined}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              onClick={() => setOpen(false)}
            >
              {(() => { const C = Icon[item.icon]; return <C className="ico" width={22} height={22} /> })()}
              {!slim && <span className="nav-label">{item.label}</span>}
              {!slim && item.badge && !seenBadges[item.to] && <span className="nav-badge">{item.badge}</span>}
            </NavLink>
          )
        )}
        {filtered && filtered.length === 0 && (
          <div className="nav-empty">No results</div>
        )}
      </nav>

      {!slim && (
        <div className="sidebar-foot">
          <ProfileSwitcher />
        </div>
      )}
    </aside>
  )

  const currentTitle = titleFor(loc.pathname)

  return (
    <div className="app-shell">
      {SidebarInner}
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}

      <div style={{ flex: 1, minWidth: 0 }}>
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
          <OfflineBanner />
          <Outlet />
        </main>
      </div>

      {/* Floating Liquid Glass tab bar (iPhone) */}
      <nav className="tab-bar" aria-label="Tabs">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}
          >
            <span className="tab-glass" />
            {(() => { const C = Icon[t.icon]; return <C className="ico" width={24} height={24} /> })()}
            <span>{t.label}</span>
          </NavLink>
        ))}
        <button
          className={`tab-item ${open ? 'active' : ''}`}
          onClick={() => setOpen(true)}
        >
          <span className="tab-glass" />
          <Icon.more className="ico" width={24} height={24} />
          <span>More</span>
        </button>
      </nav>
    </div>
  )
}
