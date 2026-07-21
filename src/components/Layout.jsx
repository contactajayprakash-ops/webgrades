import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Icon } from './icons.jsx'
import { OfflineBanner } from './ui.jsx'
import ProfileSwitcher from './ProfileSwitcher.jsx'

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/grades', label: 'Grades', icon: 'book' },
  { to: '/gpa', label: 'GPA', icon: 'calc' },
  { to: '/target', label: 'Targets', icon: 'target' },
  { section: 'Records' },
  { to: '/schedule', label: 'Schedule', icon: 'clock' },
  { to: '/week', label: 'This Week', icon: 'agenda' },
  { to: '/ipr', label: 'Interim Progress', icon: 'clipboard' },
  { to: '/transcript', label: 'Transcript', icon: 'scroll' },
  { to: '/attendance', label: 'Attendance', icon: 'calendar' },
  { section: 'More' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

export default function Layout() {
  const { activeUsername } = useAuth()
  const [open, setOpen] = useState(false)

  const SidebarInner = (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brand">
        <span className="logo">W</span>
        <span>Web<span className="accent">Grades</span></span>
      </div>

      {NAV.map((item, i) =>
        item.section ? (
          <div className="nav-section" key={i}>{item.section}</div>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={() => setOpen(false)}
          >
            {(() => { const C = Icon[item.icon]; return <C className="ico" /> })()}
            {item.label}
          </NavLink>
        )
      )}

      <div className="sidebar-foot">
        <ProfileSwitcher />
      </div>
    </aside>
  )

  return (
    <div className="app-shell">
      {SidebarInner}
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mobile-topbar">
          <button className="btn ghost sm" onClick={() => setOpen((o) => !o)}>
            <Icon.menu width={16} height={16} />
          </button>
          <div className="brand" style={{ padding: 0, fontSize: 17 }}>
            <span>Web<span className="accent">Grades</span></span>
          </div>
          <div style={{ width: 36 }} />
        </div>
        {/* key by account so switching profiles remounts the views with fresh state */}
        <main className="main" key={activeUsername}>
          <OfflineBanner />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
