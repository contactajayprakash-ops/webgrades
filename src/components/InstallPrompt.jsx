import { useEffect, useState } from 'react'
import { Icon } from './icons.jsx'
import { useFocusTrap } from '../hooks/useFocusTrap.js'

// Load counter (new key = every existing user is reset and sees the prompt again).
const LOADS_KEY = 'wg_pwa_loads'
// Guards the count/show so it happens once per page load (survives StrictMode's
// double-invoke and the login->authed remount; resets on a real reload).
let ranThisLoad = false

const isIos = () => /iphone|ipod|ipad/i.test(navigator.userAgent || '')
const isAndroid = () => /android/i.test(navigator.userAgent || '')
// Already launched from the home screen? Then never prompt.
const isStandalone = () =>
  window.navigator.standalone === true ||
  window.matchMedia?.('(display-mode: standalone)')?.matches === true

// Show on the 1st and 2nd load; if they keep not installing, re-nudge every
// 4th load after that (6, 10, 14, …). Stops for good once launched standalone.
const shouldShowOnLoad = (n) => n <= 2 || (n - 2) % 4 === 0

// First-load nudge to install WebGrades as a home-screen app. On iOS Safari
// there's no programmatic install, so we show the Share -> Add to Home Screen
// steps. On Android/desktop Chrome we capture beforeinstallprompt for a real
// one-tap install.
export default function InstallPrompt() {
  const [show, setShow] = useState(false)
  const [deferred, setDeferred] = useState(null) // Android/Chrome install event
  const ios = isIos()
  // Chromebook / Windows / Mac / Linux — has a taskbar or shelf you can pin to,
  // so we say "install as an app" instead of the phone-only "Home Screen".
  const desktop = !ios && !isAndroid()

  useEffect(() => {
    if (isStandalone()) return
    if (ranThisLoad) return // count/decide exactly once per page load
    ranThisLoad = true

    let n = 1
    try {
      n = (parseInt(localStorage.getItem(LOADS_KEY) || '0', 10) || 0) + 1
      localStorage.setItem(LOADS_KEY, String(n))
    } catch (_) {}
    if (!shouldShowOnLoad(n)) return

    if (ios) {
      // iOS gives no install event — show the instructional prompt shortly after load.
      const t = setTimeout(() => setShow(true), 1200)
      return () => clearTimeout(t)
    }
    // Android / desktop Chrome: wait for the browser's install signal.
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); setShow(true) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [ios])

  // "Never mind" just closes for this load — the load counter drives whether it
  // comes back (first two loads, then every fourth), so we don't set a flag.
  const dismiss = () => setShow(false)

  const install = async () => {
    if (!deferred) return
    deferred.prompt()
    try { await deferred.userChoice } catch (_) {}
    setDeferred(null)
    dismiss()
  }

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
          <button className="btn ghost sm" onClick={dismiss}>Never mind</button>
          {!ios && deferred && <button className="btn sm" onClick={install}>Install app</button>}
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
