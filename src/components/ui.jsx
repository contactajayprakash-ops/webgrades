import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons.jsx'
import { letterGrade } from '../lib/gpa.js'
import { useWhatIf } from '../context/WhatIfContext.jsx'

// Global indicator shown wherever GPAs appear, whenever what-if edits are active.
export function WhatIfBanner() {
  const { count, reset } = useWhatIf()
  if (!count) return null
  return (
    <div className="whatif-banner">
      <Icon.beaker width={17} height={17} />
      <span>
        <b>What-if mode</b> — {count} assignment {count === 1 ? 'change' : 'changes'} applied. Every GPA below shows the
        estimated result, not your real grades.
      </span>
      <button className="btn ghost sm" onClick={reset} style={{ marginLeft: 'auto' }}>Reset all</button>
    </div>
  )
}

export function GradeBadge({ value, showLetter = true }) {
  // value: number | null
  const { letter, cls } = letterGrade(value)
  const text = value == null ? 'N/A' : `${value % 1 === 0 ? value : value.toFixed(2)}%`

  // Flash when the grade changes under us (a fresh score just synced in) so the
  // new number is impossible to miss — green if it went up, red if it dropped.
  const prev = useRef(value)
  const [flash, setFlash] = useState(null)
  useEffect(() => {
    const p = prev.current
    if (p != null && value != null && Math.abs(value - p) > 1e-9) {
      setFlash(value > p ? 'up' : 'down')
      const t = setTimeout(() => setFlash(null), 1800)
      prev.current = value
      return () => clearTimeout(t)
    }
    prev.current = value
  }, [value])

  return (
    <span className={`grade-badge ${cls}${flash ? ` flash-${flash}` : ''}`}>
      {text}
      {showLetter && value != null && <span className="letter">{letter}</span>}
    </span>
  )
}

const LOADING_QUIPS = [
  'Logging into HAC for you…',
  'Scraping your grades out of HAC…',
  'Doing the GPA math HAC refuses to…',
  'Beating the Chromebook experience…',
  'Rounding grades…',
  'Averaging your quarters…',
  'Politely asking HAC to hurry up…',
  'Crunching weighted + unweighted…',
  'Almost there — HAC is slow, not us…',
]

export function Loading({ label = 'Loading from HAC…' }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % LOADING_QUIPS.length), 2200)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="center-load">
      <div className="loadbar" />
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div className="small faint loading-quip" key={i}>{LOADING_QUIPS[i]}</div>
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
