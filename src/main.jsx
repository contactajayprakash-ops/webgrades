import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { WhatIfProvider } from './context/WhatIfContext.jsx'
import { applyTheme, loadTheme } from './lib/theme.js'
import './index.css'

// Apply saved appearance prefs before first paint (defaults = original look).
applyTheme(loadTheme())

// Number <input>s change their value on mouse-wheel scroll by default — so
// scrolling the page while a grade field is focused silently edits it (buggy and
// surprising). Blur any focused number input on wheel: the value never changes
// and the page scrolls normally. Global so it covers every number field (Grades,
// GPA, what-if).
if (typeof document !== 'undefined') {
  document.addEventListener('wheel', () => {
    const el = document.activeElement
    if (el && el.tagName === 'INPUT' && el.type === 'number') el.blur()
  }, { passive: true })
}

// Auto-refresh on deploy: registerType is 'autoUpdate' (skipWaiting + clientsClaim),
// so a new build's service worker activates and takes control on the next load —
// but the OPEN tab keeps running the old JS until it reloads. Without this, people
// stay on a stale build (seeing already-fixed bugs) until they manually refresh.
// Reload once when a new SW takes control; skip the very first install (no prior
// controller) and guard against reload loops.
if ('serviceWorker' in navigator) {
  let reloading = false
  const hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return
    reloading = true
    window.location.reload()
  })

  // Browsers only re-check sw.js on navigation, and this is a single-page app
  // that never navigates — so a pinned app window left open for days would never
  // notice a deploy. Check whenever the window comes back into view (throttled),
  // which is also the least disruptive moment for the reload above to happen.
  const UPDATE_EVERY_MS = 30 * 60 * 1000
  let lastCheck = Date.now()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < UPDATE_EVERY_MS) return
    lastCheck = Date.now()
    navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {})
  })
}

// A lazy route chunk failed to load — almost always because a deploy deleted the
// old hashed files this tab still points at (no SW controlling it, or a hard
// reload). Reload once to pick up the new build instead of blanking the page.
// The sessionStorage stamp stops a loop if the chunk is genuinely unreachable
// (or we're offline, where a reload without the SW would only show the browser's
// offline page); then the error falls through to the ErrorBoundary.
window.addEventListener('vite:preloadError', (e) => {
  if (navigator.onLine === false) return
  const KEY = 'wg_chunk_reload'
  let last = 0
  try { last = Number(sessionStorage.getItem(KEY)) || 0 } catch (_) {}
  if (Date.now() - last < 10_000) return
  try { sessionStorage.setItem(KEY, String(Date.now())) } catch (_) {}
  e.preventDefault()
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <WhatIfProvider>
            <App />
          </WhatIfProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
