import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { getApiUrl, setApiUrl } from '../api/hac.js'
import { ErrorBox } from './ui.jsx'
import { Icon } from './icons.jsx'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [showApi, setShowApi] = useState(false)
  const [apiUrl, setApiUrlState] = useState(getApiUrl())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!username || !password) {
      setError('Enter your HAC username and password.')
      return
    }
    setApiUrl(apiUrl)
    setLoading(true)
    try {
      await login(username.trim(), password, remember)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="brand">
          <span className="logo">W</span>
          <span>Web<span className="accent">Grades</span></span>
        </div>
        <p className="tagline">A faster, cleaner window into HAC — with real GPA.</p>

        <form className="login-form" onSubmit={submit}>
          {error && <ErrorBox message={error} />}

          <div className="field">
            <label>HAC Username</label>
            <input
              className="input"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="s123456"
              autoFocus
            />
          </div>

          <div className="field">
            <label>HAC Password</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <label className="checkbox">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember me on this device
          </label>
          {remember && (
            <div className="notice">
              Heads up: your credentials are stored in this browser. Don’t use this on a shared Chromebook.
            </div>
          )}

          <button className="btn" disabled={loading} type="submit">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <button
            type="button"
            className="flex small faint"
            style={{ background: 'none', border: 'none', alignSelf: 'center' }}
            onClick={() => setShowApi((s) => !s)}
          >
            <Icon.settings width={14} height={14} /> API settings
          </button>

          {showApi && (
            <div className="field">
              <label>API base URL</label>
              <input
                className="input"
                value={apiUrl}
                onChange={(e) => setApiUrlState(e.target.value)}
                placeholder="https://your-api.repl.co"
              />
              <span className="small faint">Saved in this browser. Change anytime after deploy.</span>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
