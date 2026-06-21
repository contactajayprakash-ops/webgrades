import { useHacData } from '../hooks/useHacData.js'
import { PageHead, Loading, ErrorBox, Empty } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// "May 2026" -> { monthIndex: 4, year: 2026 }
function parseMonth(s) {
  if (!s) return null
  const name = s.toLowerCase().match(/[a-z]+/)
  const year = s.match(/\d{4}/)
  if (!name || !year) return null
  const mi = MONTHS.findIndex((m) => m.startsWith(name[0].slice(0, 3)))
  if (mi < 0) return null
  return { monthIndex: mi, year: Number(year[0]) }
}

const isGray = (c) => /^#?c{6}$/i.test(c || '') || /^#?ccc$/i.test(c || '')

export default function Attendance() {
  const { data, loading, error, refresh } = useHacData('attendance', null)
  const days = data?.days || []
  // Map real day-of-month -> its marking; the scrape pads blank cells with day 0.
  const byDay = new Map()
  for (const d of days) if (d.day >= 1) byDay.set(d.day, d)
  const flagged = [...byDay.values()].filter((d) => d.tooltip) // weekends are colored but have no note

  const parsed = parseMonth(data?.month)

  return (
    <>
      <PageHead title="Attendance" sub={data?.month ? data.month : 'Monthly attendance overview.'}>
        <button className="btn ghost sm" onClick={refresh}><Icon.refresh width={15} height={15} /> Refresh</button>
      </PageHead>

      {loading && <Loading />}
      {error && !loading && <ErrorBox message={error} onRetry={refresh} />}
      {!loading && !error && days.length === 0 && <Empty>No attendance data for this month.</Empty>}

      {!loading && !error && days.length > 0 && (
        <>
          <div className="card card-pad mb-3">
            {parsed ? <CalendarGrid parsed={parsed} byDay={byDay} /> : <FlatGrid days={days} />}
            <div className="cal-legend">
              <Legend color="#00cc00" label="Present / testing" />
              <Legend color="#ff5a5f" label="Absent" />
              <Legend color="#ffd426" label="Tardy" />
              <Legend color="#cccccc" label="No school" muted />
            </div>
          </div>

          <div className="card">
            <div style={{ padding: '16px 20px' }}><h3>Flagged days</h3></div>
            {flagged.length === 0 ? (
              <Empty>No absences or tardies this month.</Empty>
            ) : (
              <table className="table">
                <thead><tr><th>Day</th><th>Details</th></tr></thead>
                <tbody>
                  {flagged.sort((a, b) => a.day - b.day).map((d, i) => (
                    <tr key={i}>
                      <td>
                        <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: d.color || 'var(--glass-border)', marginRight: 8, verticalAlign: 'middle' }} />
                        {d.day}
                      </td>
                      <td className="muted">{(d.tooltip || 'Marked').replace(/\n+/g, ' · ')}</td>
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

function CalendarGrid({ parsed, byDay }) {
  const { monthIndex, year } = parsed
  const firstWeekday = new Date(year, monthIndex, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null) // leading blanks
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null) // trailing blanks

  return (
    <div className="cal">
      {WEEKDAYS.map((w, i) => <div key={`h${i}`} className="cal-head">{w}</div>)}
      {cells.map((d, i) => {
        if (d == null) return <div key={i} className="cal-cell empty" />
        const mark = byDay.get(d)
        const gray = mark && isGray(mark.color)
        const tint = mark && mark.color && !gray ? hexToSoft(mark.color, 0.20) : undefined
        const ring = mark && mark.color && !gray ? hexToSoft(mark.color, 0.55) : undefined
        return (
          <div
            key={i}
            className={`cal-cell${gray ? ' gray' : ''}${mark?.tooltip ? ' noted' : ''}`}
            title={mark?.tooltip ? mark.tooltip.replace(/\n+/g, ' · ') : undefined}
            style={tint ? { background: tint, boxShadow: `inset 0 0 0 1px ${ring}` } : undefined}
          >
            <span className="cal-num">{d}</span>
            {mark?.tooltip && <span className="cal-dot" style={{ background: mark.color || 'var(--accent)' }} />}
          </div>
        )
      })}
    </div>
  )
}

// Fallback if the month label can't be parsed: the old flat wrap of real days.
function FlatGrid({ days }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(46px, 1fr))', gap: 8 }}>
      {days.filter((d) => d.day >= 1).map((d, i) => (
        <div key={i} title={d.tooltip || `Day ${d.day}`}
          style={{ aspectRatio: '1', display: 'grid', placeItems: 'center', borderRadius: 10, fontWeight: 600, fontSize: 14,
            border: '1px solid var(--glass-border)', background: d.color ? hexToSoft(d.color, 0.85) : 'var(--glass-flat)',
            color: d.color && !isGray(d.color) ? '#fff' : 'var(--text-dim)' }}>
          {d.day}
        </div>
      ))}
    </div>
  )
}

function Legend({ color, label, muted }) {
  return (
    <span className="cal-legend-item">
      <span className="cal-legend-dot" style={{ background: muted ? 'var(--glass-border-strong)' : color }} />
      {label}
    </span>
  )
}

// Render a HAC hex color at a given alpha.
function hexToSoft(hex, a = 0.85) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '')
  if (!m) return hex
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
