import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { WhatIfProvider } from './context/WhatIfContext.jsx'
import { applyTheme, loadTheme } from './lib/theme.js'
import './index.css'

// Apply saved appearance prefs before first paint (defaults = original look).
applyTheme(loadTheme())

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
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <WhatIfProvider>
          <App />
        </WhatIfProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
