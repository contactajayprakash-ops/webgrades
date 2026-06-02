import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { Icon } from './icons.jsx'

// Non-blocking, bottom-right glass toast that reports the background sync.
// Never hides page content — the app shows cached data immediately while this runs.
export default function SyncToast() {
  const { sync, dismissSync } = useAuth()
  const [hidden, setHidden] = useState(false)

  // reset the local hide whenever a new sync starts
  useEffect(() => { if (sync.phase === 'syncing') setHidden(false) }, [sync.phase])

  // auto-dismiss the "up to date" result
  useEffect(() => {
    if (sync.phase === 'done' && sync.changes.length === 0) {
      const t = setTimeout(() => { setHidden(true); dismissSync() }, 3200)
      return () => clearTimeout(t)
    }
  }, [sync.phase, sync.changes.length, dismissSync])

  if (sync.phase === 'idle' || hidden) return null

  const close = () => { setHidden(true); dismissSync() }

  if (sync.phase === 'syncing') {
    return (
      <div className="sync-toast">
        <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
        <span>{sync.initial ? 'Loading your data…' : 'Checking for updates…'}</span>
        <span className="sync-count">{sync.done}/{sync.total}</span>
      </div>
    )
  }

  // done
  if (sync.changes.length === 0) {
    return (
      <div className="sync-toast ok">
        <Icon.check width={16} height={16} />
        <span>{sync.initial ? 'All data loaded' : 'Up to date'}</span>
      </div>
    )
  }

  const shown = sync.changes.slice(0, 6)
  const extra = sync.changes.length - shown.length
  return (
    <div className="sync-toast changes">
      <div className="sync-toast-head">
        <span className="flex" style={{ gap: 8 }}>
          <Icon.refresh width={15} height={15} />
          <b>{sync.changes.length} update{sync.changes.length > 1 ? 's' : ''}</b>
        </span>
        <button className="sync-x" onClick={close} aria-label="Dismiss">✕</button>
      </div>
      <ul className="sync-list">
        {shown.map((c, i) => <li key={i}>{c}</li>)}
        {extra > 0 && <li className="faint">+{extra} more…</li>}
      </ul>
    </div>
  )
}
