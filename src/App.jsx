import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import Login from './components/Login.jsx'
import Layout from './components/Layout.jsx'
import { loadUI } from './lib/ui.js'
import SyncToast from './components/SyncToast.jsx'
import InstallPrompt from './components/InstallPrompt.jsx'
import Dashboard from './views/Dashboard.jsx'
import { Loading } from './components/ui.jsx'
import MovedNotice, { isRetiredHost } from './components/MovedNotice.jsx'

// Everything except the Dashboard (the cold-open target) and the default v2 shell
// is code-split out of the entry chunk — it isn't needed to paint grades. The
// classic shell only renders for the minority who opted into it; it loads on
// demand. Each is a route the user navigates to, so the round-trip is hidden.
const LayoutLegacy = lazy(() => import('./components/LayoutLegacy.jsx'))
const Grades = lazy(() => import('./views/Grades.jsx'))
const Gpa = lazy(() => import('./views/Gpa.jsx'))
const Agenda = lazy(() => import('./views/Agenda.jsx'))
const Schedule = lazy(() => import('./views/Schedule.jsx'))
const Week = lazy(() => import('./views/Week.jsx'))
const Ipr = lazy(() => import('./views/Ipr.jsx'))
const Rank = lazy(() => import('./views/Rank.jsx'))
const Transcript = lazy(() => import('./views/Transcript.jsx'))
const Attendance = lazy(() => import('./views/Attendance.jsx'))
const Settings = lazy(() => import('./views/Settings.jsx'))

export default function App() {
  const { isAuthed } = useAuth()

  // Which shell to render — new 2.0 UI or the classic sidebar. Reacts live to
  // the Settings toggle (which fires 'wg-settings-changed').
  const [ui, setUi] = useState(loadUI)
  useEffect(() => {
    const h = () => setUi(loadUI())
    window.addEventListener('wg-settings-changed', h)
    return () => window.removeEventListener('wg-settings-changed', h)
  }, [])
  const Shell = ui === 'legacy' ? LayoutLegacy : Layout

  // Old Vercel deployment: send everyone to the new Firebase link before anything
  // else (no data loads on the dead host anyway).
  if (isRetiredHost()) return <MovedNotice />

  // The install prompt shows for everyone — signed in or on the login screen.
  if (!isAuthed) return (<><Login /><InstallPrompt /></>)

  return (
    <>
      {/* Outer boundary catches the lazy shell (classic only). Lazy ROUTES are
          caught by an inner <Suspense> around the shell's <Outlet>, so navigating
          keeps the nav in place instead of blanking the whole page. */}
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<Dashboard />} />
          <Route path="/grades" element={<Grades />} />
          <Route path="/gpa" element={<Gpa />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/week" element={<Week />} />
          <Route path="/ipr" element={<Ipr />} />
          <Route path="/rank" element={<Rank />} />
          <Route path="/transcript" element={<Transcript />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
      <SyncToast />
      <InstallPrompt />
    </>
  )
}
