import { useHacData } from '../hooks/useHacData.js'
import { PageHead, Loading, ErrorBox, Empty, GradeBadge } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import { parseGrade } from '../lib/gpa.js'

export default function Transcript() {
  const { data, loading, error, refresh } = useHacData('transcript', null)
  const groups = data?.transcript || []

  return (
    <>
      <PageHead title="Transcript" sub="Full academic history by school year.">
        <button className="btn ghost sm" onClick={refresh}><Icon.refresh width={15} height={15} /> Refresh</button>
      </PageHead>

      {loading && <Loading />}
      {error && !loading && <ErrorBox message={error} onRetry={refresh} />}
      {!loading && !error && groups.length === 0 && <Empty>No transcript records found.</Empty>}

      {!loading && !error && (
        <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
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
                    {(g.courses || []).map((c, j) => (
                      <tr key={j}>
                        <td>
                          {c.description || c.courseCode}
                          {c.courseCode && c.description && <span className="faint small"> · {c.courseCode}</span>}
                        </td>
                        <td className="num"><GradeBadge value={parseGrade(c.sem1)} showLetter={false} /></td>
                        <td className="num"><GradeBadge value={parseGrade(c.sem2)} showLetter={false} /></td>
                        <td className="num"><GradeBadge value={parseGrade(c.final)} showLetter={false} /></td>
                        <td className="num mono faint">{c.credit || '—'}</td>
                      </tr>
                    ))}
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
