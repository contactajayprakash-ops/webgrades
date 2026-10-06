import { useAuth } from '../context/AuthContext.jsx'

// Non-blocking, bottom-right glass toast — a plain "Updating…" while the current
// grades are being fetched, gone the moment they land. The slower GPA / schedule
// / attendance waves keep running in the background with no indicator: cached
// data is already on screen and the app stays usable. The post-sync results
// ("N updates" / "Up to date") are intentionally not shown; the dashboard's
// "Recently posted" card already surfaces what got graded.
export default function SyncToast() {
  const { sync } = useAuth()
  if (sync.phase !== 'syncing' || sync.hotDone) return null
  return (
    <div className="sync-toast" role="status">
      <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
      <span>Updating…</span>
    </div>
  )
}
