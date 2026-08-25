import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { PageHead, Empty } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import Segmented from '../components/Segmented.jsx'
import { cleanCourseName, scheduleWhitelist, filterPhantomClasses } from '../lib/courses.js'
import { parseGrade } from '../lib/gpa.js'
import { syncAllowedFor } from '../lib/syncPolicy.js'
import {
  loadAgenda, loadAgendaMeta, saveAgenda, uid, dateKey, todayKey, addDays,
  startOfWeek, weekDays, labelFor, weekRangeLabel, dayLabel, courseHue,
  loadAgendaView, saveAgendaView,
} from '../lib/agenda.js'

// Lazy so Firebase isn't in the main bundle — it loads only when the agenda syncs.
const syncMod = () => import('../lib/agendaSync.js')

const GENERAL = 'General'

export default function Agenda() {
  const { peekData, dataVersion, activeUsername, sync, session } = useAuth()

  // Your current classes drive the course picker (most recent quarter that has
  // one). Falls back to the default class view; "General" is always available.
  // De-duplicated because HAC can list a course more than once.
  const courses = useMemo(() => {
    const wl = scheduleWhitelist(peekData('schedule')?.scheduleData)
    let list = []
    for (const q of ['4', '3', '2', '1']) {
      const l = filterPhantomClasses(peekData('class', { quarter: q })?.assignmentsData || [], wl)
      if (l.some((c) => parseGrade(c.overallAverage) != null)) { list = l; break }
    }
    if (!list.length) list = filterPhantomClasses(peekData('class', {})?.assignmentsData || [], wl)
    return [...new Set(list.map((c) => cleanCourseName(c.courseName)))]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekData, dataVersion])

  // Classes haven't landed from HAC yet — the picker only has "General".
  const classesLoading = courses.length === 0 && sync.phase !== 'done'

  const [tasks, setTasks] = useState(() => loadAgenda(activeUsername))
  const sessionRef = useRef(session); sessionRef.current = session
  const localUpdatedAt = useRef(loadAgendaMeta(activeUsername).updatedAt)
  const pushTimer = useRef(null)

  // Persist locally, and (debounced) push to the cloud so the agenda follows you
  // across devices. `push: false` when we're just adopting what the cloud sent.
  const commit = useCallback((nextTasks, opts = {}) => {
    const updatedAt = opts.updatedAt ?? Date.now()
    localUpdatedAt.current = updatedAt
    setTasks(nextTasks)
    saveAgenda(activeUsername, nextTasks, updatedAt)
    if (opts.push === false) return
    const s = sessionRef.current
    if (!s?.username || !s?.password || !syncAllowedFor(s.username)) return
    clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(async () => {
      try { const { pushAgenda } = await syncMod(); await pushAgenda(s.username, s.password, nextTasks, updatedAt) } catch (_) {}
    }, 800)
  }, [activeUsername])

  // Load the active account's local agenda when the profile changes.
  useEffect(() => {
    const meta = loadAgendaMeta(activeUsername)
    localUpdatedAt.current = meta.updatedAt
    setTasks(meta.tasks)
  }, [activeUsername])

  // Cross-device sync: pull on open, reconcile by last-write-wins. Silently
  // stays local if offline / Firestore not reachable.
  useEffect(() => {
    const s = session
    if (!s?.username || !s?.password || !syncAllowedFor(s.username)) return
    let cancelled = false
    ;(async () => {
      try {
        const { pullAgenda, pushAgenda } = await syncMod()
        const cloud = await pullAgenda(s.username, s.password)
        if (cancelled) return
        const local = loadAgendaMeta(activeUsername)
        if (!cloud) {
          if (local.tasks.length) pushAgenda(s.username, s.password, local.tasks, local.updatedAt || Date.now()).catch(() => {})
        } else if ((cloud.updatedAt || 0) > (local.updatedAt || 0)) {
          commit(cloud.tasks || [], { push: false, updatedAt: cloud.updatedAt })
        } else if ((local.updatedAt || 0) > (cloud.updatedAt || 0)) {
          pushAgenda(s.username, s.password, local.tasks, local.updatedAt).catch(() => {})
        }
      } catch (_) { /* stay local */ }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.username, activeUsername])

  // Week or day view (remembered). One `anchor` date drives both: a week is the
  // 7 days around it; a day is just it.
  const [view, setView] = useState(loadAgendaView)
  const [anchor, setAnchor] = useState(() => new Date())
  const changeView = (v) => { setView(v); saveAgendaView(v) }

  const weekStart = useMemo(() => startOfWeek(anchor), [anchor])
  const days = useMemo(() => (view === 'day' ? [dateKey(anchor)] : weekDays(weekStart)), [view, anchor, weekStart])
  const today = todayKey()
  const inView = days.includes(today)
  const step = view === 'day' ? 1 : 7

  // Composer state. Default the day to today when it's in view, else the first.
  const [course, setCourse] = useState(GENERAL)
  const [title, setTitle] = useState('')
  const [day, setDay] = useState(todayKey)
  const titleRef = useRef(null)

  // Keep the composer's day valid for the visible range (week or single day).
  useEffect(() => {
    if (!days.includes(day)) setDay(inView ? today : days[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, anchor])

  const add = () => {
    const t = title.trim()
    if (!t) { titleRef.current?.focus(); return }
    commit([...tasks, { id: uid(), course, title: t, date: day, done: false }])
    setTitle('')
    titleRef.current?.focus()
  }
  const toggle = (id) => commit(tasks.map((x) => (x.id === id ? { ...x, done: !x.done } : x)))
  const remove = (id) => commit(tasks.filter((x) => x.id !== id))

  const quickAddTo = (d) => { setDay(d); titleRef.current?.focus() }

  const byDay = useMemo(() => {
    const m = {}
    for (const k of days) m[k] = []
    for (const t of tasks) if (m[t.date]) m[t.date].push(t)
    return m
  }, [tasks, days])

  const remaining = tasks.filter((t) => days.includes(t.date) && !t.done).length

  return (
    <>
      <PageHead title="Agenda" sub="Your planner — jot homework and due dates for your classes, one place, on any device.">
        <Segmented
          value={view}
          onChange={changeView}
          ariaLabel="Agenda view"
          options={[{ value: 'week', label: 'Week' }, { value: 'day', label: 'Day' }]}
        />
      </PageHead>

      {/* Week / day navigation */}
      <div className="agenda-weekbar card">
        <button className="circle-btn" aria-label={view === 'day' ? 'Previous day' : 'Previous week'} onClick={() => setAnchor((a) => addDays(a, -step))}>
          <Icon.chevron width={18} height={18} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <div className="agenda-weeklabel">
          <div className="wl-range">{view === 'day' ? dayLabel(dateKey(anchor)) : weekRangeLabel(weekStart)}</div>
          <div className="wl-sub small faint">
            {inView ? `${remaining} left ${view === 'day' ? 'today' : 'this week'}` : (view === 'day' ? 'Another day' : 'Other week')}
          </div>
        </div>
        <button className="circle-btn" aria-label={view === 'day' ? 'Next day' : 'Next week'} onClick={() => setAnchor((a) => addDays(a, step))}>
          <Icon.chevron width={18} height={18} />
        </button>
        {!inView && (
          <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => setAnchor(new Date())}>Today</button>
        )}
      </div>

      {/* Composer */}
      <div className="agenda-composer card">
        <select className="select" value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Class">
          <option value={GENERAL}>{GENERAL}</option>
          {courses.map((c) => <option key={c} value={c}>{c}</option>)}
          {courses.length === 0 && <option disabled>{classesLoading ? 'Loading your classes…' : 'No classes found'}</option>}
        </select>
        <input
          ref={titleRef}
          className="input"
          placeholder="What's due? e.g. Read ch. 4, p.32 #1–20"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          aria-label="Task"
        />
        <select className="select" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day">
          {days.map((k) => {
            const l = labelFor(k)
            return <option key={k} value={k}>{l.weekday} {l.month} {l.day}{k === today ? ' · Today' : ''}</option>
          })}
        </select>
        <button className="btn sm" onClick={add}><Icon.plus width={15} height={15} /> Add</button>
      </div>

      {classesLoading && (
        <div className="small faint" style={{ margin: '-6px 4px 14px' }}>
          Your classes are still loading from HAC — add “General” items now, or wait a moment for the class list to fill in.
        </div>
      )}

      {/* Week: 7 day cells side by side. Day: one full-width cell. */}
      <div className="agenda-grid-wrap">
        <div className={`agenda-grid${view === 'day' ? ' single' : ''}`}>
          {days.map((k) => {
            const l = labelFor(k)
            const isToday = k === today
            const isPast = k < today
            const items = byDay[k]
            return (
              <div key={k} className={`wk-day${isToday ? ' is-today' : ''}${isPast ? ' is-past' : ''}`}>
                <div className="wk-head">
                  <div className="wk-dow">{l.weekday}</div>
                  <div className="wk-date">{l.month} {l.day}</div>
                  {items.length > 0 && <span className="wk-count">{items.length}</span>}
                </div>
                <div className="wk-tasks">
                  {items.map((t) => {
                    const general = !t.course || t.course === GENERAL
                    return (
                      <div
                        key={t.id}
                        className={`wk-task${t.done ? ' done' : ''}${general ? ' general' : ''}`}
                        style={general ? undefined : { '--h': courseHue(t.course) }}
                      >
                        <button className="wk-check" role="checkbox" aria-checked={t.done}
                          aria-label={t.done ? 'Mark not done' : 'Mark done'} onClick={() => toggle(t.id)}>
                          {t.done && <Icon.check width={13} height={13} />}
                        </button>
                        <div className="wk-tbody">
                          {!general && <div className="wk-course">{t.course}</div>}
                          <div className="wk-title">{t.title}</div>
                        </div>
                        <button className="wk-del" aria-label="Delete task" onClick={() => remove(t.id)}>
                          <Icon.trash width={13} height={13} />
                        </button>
                      </div>
                    )
                  })}
                </div>
                <button className="wk-add" onClick={() => quickAddTo(k)} aria-label={`Add for ${l.weekday} ${l.month} ${l.day}`}>
                  <Icon.plus width={14} height={14} /> Add
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {tasks.length === 0 && (
        <Empty>Your agenda is empty — pick a class, type what's due, choose a day, and hit Add. It lands on that day.</Empty>
      )}
    </>
  )
}
