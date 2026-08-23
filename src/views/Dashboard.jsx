import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useHacData } from '../hooks/useHacData.js'
import { useGpaMetrics, GPA_METRICS, findMetric } from '../hooks/useGpaMetrics.js'
import { useFocusTrap } from '../hooks/useFocusTrap.js'
import { PageHead, Loading, Empty, GradeBadge, LastUpdated } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import { parseGrade } from '../lib/gpa.js'
import { cleanCourseName, QUARTERS, scheduleWhitelist, filterPhantomClasses } from '../lib/courses.js'
import { loadPrefs, savePrefs } from '../lib/prefs.js'
import { loadSeen, saveSeen, snapshotOf, changedSince } from '../lib/seen.js'
import { loadTheme } from '../lib/theme.js'

export default function Dashboard() {
  const { userName } = useAuth()
  const showRecent = loadTheme().showRecent
  // One shared snapshot drives both the "Recently posted" feed and the grade
  // badges below, so "Mark seen" in either place clears both at once.
  const recent = useRecentGrades()

  return (
    <>
      <PageHead title={greeting(userName)} sub="Your grades at a glance." />
      <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
        <TopStats />
        {showRecent && <RecentlyPosted recent={recent} />}
        <CurrentClasses recent={recent} />
      </div>
    </>
  )
}

