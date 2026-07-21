import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import Login from './components/Login.jsx'
import Layout from './components/Layout.jsx'
import SyncToast from './components/SyncToast.jsx'
import InstallPrompt from './components/InstallPrompt.jsx'
import Dashboard from './views/Dashboard.jsx'
import Grades from './views/Grades.jsx'
import Gpa from './views/Gpa.jsx'
import Target from './views/Target.jsx'
import Schedule from './views/Schedule.jsx'
import Week from './views/Week.jsx'
import Ipr from './views/Ipr.jsx'
import Rank from './views/Rank.jsx'
import Transcript from './views/Transcript.jsx'
import Attendance from './views/Attendance.jsx'
import Settings from './views/Settings.jsx'

export default function App() {
  const { isAuthed } = useAuth()

  // The install prompt shows for everyone — signed in or on the login screen.
  if (!isAuthed) return (<><Login /><InstallPrompt /></>)

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/grades" element={<Grades />} />
          <Route path="/gpa" element={<Gpa />} />
          <Route path="/target" element={<Target />} />
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
      <SyncToast />
      <InstallPrompt />
    </>
  )
}
