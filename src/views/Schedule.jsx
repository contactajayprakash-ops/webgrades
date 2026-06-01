import { useHacData } from '../hooks/useHacData.js'
import { PageHead, Loading, ErrorBox, Empty } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'

export default function Schedule() {
  const { data, loading, error, refresh } = useHacData('schedule', null)
  const rows = data?.scheduleData || []

  return (
    <>
      <PageHead title="Schedule" sub="Your current class schedule.">
        <button className="btn ghost sm" onClick={refresh}><Icon.refresh width={15} height={15} /> Refresh</button>
      </PageHead>

      {loading && <Loading />}
      {error && !loading && <ErrorBox message={error} onRetry={refresh} />}
      {!loading && !error && rows.length === 0 && <Empty>No schedule found.</Empty>}

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
