import { useCallback, useEffect, useRef, useState } from 'react'
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
  // null = the current month (what the snapshot prefills). A prev/next click
  // stashes that month's calendar postback arg here; each month caches on its own.
  const [viewArg, setViewArg] = useState(null)
  const { data, loading, error, refresh } = useHacData('attendance', viewArg ? { date: viewArg } : undefined)
  const days = data?.days || []
  const prevNav = data?.prev, nextNav = data?.next
  // Show the switcher once the backend hands us nav args (older Pi builds don't,
  // so it silently stays a single-month view), or whenever we're off "today".
  const showSwitch = !!(prevNav || nextNav || viewArg)
  // Map real day-of-month -> its marking; the scrape pads blank cells with day 0.
  const byDay = new Map()
  for (const d of days) if (d.day >= 1) byDay.set(d.day, d)
  const flagged = [...byDay.values()].filter((d) => d.tooltip) // weekends are colored but have no note

  const parsed = parseMonth(data?.month)

  // Self-heal dud caches: a healthy scrape ALWAYS has a month label and day
  // cells (even a markless month returns its padded calendar), so a result with
  // neither is a stale empty capture (from a backend stall, or the old
  // same-month-postback bug) that the cache-hit fast path would otherwise serve
  // forever. Force one network refresh per cache key to replace it.
  const dudRetried = useRef(new Set())
  useEffect(() => {
    if (loading || error) return
    const key = viewArg || 'default'
    if (dudRetried.current.has(key)) return
    if (data && !data.month && days.length === 0) { dudRetried.current.add(key); refresh() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, viewArg, data])

  // HAC's MonthlyView opens on a month behind today (it lands on the last month
  // with recorded attendance, not the calendar's current month), so the default
  // view shows e.g. September in October. When we're on that default view and the
  // shown month predates today, step forward once so the page opens on the current
  // month. Only fires from the default (viewArg === null), so it can't fight a
  // user paging back into the past; `advanceTried` keeps it to a single attempt so
  // the fall-back below can't bounce it back and forth.
  const advanceTried = useRef(false)   // advance fires at most once per session
  const advancePending = useRef(false) // an advance is in flight, awaiting its result
  useEffect(() => {
    if (viewArg !== null || loading || !nextNav || !parsed || advanceTried.current) return
    const now = new Date()
    const behind = parsed.year < now.getFullYear() ||
      (parsed.year === now.getFullYear() && parsed.monthIndex < now.getMonth())
    if (behind) { advanceTried.current = true; advancePending.current = true; setViewArg(nextNav.arg) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewArg, loading, nextNav, data?.month])

  // HAC won't page into a month it has no recorded attendance for yet: posting
  // forward into the current month can come back with an empty calendar (no days,
  // no month label). If the auto-advance landed there, fall back to the default
  // view rather than stranding the page on "No attendance data." Scoped to the
  // pending advance only — once resolved it never fires again, so a user paging
  // into an empty month is left alone.
  useEffect(() => {
    if (!advancePending.current || loading || viewArg === null) return
    advancePending.current = false
    if (!error && days.length === 0) setViewArg(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, viewArg, days.length])

  // Month paging — shared by the buttons, a swipe (touch, with momentum), and
  // the arrow keys (desktop). Swipe LEFT → next month, RIGHT → prev (iOS-style).
  const goPrev = useCallback(() => { if (prevNav && !loading) setViewArg(prevNav.arg) }, [prevNav, loading])
  const goNext = useCallback(() => { if (nextNav && !loading) setViewArg(nextNav.arg) }, [nextNav, loading])

  const sw = useRef(null)
  const [dragX, setDragX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const onTouchStart = (e) => {
    if (e.touches.length !== 1 || loading) { sw.current = null; return }
    const t = e.touches[0]
    sw.current = { x: t.clientX, y: t.clientY, lx: t.clientX, lt: e.timeStamp, v: 0, dir: null }
  }
  const onTouchMove = (e) => {
    const s = sw.current; if (!s) return
    const t = e.touches[0]
    const dx = t.clientX - s.x, dy = t.clientY - s.y
    if (s.dir == null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      s.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v' // commit to one axis
      if (s.dir === 'h') setSwiping(true)
    }
    if (s.dir !== 'h') return
    if (e.cancelable) e.preventDefault() // we own the horizontal gesture now
    const dt = e.timeStamp - s.lt || 16
    s.v = (t.clientX - s.lx) / dt       // px/ms, for the flick decision
    s.lx = t.clientX; s.lt = e.timeStamp
    const canGo = dx < 0 ? !!nextNav : !!prevNav
    const eff = canGo ? dx : dx * 0.28  // rubber-band toward a month that isn't there
    setDragX(Math.max(-130, Math.min(130, eff)))
  }
  const onTouchEnd = () => {
    const s = sw.current; sw.current = null
    setSwiping(false)
    if (!s || s.dir !== 'h') { setDragX(0); return }
    // Project with release velocity (momentum): a fast flick commits on little
    // distance; a slow drag needs to pass the halfway mark.
    const projected = dragX + s.v * 90
    setDragX(0)
    if (projected <= -56) goNext()
    else if (projected >= 56) goPrev()
  }
  const onKeyDown = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
    else if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
    else if (e.key === 'Home' && viewArg) { e.preventDefault(); setViewArg(null) }
  }

  return (
    <>
      <PageHead title="Attendance" sub={data?.month ? data.month : 'Monthly attendance overview.'}>
        <button className="btn ghost sm" onClick={refresh}><Icon.refresh width={15} height={15} /> Refresh</button>
      </PageHead>

      {showSwitch && (
        <div className="cal-switch mb-3">
          <button className="btn ghost sm cal-nav" aria-label="Previous month"
            disabled={!prevNav || loading} onClick={() => prevNav && setViewArg(prevNav.arg)}>
            <Icon.chevron width={16} height={16} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <span className="cal-month">{data?.month || '…'}</span>
          <button className="btn ghost sm cal-nav" aria-label="Next month"
            disabled={!nextNav || loading} onClick={() => nextNav && setViewArg(nextNav.arg)}>
            <Icon.chevron width={16} height={16} />
          </button>
          {viewArg && <button className="btn ghost sm" onClick={() => setViewArg(null)}>Today</button>}
        </div>
      )}

      {loading && <Loading />}
      {error && !loading && <ErrorBox message={error} onRetry={refresh} />}
      {!loading && !error && days.length === 0 && <Empty>No attendance data for this month.</Empty>}

      {!loading && !error && days.length > 0 && (
        <>
          <div className="card card-pad mb-3"
            role={showSwitch ? 'group' : undefined}
            aria-label={showSwitch ? `Attendance for ${data?.month || 'this month'}. Swipe or use arrow keys to change month.` : undefined}
            tabIndex={showSwitch ? 0 : undefined}
            onKeyDown={showSwitch ? onKeyDown : undefined}
            onTouchStart={showSwitch ? onTouchStart : undefined}
            onTouchMove={showSwitch ? onTouchMove : undefined}
            onTouchEnd={showSwitch ? onTouchEnd : undefined}
            onTouchCancel={showSwitch ? onTouchEnd : undefined}
            style={showSwitch ? {
              transform: dragX ? `translateX(${dragX}px)` : undefined,
              transition: swiping ? 'none' : 'transform .32s var(--ease)',
              touchAction: 'pan-y',
            } : undefined}>
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
