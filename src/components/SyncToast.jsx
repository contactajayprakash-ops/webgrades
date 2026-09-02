import { useAuth } from '../context/AuthContext.jsx'

// Non-blocking, bottom-right glass toast — shows ONLY the live sync progress and
// then disappears. The post-sync results ("N updates" / "Up to date") are
// intentionally not shown; the dashboard's "Recently posted" card already
// surfaces what got graded. Never hides page content — cached data shows while
// this runs.
export default function SyncToast() {
  const { sync } = useAuth()
  if (sync.phase !== 'syncing') return null
  return (
    <div className="sync-toast">
      <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
      <span>{sync.initial ? 'Loading your data…' : 'Checking for updates…'}</span>
      <span className="sync-count">{sync.done}/{sync.total}</span>
    </div>
  )
}
