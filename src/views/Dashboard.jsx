import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useWhatIf } from '../context/WhatIfContext.jsx'
import { useHacData } from '../hooks/useHacData.js'
import { PageHead, Loading, ErrorBox, Empty, GradeBadge } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import { detectWeight, parseGrade, weightedGpa, roundGrade, fmtGpa } from '../lib/gpa.js'
import { cleanCourseName, courseKey, QUARTERS } from '../lib/courses.js'
import { effectiveAverage } from '../lib/whatif.js'
import { loadPrefs } from '../lib/prefs.js'

export default function Dashboard() {
  const { userName } = useAuth()

  return (
    <>
      <PageHead title={greeting(userName)} sub="Your grades at a glance." />
      <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
        <TopStats />
        <CurrentClasses />
      </div>
    </>
  )
}

function greeting(name) {
  if (!name) return 'Dashboard'
  
  // If the name contains a comma (e.g., "Prakash, Ajay"), 
  // split by the comma and take the second part (the first name).
  if (name.includes(',')) {
    const parts = name.split(',')
    const firstName = parts[1].trim().split(/\s+/)[0]
    return `Hey, ${firstName} 👋`
  }
  
  // Fallback for standard "First Last" formatting
  const first = name.trim().split(/\s+/)[0]
  return first ? `Hey, ${first} 👋` : 'Dashboard'
}

// Shows the latest quarter's weighted GPA + official rank/GPA side by side.
function TopStats() {
  const { getData, peekData, dataVersion } = useAuth()
  const { edits, count: whatIfCount } = useWhatIf()
  const { data: rankData, loading: rankLoading, error: rankErr } = useHacData('rank', null)
  const [gpa, setGpa] = useState(null)
  const [gpaLoading, setGpaLoading] = useState(true)
  const [gpaErr, setGpaErr] = useState(null)

  const computeGpa = useCallback(async () => {
    const warm = ['1', '2', '3', '4'].some((q) => peekData('class', { quarter: q }))
    if (!warm) setGpaLoading(true)
    setGpaErr(null)
    try {
      const prefs = loadPrefs()
      // Walk from the latest quarter back to the first; use the latest that has grades.
      for (const q of [...QUARTERS].reverse()) {
        const d = await getData('class', { quarter: q.value }).catch(() => null)
        const rows = (d?.assignmentsData || []).map((c) => {
          const avg = roundGrade(effectiveAverage(q.value, c, edits).avg)
          return { grade: avg, weight: prefs.weights[courseKey(c.courseName)] ?? detectWeight(c.courseName), credit: 0.5, include: avg != null }
        }).filter((r) => r.grade != null)
        if (rows.length) {
          setGpa({ ...weightedGpa(rows), label: q.label, count: rows.length })
          setGpaLoading(false)
          return
        }
      }
      setGpa(null)
    } catch (e) {
      setGpaErr(e.message)
    } finally {
      setGpaLoading(false)
    }
  }, [getData, peekData, edits, dataVersion])

  useEffect(() => { computeGpa() }, [computeGpa])

  return (
    <div className="grid grid-3">
      <div className="card stat">
        <span className="glow" style={{ background: 'var(--accent)' }} />
        <span className="label">Weighted GPA {whatIfCount > 0 && <em style={{ color: 'var(--yellow)' }}>· what-if</em>}</span>
        {gpaLoading ? <span className="value skeleton" style={{ height: 34, width: 120 }} />
          : gpaErr ? <span className="value" style={{ fontSize: 18, color: 'var(--red)' }}>—</span>
          : gpa ? <span className="value">{fmtGpa(gpa.gpa)}</span>
          : <span className="value" style={{ fontSize: 20 }}>N/A</span>}
        <span className="meta">
          {gpa ? `${gpa.label} · ${gpa.count} classes · current quarter` : 'latest quarter grades'}
          {' · '}<Link to="/gpa" style={{ color: 'var(--accent)' }}>details →</Link>
        </span>
      </div>

      <div className="card stat">
        <span className="label">Official GPA</span>
        {rankLoading ? <span className="value skeleton" style={{ height: 34, width: 100 }} />
          : <span className="value">{rankData?.gpa || '—'}</span>}
        <span className="meta">from HAC transcript</span>
      </div>

      <div className="card stat">
        <span className="label">Class Rank</span>
        {rankLoading ? <span className="value skeleton" style={{ height: 34, width: 100 }} />
          : <span className="value">{rankData?.rank ? `#${rankData.rank}` : '—'}</span>}
        <span className="meta">{rankData?.outOf ? `out of ${rankData.outOf}` : 'rank in class'}</span>
      </div>
    </div>
  )
}

function CurrentClasses() {
  const { data, loading, error, refresh } = useHacData('class', null)
  const classes = data?.assignmentsData || []

  return (
    <div className="card">
      <div className="row-between" style={{ padding: '16px 20px' }}>
        <h3>Current grades</h3>
        <Link to="/grades" className="btn ghost sm">View all <Icon.chevron width={14} height={14} /></Link>
      </div>
      {loading && <Loading label="Loading classes…" />}
      {error && !loading && <ErrorBox message={error} onRetry={refresh} />}
      {!loading && !error && classes.length === 0 && <Empty>No current classes found.</Empty>}
      {!loading && !error && classes.length > 0 && (
        <table className="table">
          <thead>
            <tr><th>Class</th><th>Teacher hint</th><th className="num">Average</th></tr>
          </thead>
          <tbody>
            {classes.map((c, i) => (
              <tr key={i}>
                <td>{cleanCourseName(c.courseName)}</td>
                <td className="faint small">{(c.assignments?.length || 0)} assignments</td>
                <td className="num"><GradeBadge value={parseGrade(c.overallAverage)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
