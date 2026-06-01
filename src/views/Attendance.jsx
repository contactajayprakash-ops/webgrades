import { useHacData } from '../hooks/useHacData.js'
import { PageHead, Loading, ErrorBox, Empty } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'

export default function Attendance() {
  const { data, loading, error, refresh } = useHacData('attendance', null)
  const days = data?.days || []
  const flagged = days.filter((d) => d.color || d.tooltip)

  return (
    <>
      <PageHead title="Attendance" sub={data?.month ? `Month: ${data.month}` : 'Monthly attendance overview.'}>
        <button className="btn ghost sm" onClick={refresh}><Icon.refresh width={15} height={15} /> Refresh</button>
      </PageHead>

      {loading && <Loading />}
      {error && !loading && <ErrorBox message={error} onRetry={refresh} />}
      {!loading && !error && days.length === 0 && <Empty>No attendance data for this month.</Empty>}

      {!loading && !error && days.length > 0 && (
        <>
          <div className="card card-pad mb-3">
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(46px, 1fr))', gap: 8 }}>
              {days.map((d, i) => (
                <div
                  key={i}
                  title={d.tooltip || `Day ${d.day}`}
                  style={{
                    aspectRatio: '1', display: 'grid', placeItems: 'center',
                    borderRadius: 10, fontWeight: 600, fontSize: 14,
                    border: '1px solid var(--border)',
                    background: d.color ? hexToSoft(d.color) : 'var(--bg)',
                    color: d.color ? '#fff' : 'var(--text-dim)',
                    cursor: d.tooltip ? 'help' : 'default',
                  }}
                >
                  {d.day}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{ padding: '16px 20px' }}><h3>Flagged days</h3></div>
            {flagged.length === 0 ? (
              <Empty>No absences or tardies this month. 🎉</Empty>
            ) : (
              <table className="table">
                <thead><tr><th>Day</th><th>Details</th></tr></thead>
                <tbody>
                  {flagged.map((d, i) => (
                    <tr key={i}>
                      <td>
                        <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: d.color || 'var(--border)', marginRight: 8, verticalAlign: 'middle' }} />
                        {d.day}
                      </td>
                      <td className="muted">{d.tooltip || 'Marked'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  )
}

// Render HAC's calendar color a touch softer/translucent over the dark theme.
function hexToSoft(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16))
  return `rgba(${r}, ${g}, ${b}, 0.85)`
}
