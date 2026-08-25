import { useEffect } from 'react'

const NEW_URL = 'https://webgrades.firebaseapp.com'

// True when served from the retired Vercel deployment. The app now lives on
// CloudFront + Firebase Hosting; Vercel links/installs are stale and blocked at
// school. Detect the old origin and send people to the new one.
export function isRetiredHost() {
  try { return /\.vercel\.app$/i.test(window.location.hostname) } catch (_) { return false }
}

const isStandalone = () =>
  (typeof navigator !== 'undefined' && navigator.standalone === true) ||
  window.matchMedia?.('(display-mode: standalone)')?.matches === true

export default function MovedNotice() {
  const standalone = isStandalone()

  // Auto-forward a browser tab. Don't auto-forward the installed app — that
  // wouldn't fix the install (it's still bound to the old address); they need to
  // remove and reinstall from the new link.
  useEffect(() => {
    if (standalone) return
    const t = setTimeout(() => { window.location.replace(NEW_URL) }, 3500)
    return () => clearTimeout(t)
  }, [standalone])

  return (
    <div className="login-wrap">
      <div className="card card-pad" style={{ maxWidth: 460, textAlign: 'center' }}>
        <span className="install-logo" style={{ margin: '0 auto 12px' }}>W</span>
        <h1 style={{ marginBottom: 8 }}>WebGrades moved</h1>

        {standalone ? (
          <>
            <p className="muted" style={{ marginBottom: 14 }}>
              This installed app is on the old address — it won’t get updates and is blocked on school Wi-Fi.
              Please remove it and reinstall from the new link:
            </p>
            <ol className="install-steps" style={{ textAlign: 'left' }}>
              <li>Press and hold the <b>WebGrades</b> icon on your home screen → <b>Remove App</b> → Delete.</li>
              <li>Open <b>webgrades.firebaseapp.com</b> in Safari (tap the button below).</li>
              <li>Tap <b>Share</b> → <b>Add to Home Screen</b>.</li>
            </ol>
            <a className="btn" href={NEW_URL} style={{ marginTop: 6 }}>Open the new site</a>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginBottom: 16 }}>
              This address is retired (and blocked on school Wi-Fi). Use the new link — please update your bookmark:
            </p>
            <a className="btn" href={NEW_URL}>Go to WebGrades →</a>
            <p className="small faint" style={{ marginTop: 12 }}>Taking you there automatically…</p>
          </>
        )}
      </div>
    </div>
  )
}
