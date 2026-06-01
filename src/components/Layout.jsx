import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Icon } from './icons.jsx'

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/grades', label: 'Grades', icon: 'book' },
  { to: '/gpa', label: 'GPA', icon: 'calc' },
  { section: 'Records' },
  { to: '/schedule', label: 'Schedule', icon: 'clock' },
  { to: '/transcript', label: 'Transcript', icon: 'scroll' },
  { to: '/attendance', label: 'Attendance', icon: 'calendar' },
  { section: 'More' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

function initials(name) {
  if (!name) return '?'
  const parts = name.replace(/,/g, '').trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

export default function Layout() {
  const { userName, logout } = useAuth()
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
        <div className="user-chip">
          <div className="avatar">{initials(userName)}</div>
          <div>
            <div className="name">{userName || 'Student'}</div>
            <div className="sub">HAC connected</div>
          </div>
        </div>
        <button className="logout-btn" onClick={logout}>Sign out</button>
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
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
