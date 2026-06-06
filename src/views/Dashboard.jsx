import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useHacData } from '../hooks/useHacData.js'
import { PageHead, Loading, ErrorBox, Empty, GradeBadge } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import { parseGrade } from '../lib/gpa.js'
import { cleanCourseName } from '../lib/courses.js'

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
  const { data: rankData, loading: rankLoading } = useHacData('rank', null)

  return (
    <div className="grid grid-3">
      <Link to="/gpa" className="card stat card-link">
        <span className="glow" style={{ background: 'var(--accent)' }} />
        <span className="label">Your GPA</span>
        <span className="value" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          Open <Icon.chevron width={26} height={26} />
        </span>
        <span className="meta">Weighted · semester · cumulative</span>
      </Link>

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
