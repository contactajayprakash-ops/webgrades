import { useHacData } from '../hooks/useHacData.js'
import { PageHead, Loading, ErrorBox, Empty } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'

// Sort schedule rows by numeric period so "period-ordered" widgets are correct.
const byPeriod = (a, b) => (parseInt(a.period, 10) || 99) - (parseInt(b.period, 10) || 99)

export default function Schedule() {
  const { data, loading, error, refresh } = useHacData('schedule', null)
  const rows = data?.scheduleData || []
  const ordered = [...rows].sort(byPeriod)

  return (
    <>
      <PageHead title="Schedule" sub="Your current class schedule.">
        <button className="btn ghost sm" onClick={refresh}><Icon.refresh width={15} height={15} /> Refresh</button>
      </PageHead>

      {loading && <Loading />}
      {error && !loading && <ErrorBox message={error} onRetry={refresh} />}
      {!loading && !error && rows.length === 0 && <Empty>No schedule found.</Empty>}

      {!loading && !error && ordered.length > 0 && <NextClass rows={ordered} />}

      {!loading && !error && rows.length > 0 && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Period</th><th>Class</th><th>Teacher</th><th>Room</th><th>Days</th><th>Marking Period</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.period || '—'}</td>
                  <td>{r.className || '—'}</td>
                  <td className="muted">{r.teacher || '—'}</td>
                  <td className="faint">{r.room || '—'}</td>
                  <td className="faint small">{r.days || '—'}</td>
                  <td className="faint small">{r.markingPeriod || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// A glance card highlighting the first few classes in period order, so students
// can see "what's my next class + room" without scanning the whole table.
function NextClass({ rows }) {
  const shown = rows.slice(0, 4)
  return (
    <div className="card card-pad mb-3">
      <h3 className="mb-3">Your day, in order</h3>
      <div className="grid grid-2" style={{ gap: 10 }}>
        {shown.map((r, i) => (
          <div key={i} className="flex" style={{ gap: 12, alignItems: 'center', padding: '10px 12px', borderRadius: 12, background: 'var(--glass-flat)' }}>
            <span className="mono" style={{ fontSize: 20, fontWeight: 740, minWidth: 26, textAlign: 'center', color: 'var(--accent-text)' }}>{r.period || '·'}</span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.className || '—'}</span>
              <span className="small faint">{[r.room && `Room ${r.room}`, r.teacher].filter(Boolean).join(' · ') || '—'}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