// Current-quarter grades + what changed since the last-seen snapshot, computed
// once and shared. `feed` is the detailed "what posted" list (old% → new%).
function useRecentGrades() {
  const { peekData, dataVersion, activeUsername } = useAuth()

  // The most recent quarter that actually has grades (see CurrentClasses note),
  // with dropped/phantom classes filtered against the schedule whitelist.
  const { quarter, classes } = useMemo(() => {
    const wl = scheduleWhitelist(peekData('schedule')?.scheduleData)
    for (const q of ['4', '3', '2', '1']) {
      const list = filterPhantomClasses(peekData('class', { quarter: q })?.assignmentsData || [], wl)
      if (list.some((c) => parseGrade(c.overallAverage) != null)) return { quarter: q, classes: list }
    }
    return { quarter: null, classes: filterPhantomClasses(peekData('class', {})?.assignmentsData || [], wl) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekData, dataVersion])

  const [seen, setSeen] = useState(() => loadSeen(activeUsername))
  useEffect(() => { setSeen(loadSeen(activeUsername)) }, [activeUsername])
  useEffect(() => {
    if (classes.length && seen === null) { // first-ever visit seeds silently
      const snap = snapshotOf(classes); saveSeen(activeUsername, snap); setSeen(snap)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.length, activeUsername])

  const changed = useMemo(() => new Set(changedSince(seen, classes)), [seen, classes])
  const markSeen = () => { const snap = snapshotOf(classes); saveSeen(activeUsername, snap); setSeen(snap) }

  // Detailed feed for the "Recently posted" section: name, old% → new%, biggest
  // movers first. Empty until there's a prior snapshot to compare against.
  const feed = useMemo(() => {
    if (!seen) return []
    const out = []
    for (const c of classes) {
      if (!changed.has(c.courseName)) continue
      const had = c.courseName in seen
      out.push({
        name: cleanCourseName(c.courseName),
        from: had ? parseGrade(seen[c.courseName]) : null,
        to: parseGrade(c.overallAverage),
        isNew: !had,
      })
    }
    const mag = (x) => (x.from == null || x.to == null ? -1 : Math.abs(x.to - x.from))
    return out.sort((a, b) => mag(b) - mag(a))
  }, [seen, classes, changed])

  return { quarter, classes, seen, changed, markSeen, feed }
}

// The opt-in "what posted since last time" feed. Reuses the shared snapshot so it
// never disagrees with the badges below.
function RecentlyPosted({ recent }) {
  const { syncedAt } = useAuth()
  const { feed, markSeen } = recent
  const fmt = (n) => (n == null ? '—' : n % 1 === 0 ? `${n}` : n.toFixed(2))

  return (
    <div className="card">
      <div className="row-between" style={{ padding: '16px 20px' }}>
        <div className="flex" style={{ alignItems: 'center', gap: 10 }}>
          <h3>Recently posted</h3>
          <LastUpdated at={syncedAt} />
        </div>
        {feed.length > 0 && <button className="btn ghost sm" onClick={markSeen}>Mark seen</button>}
      </div>
      {feed.length === 0 ? (
        <div className="recent-empty">You're all caught up — no new grades since your last check.</div>
      ) : (
        <ul className="recent-list">
          {feed.map((f, i) => {
            const delta = f.from != null && f.to != null ? f.to - f.from : null
            const dir = delta == null || Math.abs(delta) < 1e-9 ? 'flat' : delta > 0 ? 'up' : 'down'
            return (
              <li key={i} className="recent-item">
                <span className={`recent-dot ${dir}`} aria-hidden="true" />
                <div className="recent-main">
                  <div className="recent-name">{f.name}</div>
                  <div className="recent-sub">
                    {f.isNew ? 'New — grade posted' : `${fmt(f.from)}% → ${fmt(f.to)}%`}
                  </div>
                </div>
                <div className="recent-right">
                  <GradeBadge value={f.to} showLetter={false} />
                  {delta != null && Math.abs(delta) >= 0.005 && (
                    <span className={`recent-delta ${dir}`}>
                      {delta > 0 ? '↑' : '↓'} {fmt(Math.abs(delta))}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function greeting(name) {
  if (!name) return 'Dashboard'
  
  // If the name contains a comma (e.g., "Prakash, Ajay"), 
  // split by the comma and take the second part (the first name).
  if (name.includes(',')) {
    const parts = name.split(',')
    const firstName = parts[1].trim().split(/\s+/)[0]
    return `Hey, ${firstName}`
  }

  // Fallback for standard "First Last" formatting
  const first = name.trim().split(/\s+/)[0]
  return first ? `Hey, ${first}` : 'Dashboard'
}

// Shows a GPA shortcut (with an editable pinned number) + official rank/GPA.
function TopStats() {
  const { data: rankData, loading: rankLoading } = useHacData('rank', null)

  return (
    <div className="grid grid-3">
      <GpaCard />

      <div className="card stat">
        <span className="label">Official GPA</span>
        {rankLoading ? <span className="value skeleton" style={{ height: 34, width: 100 }} />
          : <span className="value">{rankData?.gpa || '—'}</span>}
        <span className="meta">from HAC transcript</span>
      </div>

      <div className="card stat">
        <span className="label">Class Rank</span>
        {rankLoading ? <span className="value skeleton" style={{ height: 34, width: 100 }} />
          : <span className="value">{rankData?.rank ? `#${rankData.rank}` : '—'}</span>}
        <span className="meta">{rankData?.outOf ? `out of ${rankData.outOf}` : 'rank in class'}</span>
      </div>
    </div>
  )
}

// The first card: a button to the GPA page. The pencil opens a menu to pin any
// GPA-page number (the cards with a value in them) onto it — computed live.
function GpaCard() {
  const { activeUsername } = useAuth()
  const [metricId, setMetricId] = useState(() => loadPrefs(activeUsername).dashboard?.gpaMetric || null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuTrapRef = useFocusTrap(menuOpen, () => setMenuOpen(false))
  const metric = findMetric(metricId)
  const m = useGpaMetrics(metric?.period || 'year')

  const choose = (id) => {
    setMetricId(id)
    const p = loadPrefs(activeUsername)
    p.dashboard = { ...(p.dashboard || {}), gpaMetric: id }
    savePrefs(activeUsername, p)
    setMenuOpen(false)
  }

  // Resolve what the value/label/meta should read for the pinned metric.
  let label = 'Your GPA', meta = 'Weighted · semester · cumulative', value = 'open'
  if (metric) {
    label = metric.label
    meta = metric.sub
    const notReady = metric.view === 'live' ? !m.ready : !m.hasTranscript
    if (metric.view === 'cumulative' && !m.cumConfirmed) value = 'setup'
    else if (notReady) value = null            // show skeleton
    else value = metric.pick(m)
  }

  return (
    <div className="stat-pick">
      <Link to="/gpa" className="card stat card-link" style={{ flexDirection: 'column' }}>
        <span className="glow" style={{ background: 'var(--accent)' }} />
        <span className="label">{label}</span>
        {value === null
          ? <span className="value skeleton" style={{ height: 34, width: 120 }} />
          : value === 'open'
            ? <span className="value" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>Open <Icon.chevron width={26} height={26} /></span>
            : value === 'setup'
              ? <span className="value" style={{ fontSize: 22 }}>Set up →</span>
              : <span className="value">{value}</span>}
        <span className="meta">{meta}</span>
      </Link>

      <button className="card-edit" title="Choose what this shows" aria-label="Choose what this card shows"
        onClick={(e) => { e.preventDefault(); setMenuOpen((o) => !o) }}>
        <Icon.edit width={15} height={15} />
      </button>

      {menuOpen && (
        <>
          <div className="profile-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="card card-menu" ref={menuTrapRef} role="dialog" aria-modal="true" aria-label="Pick a GPA to show">
            <div className="menu-head">Show on this card</div>
            <button className={`menu-item ${!metricId ? 'active' : ''}`} onClick={() => choose(null)}>
              <span className="mi-text"><span className="mi-name">Just a link</span><span className="mi-sub">Opens the GPA page</span></span>
              {!metricId && <Icon.check width={16} height={16} className="profile-check" />}
            </button>
            <div className="menu-divider" />
            {GPA_METRICS.map((opt) => (
              <button key={opt.id} className={`menu-item ${metricId === opt.id ? 'active' : ''}`} onClick={() => choose(opt.id)}>
                <span className="mi-text"><span className="mi-name">{opt.label}</span><span className="mi-sub">{opt.sub}</span></span>
                {metricId === opt.id && <Icon.check width={16} height={16} className="profile-check" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function CurrentClasses({ recent }) {
  const { sync, syncAll, syncedAt } = useAuth()
  const updating = sync.phase === 'syncing'

  // The most-recent-quarter grades + change diff are computed once in the parent
  // (see useRecentGrades) and shared, so "Mark seen" here and the "Recently
  // posted" feed above never drift apart.
  const { quarter, classes, changed, markSeen } = recent

  const qLabel = quarter ? QUARTERS.find((x) => x.value === quarter)?.label : null
  const loading = classes.length === 0 && updating

  return (
    <div className="card">
      <div className="row-between" style={{ padding: '16px 20px' }}>
        <div className="flex" style={{ alignItems: 'center', gap: 10 }}>
          <h3>Current grades{qLabel ? ` — ${qLabel}` : ''}</h3>
          {updating
            ? <span className="flex faint small" style={{ gap: 6, alignItems: 'center' }}>
                <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> updating…
              </span>
            : <LastUpdated at={syncedAt} />}
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <button className="btn ghost sm" onClick={syncAll} disabled={updating} title="Re-check HAC for new grades">
            <Icon.refresh width={14} height={14} /> Refresh
          </button>
          <Link to="/grades" className="btn ghost sm">View all <Icon.chevron width={14} height={14} /></Link>
        </div>
      </div>
      {changed.size > 0 && (
        <div className="notice row-between" style={{ margin: '0 20px 8px', gap: 12 }}>
          <span>{changed.size} grade{changed.size > 1 ? 's' : ''} changed since your last visit.</span>
          <button className="btn ghost sm" onClick={markSeen}>Mark seen</button>
        </div>
      )}
      {loading && <Loading label="Loading classes…" />}
      {!loading && classes.length === 0 && <Empty>No current classes found.</Empty>}
      {classes.length > 0 && (
        <table className="table">
          <thead>
            <tr><th>Class</th><th>Assignments</th><th className="num">Average</th></tr>
          </thead>
          <tbody>
            {classes.map((c, i) => (
              <tr key={i} className={changed.has(c.courseName) ? 'row-new' : ''}>
                <td>{cleanCourseName(c.courseName)}{changed.has(c.courseName) && <span className="pill pill-new">new</span>}</td>
                <td className="faint small">{(c.assignments?.length || 0)} assignments</td>
                <td className="num"><GradeBadge value={parseGrade(c.overallAverage)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
