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

// Tiny inline-SVG trend line for a series of (nullable) numbers — e.g. a class's
// Q1..Q4 grades. Colors green if the last point is up vs the first, red if down.
export function Sparkline({ values, width = 76, height = 24, domain }) {
  const pts = (values || []).map((v, i) => ({ v, i })).filter((p) => p.v != null)
  if (pts.length < 2) return <span className="faint small">—</span>
  const nums = pts.map((p) => p.v)
  const lo = domain ? domain[0] : Math.min(...nums)
  const hi = domain ? domain[1] : Math.max(...nums)
  const span = hi - lo || 1
  const n = (values.length - 1) || 1
  const x = (i) => (i / n) * (width - 4) + 2
  const y = (v) => height - 3 - ((v - lo) / span) * (height - 6)
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const first = pts[0].v, last = pts[pts.length - 1].v
  const stroke = last > first ? 'var(--green-text)' : last < first ? 'var(--red-text)' : 'var(--text-faint)'
  const lastP = pts[pts.length - 1]
  return (
    <svg width={width} height={height} style={{ display: 'block' }} aria-hidden="true">
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(lastP.i)} cy={y(lastP.v)} r="2.4" fill={stroke} />
    </svg>
  )
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
