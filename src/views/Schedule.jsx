import { useHacData } from '../hooks/useHacData.js'
import { PageHead, Loading, ErrorBox, Empty } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import { courseNameFromCode } from '../lib/courseCatalog.js'

// Frisco runs an A-day / B-day block schedule, and HAC lists every class up to
// FOUR times: once per A/B day AND once per semester section (course code ends
// in "A" for S1, "B" for S2). We collapse that into two clean period-ordered
// day schedules.

const dayHas = (days, d) => (days || '').toUpperCase().includes(d)
const periodRank = (p) => { const n = parseInt(p, 10); return Number.isFinite(n) ? n : 99 }

// "SUBA1911A - 1" -> "SUBA1911 - 1": drop the trailing S1/S2 semester letter on
// the course code so the two semester sections collapse into one class.
function stripSem(className) {
  const parts = (className || '').split(/\s*-\s*/)
  if (parts.length < 2) return className || ''
  let code = parts[0]
  if (/[AB]$/.test(code)) code = code.slice(0, -1)
  return `${code} - ${parts.slice(1).join(' - ')}`.trim()
}

// Summarize a class's marking periods: '' = all year, else which semester.
function mpSummary(mps) {
  const txt = [...mps].join(' ')
  const s1 = /Q1|Q2/.test(txt), s2 = /Q3|Q4/.test(txt)
  if (s1 && s2) return ''
  if (s1) return 'Sem 1'
  if (s2) return 'Sem 2'
  return [...mps].join(' · ')
}

// Collapse the rows belonging to one day into one entry per class period.
function buildDay(rows, day) {
  const groups = new Map()
  for (const r of rows) {
    if (day && !dayHas(r.days, day)) continue
    const code = stripSem(r.className)
    // Prefer the friendly catalog name ("Spanish 2"); fall back to the code.
    const name = courseNameFromCode(r.className)
    const label = name || code
    const key = `${r.period}|${label}`
    if (!groups.has(key)) groups.set(key, { period: r.period, label, code: name ? code : null, room: r.room, teacher: r.teacher, mps: new Set() })
    if (r.markingPeriod) groups.get(key).mps.add(r.markingPeriod)
  }
  return [...groups.values()].sort((a, b) => periodRank(a.period) - periodRank(b.period))
}

export default function Schedule() {
  const { data, loading, error, refresh } = useHacData('schedule', null)
  const rows = data?.scheduleData || []
  const hasA = rows.some((r) => dayHas(r.days, 'A'))
  const hasB = rows.some((r) => dayHas(r.days, 'B'))
  const blockSchedule = hasA && hasB

  return (
    <>
      <PageHead title="Schedule" sub={blockSchedule ? 'Your A-day and B-day classes, in order.' : 'Your current class schedule.'}>
        <button className="btn ghost sm" onClick={refresh}><Icon.refresh width={15} height={15} /> Refresh</button>
      </PageHead>

      {loading && <Loading />}
      {error && !loading && <ErrorBox message={error} onRetry={refresh} />}
      {!loading && !error && rows.length === 0 && <Empty>No schedule found.</Empty>}

      {!loading && !error && rows.length > 0 && (
        blockSchedule ? (
          <div className="grid grid-2" style={{ gap: 18 }}>
            <DayCard title="A Day" entries={buildDay(rows, 'A')} />
            <DayCard title="B Day" entries={buildDay(rows, 'B')} />
          </div>
        ) : (
          <DayCard title="Your classes" entries={buildDay(rows, null)} />
        )
      )}
    </>
  )
}

function DayCard({ title, entries }) {
  return (
    <div className="card">
      <div className="row-between" style={{ padding: '15px 20px' }}>
        <h3>{title}</h3>
        <span className="small faint">{entries.length} period{entries.length === 1 ? '' : 's'}</span>
      </div>
      <div className="sched-list">
        {entries.map((e, i) => {
          const sem = mpSummary(e.mps)
          return (
            <div key={i} className="sched-row">
              <span className="sched-period">{e.period || '·'}</span>
              <span className="sched-body">
                <span className="sched-class">{e.label}</span>
                <span className="small faint">{[e.code, e.room && `Room ${e.room}`, e.teacher].filter(Boolean).join(' · ') || '—'}</span>
              </span>
              {sem && <span className="pill">{sem}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
