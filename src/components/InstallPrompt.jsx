import { useEffect, useState } from 'react'
import { Icon } from './icons.jsx'
import { useFocusTrap } from '../hooks/useFocusTrap.js'
import { useInstall } from '../hooks/useInstall.js'

// Set once the prompt has been shown — it never auto-shows again after that
// (Settings keeps a manual Install button). iOS can't tell Safari that the app
// was added to the home screen (separate storage), so repeat nudges there hit
// people who already installed it.
const SEEN_KEY = 'wg_pwa_prompted'
// The old every-4th-load counter. Anyone who has it has already been prompted.
const LEGACY_LOADS_KEY = 'wg_pwa_loads'
// Guards the decision so it happens once per page load (survives StrictMode's
// double-invoke and remounts; resets on a real reload).
let ranThisLoad = false

function alreadyPrompted() {
  try {
    if (localStorage.getItem(LEGACY_LOADS_KEY) !== null) {
      localStorage.removeItem(LEGACY_LOADS_KEY)
      localStorage.setItem(SEEN_KEY, '1')
    }
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch (_) { return true } // no storage = can't remember a dismissal, so don't nag
}

// One-time nudge, after sign-in, to install WebGrades as a home-screen app. On
// iOS Safari there's no programmatic install, so we show the Share -> Add to Home Screen
// steps. On Android/desktop Chrome the shared install singleton captures the
// browser's install event for a real one-tap install (also reused by Settings).
export default function InstallPrompt() {
  const { can, standalone, ios, desktop, promptInstall } = useInstall()
  const [show, setShow] = useState(false)
  const [eligible, setEligible] = useState(false) // not prompted on this device yet

  useEffect(() => {
    if (standalone) return
    if (ranThisLoad) return // decide exactly once per page load
    ranThisLoad = true
    if (!alreadyPrompted()) setEligible(true)
  }, [standalone])

  // iOS gives no install event — show the instructional prompt shortly after load.
  useEffect(() => {
    if (!eligible || standalone || !ios) return
    const t = setTimeout(() => setShow(true), 1200)
    return () => clearTimeout(t)
  }, [eligible, standalone, ios])

  // Android / desktop: pop the prompt once the browser's install signal arrives.
  useEffect(() => {
    if (eligible && !ios && can) setShow(true)
  }, [eligible, ios, can])

  // Shown once, ever: record it the moment it appears, so a reload or a closed
  // tab counts as seen too.
  useEffect(() => {
    if (show) try { localStorage.setItem(SEEN_KEY, '1') } catch (_) {}
  }, [show])

  const dismiss = () => setShow(false)

  const install = async () => { await promptInstall(); dismiss() }

  const trapRef = useFocusTrap(show, dismiss)

  if (!show) return null

  return (
    <>
      <div className="install-backdrop" onClick={dismiss} />
      <div className="install-sheet card" ref={trapRef} role="dialog" aria-modal="true"
        aria-label={desktop ? 'Install WebGrades as an app' : 'Add WebGrades to your home screen'}>
        <div className="install-head">
          <span className="install-logo">W</span>
          <div>
            <div className="install-title">{desktop ? 'Install WebGrades as an app' : 'Add WebGrades to your Home Screen'}</div>
            <div className="install-sub">
              {desktop
                ? 'Opens in its own window — no address bar, instant load, works offline.'
                : 'Opens like a real app — full screen, no address bar, one tap away.'}
            </div>
          </div>
        </div>

        {ios ? (
          <ol className="install-steps">
            <li>Tap the <b>Share</b> button <ShareGlyph /> in Safari's toolbar.</li>
            <li>Scroll down and tap <b>Add to Home Screen</b> <Icon.plus width={15} height={15} style={{ verticalAlign: '-2px' }} />.</li>
            <li>Tap <b>Add</b> — you're done.</li>
          </ol>
        ) : (
          <div className="install-steps" style={{ listStyle: 'none' }}>
            <p style={{ margin: 0 }}>Install it as an app for instant access and offline-friendly loading.</p>
            {desktop && (
              <p className="small faint" style={{ marginTop: 8 }}>
                Tip: after installing, right-click WebGrades in your taskbar or Chromebook shelf and choose <b>Pin</b> so it's always one click away.
              </p>
            )}
          </div>
        )}

        <div className="install-actions">
          <button className="btn ghost sm" onClick={dismiss}>Don't show again</button>
          {!ios && can && <button className="btn sm" onClick={install}>Install app</button>}
        </div>
      </div>
    </>
  )
}

// The iOS Share icon (square with an up arrow) so the instruction is unmistakable.
function ShareGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-3px', color: 'var(--accent-text)' }}>
      <path d="M12 3v12" /><path d="M8 7l4-4 4 4" />
      <path d="M6 12H5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2h-1" />
    </svg>
  )
}
