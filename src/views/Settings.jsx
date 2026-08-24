import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { PageHead } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import Segmented from '../components/Segmented.jsx'
import { ACCENTS, loadTheme, saveTheme } from '../lib/theme.js'
import { useInstall } from '../hooks/useInstall.js'

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

        {/* Dashboard */}
        <div className="card card-pad">
          <h3 className="mb-3">Dashboard</h3>
          <ToggleRow
            label="Recently posted grades"
            hint="Show a feed at the top of the dashboard of grades that changed since your last visit — so you can tell something posted without opening each class."
            checked={theme.showRecent}
            onChange={(v) => update({ showRecent: v })}
          />

          <div className="field mt-3">
            <label>Class rank card</label>
            <Segmented
              style={{ marginTop: 4, alignSelf: 'flex-start' }}
              value={theme.rankCard || 'show'}
              onChange={(v) => update({ rankCard: v })}
              ariaLabel="Class rank card"
              options={[{ value: 'show', label: 'Show' }, { value: 'blur', label: 'Hide rank' }, { value: 'upcoming', label: 'Upcoming' }]}
            />
            <span className="small faint">
              <b>Hide rank</b> blurs your rank number (tap it to peek). <b>Upcoming</b> replaces the card with what's due, from your agenda and this week.
            </span>
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

        {/* Install */}
        <InstallSection />

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

// Install WebGrades as an app — always reachable here, even if the first-load
// popup was dismissed. Adapts to the platform's install capabilities.
function InstallSection() {
  const { can, installed, ios, desktop, promptInstall } = useInstall()
  return (
    <div className="card card-pad">
      <h3 className="mb-3">Install</h3>
      {installed ? (
        <div className="small muted">WebGrades is installed on this device — you're all set.</div>
      ) : (
        <div className="row-between" style={{ gap: 16 }}>
          <div>
            <div style={{ fontWeight: 600 }}>Install WebGrades as an app</div>
            <div className="small faint">
              Opens in its own window and works offline.{' '}
              {desktop ? 'After installing, right-click it in your taskbar or shelf and Pin it.' : 'One tap from your home screen.'}
            </div>
          </div>
          {ios ? (
            <span className="small faint" style={{ textAlign: 'right', minWidth: 150 }}>
              In Safari: tap <b>Share</b>, then <b>Add to Home Screen</b>.
            </span>
          ) : can ? (
            <button className="btn sm" onClick={promptInstall} style={{ flexShrink: 0 }}>
              <Icon.plus width={15} height={15} /> Install
            </button>
          ) : (
            <span className="small faint" style={{ textAlign: 'right', minWidth: 150 }}>
              Use your browser's <b>Install app</b> option in the address bar or menu.
            </span>
          )}
        </div>
      )}
    </div>
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
