import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useHacData } from '../hooks/useHacData.js'
import { useGpaMetrics, GPA_METRICS, findMetric } from '../hooks/useGpaMetrics.js'
import { PageHead, Loading, ErrorBox, Empty, GradeBadge } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import { parseGrade } from '../lib/gpa.js'
import { cleanCourseName } from '../lib/courses.js'
import { loadPrefs, savePrefs } from '../lib/prefs.js'

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

// Shows a GPA shortcut (with an editable pinned number) + official rank/GPA.
function TopStats() {
  const { data: rankData, loading: rankLoading } = useHacData('rank', null)

  return (
    <div className="grid grid-3">
      <GpaCard />

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

// The first card: a button to the GPA page. The pencil opens a menu to pin any
// GPA-page number (the cards with a value in them) onto it — computed live.
function GpaCard() {
  const [metricId, setMetricId] = useState(() => loadPrefs().dashboard?.gpaMetric || null)
  const [menuOpen, setMenuOpen] = useState(false)
  const metric = findMetric(metricId)
  const m = useGpaMetrics(metric?.period || 'year')

  const choose = (id) => {
    setMetricId(id)
    const p = loadPrefs()
    p.dashboard = { ...(p.dashboard || {}), gpaMetric: id }
    savePrefs(p)
    setMenuOpen(false)
  }

  // Resolve what the value/label/meta should read for the pinned metric.
  let label = 'Your GPA', meta = 'Weighted · semester · cumulative', value = 'open'
  if (metric) {
    label = metric.label
    meta = metric.sub
    const notReady = metric.view === 'live' ? !m.ready : !m.hasTranscript
    if (metric.view === 'cumulative' && !m.cumConfirmed) value = 'setup'
    else if (notReady) value = null            // show skeleton
    else value = metric.pick(m)
  }

  return (
    <div className="stat-pick">
      <Link to="/gpa" className="card stat card-link" style={{ flexDirection: 'column' }}>
        <span className="glow" style={{ background: 'var(--accent)' }} />
        <span className="label">{label}</span>
        {value === null
          ? <span className="value skeleton" style={{ height: 34, width: 120 }} />
          : value === 'open'
            ? <span className="value" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>Open <Icon.chevron width={26} height={26} /></span>
            : value === 'setup'
              ? <span className="value" style={{ fontSize: 22 }}>Set up →</span>
              : <span className="value">{value}</span>}
        <span className="meta">{meta}</span>
      </Link>

      <button className="card-edit" title="Choose what this shows"
        onClick={(e) => { e.preventDefault(); setMenuOpen((o) => !o) }}>
        <Icon.edit width={15} height={15} />
      </button>

      {menuOpen && (
        <>
          <div className="profile-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="card card-menu">
            <div className="menu-head">Show on this card</div>
            <button className={`menu-item ${!metricId ? 'active' : ''}`} onClick={() => choose(null)}>
              <span className="mi-text"><span className="mi-name">Just a link</span><span className="mi-sub">Opens the GPA page</span></span>
              {!metricId && <Icon.check width={16} height={16} className="profile-check" />}
            </button>
            <div className="menu-divider" />
            {GPA_METRICS.map((opt) => (
              <button key={opt.id} className={`menu-item ${metricId === opt.id ? 'active' : ''}`} onClick={() => choose(opt.id)}>
                <span className="mi-text"><span className="mi-name">{opt.label}</span><span className="mi-sub">{opt.sub}</span></span>
                {metricId === opt.id && <Icon.check width={16} height={16} className="profile-check" />}
              </button>
            ))}
          </div>
        </>
      )}
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
