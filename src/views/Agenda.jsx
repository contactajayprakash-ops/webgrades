import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { PageHead, Empty } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import { cleanCourseName, scheduleWhitelist, filterPhantomClasses } from '../lib/courses.js'
import { parseGrade } from '../lib/gpa.js'
import {
  loadAgenda, saveAgenda, uid, dateKey, todayKey, addDays,
  startOfWeek, weekDays, labelFor, weekRangeLabel, courseHue,
} from '../lib/agenda.js'

const GENERAL = 'General'

export default function Agenda() {
  const { peekData, dataVersion, activeUsername, sync } = useAuth()

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
  useEffect(() => { setTasks(loadAgenda(activeUsername)) }, [activeUsername])
  useEffect(() => { saveAgenda(activeUsername, tasks) }, [activeUsername, tasks])

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const days = useMemo(() => weekDays(weekStart), [weekStart])
  const today = todayKey()
  const thisWeek = days.includes(today)

  // Composer state. Default the day to today when it's in view, else the Monday.
  const [course, setCourse] = useState(GENERAL)
  const [title, setTitle] = useState('')
  const [day, setDay] = useState(() => (weekDays(startOfWeek(new Date())).includes(todayKey()) ? todayKey() : dateKey(startOfWeek(new Date()))))
  const titleRef = useRef(null)

  // Keep the composer's day valid for the visible week.
  useEffect(() => {
    if (!days.includes(day)) setDay(days.includes(today) ? today : days[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart])

  const add = () => {
    const t = title.trim()
    if (!t) { titleRef.current?.focus(); return }
    setTasks((prev) => [...prev, { id: uid(), course, title: t, date: day, done: false }])
    setTitle('')
    titleRef.current?.focus()
  }
  const toggle = (id) => setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, done: !x.done } : x)))
  const remove = (id) => setTasks((prev) => prev.filter((x) => x.id !== id))

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
      <PageHead title="Agenda" sub="Your weekly planner — jot homework and due dates for your classes, one place, on any device." />

      {/* Week navigation */}
      <div className="agenda-weekbar card">
        <button className="circle-btn" aria-label="Previous week" onClick={() => setWeekStart((w) => addDays(w, -7))}>
          <Icon.chevron width={18} height={18} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <div className="agenda-weeklabel">
          <div className="wl-range">{weekRangeLabel(weekStart)}</div>
          <div className="wl-sub small faint">{thisWeek ? `${remaining} left this week` : 'Other week'}</div>
        </div>
        <button className="circle-btn" aria-label="Next week" onClick={() => setWeekStart((w) => addDays(w, 7))}>
          <Icon.chevron width={18} height={18} />
        </button>
        {!thisWeek && (
          <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
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

      {/* The whole week at a glance — 7 day cells, tasks land in their day */}
      <div className="agenda-grid-wrap">
        <div className="agenda-grid">
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
