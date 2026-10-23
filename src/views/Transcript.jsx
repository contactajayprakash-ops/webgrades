import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useHacData } from '../hooks/useHacData.js'
import { PageHead, Loading, ErrorBox, Empty, GradeBadge } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import { parseGrade } from '../lib/gpa.js'
import { transcriptCourseName } from '../lib/courseCatalog.js'
import { indexCareerPlan, PLAN_LABELS } from '../lib/careerPlan.js'
import { buildPriorCourses, transcriptPlanFacts } from '../lib/gpaCompute.js'

export default function Transcript() {
  const { data, loading, error, refresh } = useHacData('transcript', null)
  const { peekData, dataVersion } = useAuth()
  const groups = data?.transcript || []
  // EA (credit by exam) / CR (summer) markers from the Career Plan, matched the
  // same way the GPA page matches them. Nothing shows until the plan is cached.
  const facts = useMemo(() => {
    const plan = indexCareerPlan(peekData('careerplan'))
    return plan.ok ? transcriptPlanFacts(plan, buildPriorCourses(groups)) : {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, dataVersion])

  return (
    <>
      <PageHead title="Transcript" sub="Full academic history by school year.">
        <button className="btn ghost sm" onClick={refresh}><Icon.refresh width={15} height={15} /> Refresh</button>
      </PageHead>

      {loading && <Loading />}
      {error && !loading && <ErrorBox message={error} onRetry={refresh} />}
      {!loading && !error && groups.length === 0 && <Empty>No transcript records found.</Empty>}

      {!loading && !error && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {groups.map((g, i) => (
            <div className="card" key={i}>
              <div className="row-between" style={{ padding: '16px 20px' }}>
                <div>
                  <h3>{g.year || 'Year'}{g.grade ? ` · Grade ${g.grade}` : ''}</h3>
                  {g.building && <div className="small faint mt-2">{g.building}</div>}
                </div>
                {g.totalCredit && <span className="pill">Credits: {g.totalCredit}</span>}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Course</th><th className="num">Sem 1</th><th className="num">Sem 2</th>
                      <th className="num">Final</th><th className="num">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(g.courses || []).map((c, j) => {
                      const f = facts[c.courseCode || `${g.year}-${c.description}`]
                      const k = f?.ea ? 'ea' : f?.cr ? 'cr' : null
                      return (
                      <tr key={j}>
                        <td>
                          {f?.match?.name || transcriptCourseName(c.description) || c.courseCode}
                          {c.courseCode && c.description && <span className="faint small"> · {c.courseCode}</span>}
                          {k && <span className={`plan-tag ${k}`} title={PLAN_LABELS[k].title}>{PLAN_LABELS[k].tag}</span>}
                        </td>
                        <td className="num"><GradeBadge value={parseGrade(c.sem1)} showLetter={false} /></td>
                        <td className="num"><GradeBadge value={parseGrade(c.sem2)} showLetter={false} /></td>
                        <td className="num"><GradeBadge value={parseGrade(c.final)} showLetter={false} /></td>
                        <td className="num mono faint">{c.credit || '—'}</td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
