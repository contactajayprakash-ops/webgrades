import { useHacData } from '../hooks/useHacData.js'
import { PageHead, Loading, ErrorBox, Empty, GradeBadge } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import { parseGrade } from '../lib/gpa.js'
import { cleanCourseName } from '../lib/courses.js'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

// This week's assignments, grouped by weekday. HAC's WeekView returns each
// class with its assignments tagged by dayIndex (0=Mon…4=Fri). Off-season this
// is empty, so the page shows a friendly empty state.
export default function Week() {
  const { data, loading, error, refresh } = useHacData('week', null)
  const classes = data?.classes || []

  // Flatten to { day -> [{ course, title, grade }] }
  const byDay = DAYS.map(() => [])
  let total = 0
  for (const c of classes) {
    for (const a of c.assignments || []) {
      const di = Number(a.dayIndex)
      if (di >= 0 && di < DAYS.length) {
        byDay[di].push({ course: cleanCourseName(c.course), title: a.title, grade: a.grade })
        total++
      }
    }
  }

  return (
    <>
      <PageHead title="This Week" sub="Assignments due and graded this week, by day.">
        <button className="btn ghost sm" onClick={refresh}><Icon.refresh width={15} height={15} /> Refresh</button>
      </PageHead>

      {loading && <Loading label="Loading this week…" />}
      {error && !loading && <ErrorBox message={error} onRetry={refresh} />}
      {!loading && !error && total === 0 && (
        <Empty>Nothing posted for this week yet.</Empty>
      )}

      {!loading && !error && total > 0 && (
        <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 14 }}>
          {DAYS.map((day, i) => (
            byDay[i].length > 0 && (
              <div className="card" key={day}>
                <div className="row-between" style={{ padding: '13px 20px' }}>
                  <h3>{day}</h3>
                  <span className="small faint">{byDay[i].length} item{byDay[i].length > 1 ? 's' : ''}</span>
                </div>
                <table className="table">
                  <tbody>
                    {byDay[i].map((a, j) => {
                      const g = parseGrade(a.grade)
                      return (
                        <tr key={j}>
                          <td>{a.title || 'Assignment'}<span className="faint small"> · {a.course}</span></td>
                          <td className="num" style={{ width: 90 }}>
                            {g != null ? <GradeBadge value={g} showLetter={false} /> : <span className="faint small">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          ))}
        </div>
      )}
    </>
  )
}
