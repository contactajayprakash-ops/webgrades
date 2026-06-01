import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useHacData } from '../hooks/useHacData.js'
import { PageHead, Loading, ErrorBox, Empty, GradeBadge } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import { detectWeight, parseGrade, weightedGpa, roundGrade, fmtGpa } from '../lib/gpa.js'
import { cleanCourseName, SEMESTERS } from '../lib/courses.js'

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
  const first = (name || '').replace(/,/g, '').trim().split(/\s+/).slice(-1)[0]
  return first ? `Hey, ${first} 👋` : 'Dashboard'
}

// Computes the live semester GPA + shows official rank/GPA side by side.
function TopStats() {
  const { getData } = useAuth()
  const { data: rankData, loading: rankLoading, error: rankErr } = useHacData('rank', null)
  const [gpa, setGpa] = useState(null)
  const [gpaLoading, setGpaLoading] = useState(true)
  const [gpaErr, setGpaErr] = useState(null)

  const computeGpa = useCallback(async () => {
    setGpaLoading(true); setGpaErr(null)
    try {
      // Pick the most recent semester that actually has grades.
      for (const sem of [...SEMESTERS].reverse()) {
        const results = await Promise.all(
          sem.quarters.map((q) => getData('class', { quarter: q }).catch(() => null))
        )
        const rows = []
        const seen = new Map()
        for (const d of results) {
          for (const c of d?.assignmentsData || []) {
            const g = parseGrade(c.overallAverage)
            if (g == null) continue
            if (!seen.has(c.courseName)) seen.set(c.courseName, [])
            seen.get(c.courseName).push(g)
          }
        }
        for (const [name, grades] of seen) {
          const avg = roundGrade(grades.reduce((a, b) => a + b, 0) / grades.length)
          rows.push({ grade: avg, weight: detectWeight(name), credit: 0.5, include: true })
        }
        if (rows.length) {
          setGpa({ ...weightedGpa(rows), sem: sem.label, count: rows.length })
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
  }, [getData])

  useEffect(() => { computeGpa() }, [computeGpa])

  return (
    <div className="grid grid-3">
      <div className="card stat">
        <span className="glow" style={{ background: 'var(--accent)' }} />
        <span className="label">Weighted GPA</span>
        {gpaLoading ? <span className="value skeleton" style={{ height: 34, width: 120 }} />
          : gpaErr ? <span className="value" style={{ fontSize: 18, color: 'var(--red)' }}>—</span>
          : gpa ? <span className="value">{fmtGpa(gpa.gpa)}</span>
          : <span className="value" style={{ fontSize: 20 }}>N/A</span>}
        <span className="meta">
          {gpa ? `${gpa.sem} · ${gpa.count} classes · calculated` : 'live from quarter grades'}
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
