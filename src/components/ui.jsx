import { Icon } from './icons.jsx'
import { letterGrade } from '../lib/gpa.js'

export function GradeBadge({ value, showLetter = true }) {
  // value: number | null
  const { letter, cls } = letterGrade(value)
  const text = value == null ? 'N/A' : `${value % 1 === 0 ? value : value.toFixed(2)}%`
  return (
    <span className={`grade-badge ${cls}`}>
      {text}
      {showLetter && value != null && <span className="letter">{letter}</span>}
    </span>
  )
}

export function Loading({ label = 'Loading from HAC…' }) {
  return (
    <div className="center-load">
      <div className="spinner" />
      <div>{label}</div>
      <div className="small faint">First load can take a few seconds — the API logs into HAC live.</div>
    </div>
  )
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="error-box">
      <Icon.alert width={18} height={18} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1 }}>
        <div>{message}</div>
        {onRetry && (
          <button className="btn ghost sm mt-2" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {children && <div className="flex flex-wrap">{children}</div>}
    </div>
  )
}
