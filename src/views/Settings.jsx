import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { getApiUrl, setApiUrl } from '../api/hac.js'
import { PageHead } from '../components/ui.jsx'
import { detectWeight, weightLabel, weightTagClass } from '../lib/gpa.js'

export default function Settings() {
  const { session, clearCache, logout } = useAuth()
  const [apiUrl, setApiUrlState] = useState(getApiUrl())
  const [saved, setSaved] = useState(false)
  const [test, setTest] = useState('AP Biology')

  const save = () => {
    setApiUrl(apiUrl)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <>
      <PageHead title="Settings" sub="Configure the API and manage your session." />

      <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="card card-pad">
          <h3 className="mb-3">API endpoint</h3>
          <div className="field">
            <label>Base URL</label>
            <input className="input" value={apiUrl} onChange={(e) => setApiUrlState(e.target.value)} />
            <span className="small faint">Where your HAC scraping API is hosted. Stored in this browser only.</span>
          </div>
          <div className="flex mt-3">
            <button className="btn sm" onClick={save}>Save</button>
            {saved && <span className="small" style={{ color: 'var(--green)' }}>Saved ✓</span>}
          </div>
        </div>

        <div className="card card-pad">
          <h3 className="mb-3">Weight detector</h3>
          <p className="small faint" style={{ marginTop: 0 }}>
            Type a class name to see which weight WebGrades would auto-assign. You can always override it in the GPA Calculator.
          </p>
          <div className="field" style={{ maxWidth: 360 }}>
            <input className="input" value={test} onChange={(e) => setTest(e.target.value)} placeholder="e.g. Pre-AP Chemistry" />
          </div>
          <div className="flex mt-3">
            <span className="muted">Detected weight:</span>
            <span className={`grade-badge ${weightTagClass(detectWeight(test))}`} style={{ background: 'var(--bg)' }}>
              {detectWeight(test)} · {weightLabel(detectWeight(test))}
            </span>
          </div>
          <div className="small faint mt-3">
            Rules: <b>AP / IB / Dual Credit → 6.0</b> · <b>PAP / GT / Honors / Advanced → 5.5</b> · everything else → 5.0
          </div>
        </div>

        <div className="card card-pad">
          <h3 className="mb-3">Session</h3>
          <div className="small muted">
            Signed in as <b>{session?.userName}</b>{' '}
            ({session?.remember ? 'remembered on this device' : 'this session only'}).
          </div>
          <div className="flex mt-3 flex-wrap">
            <button className="btn ghost sm" onClick={clearCache}>Clear cached data</button>
            <button className="btn ghost sm" onClick={logout} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
              Sign out
            </button>
          </div>
          <div className="notice mt-3">
            Your HAC credentials are sent to your own API to scrape grades and are never shared with anyone else.
          </div>
        </div>
      </div>
    </>
  )
}
