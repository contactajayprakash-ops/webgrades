import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { ErrorBox } from './ui.jsx'
import Glass from './Glass.jsx'

export default function Login() {
  // Googlebot renders JS and indexes the *rendered* title, so the signed-out
  // page keeps the full search title from index.html instead of a short tab
  // label. Set it explicitly so signing out of the app restores it too.
  useEffect(() => { document.title = 'WebGrades — Frisco ISD HAC Grades & Weighted GPA Calculator' }, [])

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
      <Glass className="card login-card" config={{ material: 'thick', borderRadius: 20 }}>
        {/* h1 so the rendered page has a real heading; .brand sets its look. */}
        <h1 className="brand">
          <span className="logo">W</span>
          <span>Web<span className="accent">Grades</span></span>
        </h1>
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
        <p className="small faint" style={{ textAlign: 'center', marginTop: 18, position: 'relative', zIndex: 1 }}>
          Free and unofficial for Frisco ISD Home Access Center. Not affiliated with Frisco ISD.
        </p>
      </Glass>
    </div>
  )
}
