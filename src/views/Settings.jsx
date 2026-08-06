import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { PageHead } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import Segmented from '../components/Segmented.jsx'
import { ACCENTS, loadTheme, saveTheme } from '../lib/theme.js'

export default function Settings() {
  const { session, clearCache, logout } = useAuth()
  const [theme, setTheme] = useState(loadTheme)

  // every change persists + applies to the live document immediately
  const update = (patch) => {
    const next = { ...theme, ...patch }
    setTheme(next)
    saveTheme(next)
  }

  return (
    <>
      <PageHead title="Settings" sub="Make WebGrades yours — appearance, performance, and your session." />

      <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
        {/* Appearance */}
        <div className="card card-pad">
          <h3 className="mb-3">Appearance</h3>

          <div className="field">
            <label>Theme</label>
            <Segmented
              style={{ marginTop: 4, alignSelf: 'flex-start' }}
              value={theme.theme}
              onChange={(v) => update({ theme: v })}
              ariaLabel="Theme"
              options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]}
            />
          </div>

          <div className="field mt-3">
            <label>Accent color</label>
            <div className="swatches">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  className={`swatch ${theme.accentId === a.id ? 'active' : ''}`}
                  title={a.label}
                  aria-label={a.label}
                  onClick={() => update({ accentId: a.id })}
                  style={{ background: `linear-gradient(150deg, ${a.accent}, ${a.accent2})` }}
                >
                  {theme.accentId === a.id && <Icon.check width={16} height={16} />}
                </button>
              ))}
            </div>
            <span className="small faint">Recolors every accent across the app — and the browser tab icon.</span>
          </div>
        </div>

        {/* Performance */}
        <div className="card card-pad">
          <h3 className="mb-3">Performance</h3>
          <ToggleRow
            label="Reduce blur"
            hint="Lighter glass — smoother on Chromebooks and older devices."
            checked={theme.reduceBlur}
            onChange={(v) => update({ reduceBlur: v })}
          />
          <div style={{ height: 14 }} />
          <ToggleRow
            label="Reduce motion"
            hint="Turn off background and UI animations."
            checked={theme.reduceMotion}
            onChange={(v) => update({ reduceMotion: v })}
          />
        </div>

        {/* Session */}
        <div className="card card-pad">
          <h3 className="mb-3">Session</h3>
          <div className="small muted">
            Signed in as <b>{session?.userName}</b>{' '}
            ({session?.remember ? 'remembered on this device' : 'this session only'}).
          </div>
          <div className="flex mt-3 flex-wrap">
            <button className="btn ghost sm" onClick={clearCache}>Clear cached data</button>
            <button className="btn ghost sm" onClick={logout} style={{ borderColor: 'var(--red)', color: 'var(--red-text)' }}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <div className="row-between" style={{ gap: 16 }}>
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div className="small faint">{hint}</div>
      </div>
      <button className={`switch ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
        <span className="knob" />
      </button>
    </div>
  )
}
