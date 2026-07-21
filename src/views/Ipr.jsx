import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { PageHead, Loading, ErrorBox, Empty } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'

// Interim Progress Reports — mid-quarter snapshots HAC posts a few times a
// semester. A single `ipr` fetch returns the current report plus the list of
// available dates; picking a date re-fetches that report. (Off-season there are
// no dates, so the page shows a friendly empty state.)
export default function Ipr() {
  const { getData, peekData, dataVersion } = useAuth()
  const [state, setState] = useState(() => {
    const d = peekData('ipr')
    return d ? { data: d } : { loading: true }
  })
  const [date, setDate] = useState('')

  const load = useCallback(async (d = undefined, force = false) => {
    const extra = d ? { date: d } : {}
    const cached = peekData('ipr', extra)
    if (!force && cached) { setState({ data: cached }); return }
    setState((s) => ({ ...s, loading: !cached, data: cached }))
    try {
      const data = await getData('ipr', { ...extra, force })
      setState({ data })
    } catch (e) {
      setState({ error: e.message })
    }
  }, [getData, peekData])

  useEffect(() => { load() }, [load])

  // pull fresh in place after a background sync
  useEffect(() => {
    const d = peekData('ipr', date ? { date } : {})
    if (d) setState({ data: d })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion])

  const onPickDate = (v) => { setDate(v); load(v || undefined) }

  const data = state.data
  const dates = data?.availableDates || []
  const classes = data?.classes || []

  return (
    <>
      <PageHead title="Interim Progress" sub="Mid-quarter progress reports from HAC.">
        <button className="btn ghost sm" onClick={() => load(date || undefined, true)}>
          <Icon.refresh width={15} height={15} /> Refresh
        </button>
      </PageHead>

      {state.loading && !data && <Loading label="Loading progress reports…" />}
      {state.error && <ErrorBox message={state.error} onRetry={() => load(date || undefined, true)} />}

      {!state.loading && !state.error && (
        <>
          {dates.length > 0 && (
            <div className="seg mb-3" style={{ flexWrap: 'wrap' }}>
              {dates.map((d) => (
                <button key={d.value} className={(date || data?.iprDate) === d.label || date === d.value ? 'active' : ''}
                  onClick={() => onPickDate(d.value)}>{d.label}</button>
              ))}
            </div>
          )}

          {classes.length === 0 ? (
            <Empty>No interim progress reports posted right now. These appear a few times each semester.</Empty>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr><th>Period</th><th>Class</th><th>Teacher</th><th>Room</th><th className="num">Progress grade</th></tr>
                </thead>
                <tbody>
                  {classes.map((c, i) => (
                    <tr key={i}>
                      <td className="mono">{c.period || '—'}</td>
                      <td>{c.className || c.courseCode || '—'}</td>
                      <td className="muted">{c.teacher || '—'}</td>
                      <td className="faint">{c.room || '—'}</td>
                      <td className="num mono" style={{ fontWeight: 700 }}>{c.iprGrade || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}
