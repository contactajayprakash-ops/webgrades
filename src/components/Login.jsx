import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { ErrorBox } from './ui.jsx'

export default function Login() {
  // Short tab title for users. The full SEO title stays in index.html's <title>
  // (what crawlers read from the served HTML); we only override the visible tab.
  useEffect(() => { document.title = 'WebGrades - Login' }, [])

  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!username || !password) {
      setError('Enter your HAC username and password.')
      return
    }
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
        </form>
      </div>
    </div>
  )
}
