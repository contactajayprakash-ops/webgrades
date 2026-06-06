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
