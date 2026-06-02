import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useWhatIf } from '../context/WhatIfContext.jsx'
import { PageHead, Loading, ErrorBox, Empty, GradeBadge, WhatIfBanner } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import {
  parseGrade, detectWeight, weightedGpa, unweightedGpa, roundGrade, liveSemesterAverage,
  fmtGpa, weightLabel, weightTagClass,
} from '../lib/gpa.js'
import { cleanCourseName, courseKey, QUARTERS, SEMESTERS, semesterOfQuarter } from '../lib/courses.js'
import { editKey, classRows, effectiveAverage } from '../lib/whatif.js'
import { loadPrefs } from '../lib/prefs.js'

const weightFor = (courseName, prefs) => prefs.weights[courseKey(courseName)] ?? detectWeight(courseName)

export default function Grades() {
  const { getData, peekData, dataVersion } = useAuth()
  const { edits, setEdit, reset: resetEdits, count: whatIfCount } = useWhatIf()
  const [tab, setTab] = useState('4') // current quarter
  const [byQuarter, setByQuarter] = useState(() => {
    const init = {}
    for (const q of ['1', '2', '3', '4']) {
      const d = peekData('class', { quarter: q })
      if (d) init[q] = { classes: d.assignmentsData || [] }
    }
    return init
  })
  const [loading, setLoading] = useState({})
  const prefs = loadPrefs()

  const loadQuarter = useCallback(async (q, force = false) => {
    const cached = peekData('class', { quarter: q })
    if (!force && cached) { setByQuarter((s) => ({ ...s, [q]: { classes: cached.assignmentsData || [] } })); return }
    setLoading((s) => ({ ...s, [q]: true }))
    try {
      const d = await getData('class', { quarter: q, force })
      setByQuarter((s) => ({ ...s, [q]: { classes: d?.assignmentsData || [] } }))
    } catch (e) {
      setByQuarter((s) => ({ ...s, [q]: { error: e.message } }))
    } finally {
      setLoading((s) => ({ ...s, [q]: false }))
    }
  }, [getData, peekData])

  // Load the data the active tab needs — for a quarter tab, load BOTH quarters
  // of its semester so the semester GPA in the impact panel is real.
  useEffect(() => {
    const need = tab === 'all'
      ? QUARTERS.map((q) => q.value)
      : SEMESTERS.find((s) => s.id === semesterOfQuarter(tab)).quarters
    for (const q of need) {
      if (byQuarter[q] === undefined && !loading[q]) loadQuarter(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // background sync refreshed the cache — pull fresh quarters in place
  useEffect(() => {
    setByQuarter((s) => {
      const n = { ...s }
      for (const q of ['1', '2', '3', '4']) {
        const d = peekData('class', { quarter: q })
        if (d) n[q] = { classes: d.assignmentsData || [] }
      }
      return n
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion])

  return (
    <>
      <PageHead title="Grades" sub="Browse each quarter and edit any assignment — every GPA updates live.">
        {whatIfCount > 0 && <button className="btn ghost sm" onClick={resetEdits}>Reset edits</button>}
        <button className="btn ghost sm" onClick={() => loadQuarter(tab === 'all' ? '4' : tab, true)}>
          <Icon.refresh width={15} height={15} /> Refresh
        </button>
      </PageHead>

      <WhatIfBanner />

      <div className="seg mb-3" style={{ flexWrap: 'wrap' }}>
        {QUARTERS.map((q) => (
          <button key={q.value} className={tab === q.value ? 'active' : ''} onClick={() => setTab(q.value)}>{q.label}</button>
        ))}
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>All quarters</button>
      </div>

      {tab === 'all'
        ? <Overview byQuarter={byQuarter} loading={loading} prefs={prefs} edits={edits} />
        : <QuarterView
            quarter={tab} byQuarter={byQuarter} loading={loading} prefs={prefs}
            edits={edits} setEdit={setEdit} whatIfCount={whatIfCount}
            onRetry={() => loadQuarter(tab, true)}
          />}
    </>
  )
}

// ---- GPA computation helpers (shared by the impact panel) ----
function quarterGpa(classes, quarter, edits, prefs) {
  const rows = (classes || []).map((c) => {
    const avg = roundGrade(effectiveAverage(quarter, c, edits).avg)
    return { grade: avg, weight: weightFor(c.courseName, prefs), credit: 0.5, include: avg != null }
  })
  return { w: weightedGpa(rows).gpa, u: unweightedGpa(rows).gpa }
}

function semesterGpa(byQuarter, semQuarters, edits, prefs) {
  const map = new Map() // courseName -> quarter averages
  for (const q of semQuarters) {
    for (const c of byQuarter[q]?.classes || []) {
      if (!map.has(c.courseName)) map.set(c.courseName, [])
      const avg = effectiveAverage(q, c, edits).avg
      if (avg != null) map.get(c.courseName).push(avg)
    }
  }
  const rows = Array.from(map.entries()).map(([name, qa]) => ({
    grade: liveSemesterAverage(qa), weight: weightFor(name, prefs), credit: 0.5, include: qa.length > 0,
  }))
  return { w: weightedGpa(rows).gpa, u: unweightedGpa(rows).gpa }
}

function QuarterView({ quarter, byQuarter, loading, prefs, edits, setEdit, whatIfCount, onRetry }) {
  const state = byQuarter[quarter]
  if (loading[quarter] || state === undefined) return <Loading label={`Loading ${QUARTERS.find((q) => q.value === quarter)?.label}…`} />
  if (state.error) return <ErrorBox message={state.error} onRetry={onRetry} />
  const classes = state.classes || []
  if (!classes.length) return <Empty>No classes found for this quarter.</Empty>

  const sem = SEMESTERS.find((s) => s.id === semesterOfQuarter(quarter))
  const noEdits = {} // baseline (real grades)

  const curQ = quarterGpa(classes, quarter, edits, prefs)
  const baseQ = quarterGpa(classes, quarter, noEdits, prefs)
  const curS = semesterGpa(byQuarter, sem.quarters, edits, prefs)
  const baseS = semesterGpa(byQuarter, sem.quarters, noEdits, prefs)
  const semReady = sem.quarters.every((q) => byQuarter[q] && !byQuarter[q].error)

  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
      {/* GPA impact — a distinct panel, kept separate from the grade tables */}
      <div className="impact">
        <div className="impact-head">
          <h3>GPA impact {whatIfCount > 0 && <span className="pill" style={{ color: 'var(--yellow)', marginLeft: 6 }}>what-if</span>}</h3>
          <Link to="/gpa" className="btn ghost sm">Full GPA &amp; cumulative <Icon.chevron width={13} height={13} /></Link>
        </div>
        <div className="impact-grid">
          <ImpactCell label={`${QUARTERS.find((q) => q.value === quarter)?.label} · weighted`} cur={curQ.w} base={baseQ.w} digits={4} active={whatIfCount > 0} />
          <ImpactCell label={`${QUARTERS.find((q) => q.value === quarter)?.label} · 4.0`} cur={curQ.u} base={baseQ.u} digits={2} active={whatIfCount > 0} />
          <ImpactCell label={`${sem.short} · weighted`} cur={semReady ? curS.w : null} base={baseS.w} digits={4} active={whatIfCount > 0} />
          <ImpactCell label={`${sem.short} · 4.0`} cur={semReady ? curS.u : null} base={baseS.u} digits={2} active={whatIfCount > 0} />
        </div>
      </div>

      {classes.map((c, i) => (
        <ClassCard key={i} quarter={quarter} course={c} edits={edits} setEdit={setEdit} prefs={prefs} defaultOpen={classes.length <= 2} />
      ))}
    </div>
  )
}

function ImpactCell({ label, cur, base, digits, active }) {
  const fmt = (n) => (n == null ? '—' : digits === 4 ? fmtGpa(n) : n.toFixed(digits))
  const delta = active && cur != null && base != null ? cur - base : null
  const dCls = delta == null || Math.abs(delta) < 0.0005 ? 'delta-zero' : delta > 0 ? 'delta-up' : 'delta-down'
  return (
    <div className="impact-cell">
      <div className="k">{label}</div>
      <div className="v">{cur == null ? <span className="skeleton" style={{ display: 'inline-block', width: 80, height: 22 }} /> : fmt(cur)}</div>
      {active && delta != null && (
        <div className={`d ${dCls}`}>
          {Math.abs(delta) < 0.0005 ? 'no change' : `${delta > 0 ? '+' : ''}${digits === 4 ? delta.toFixed(4) : delta.toFixed(2)} vs real`}
        </div>
      )}
    </div>
  )
}

function ClassCard({ quarter, course, edits, setEdit, prefs, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const eff = effectiveAverage(quarter, course, edits)
  const weight = weightFor(course.courseName, prefs)
  const name = cleanCourseName(course.courseName)
  const delta = eff.edited && eff.official != null && eff.avg != null ? eff.avg - eff.official : null

  const addRow = () => {
    const n = Object.keys(edits).filter((k) => k.startsWith(`${quarter}::${course.courseName}::extra`)).length
    setEdit(editKey(quarter, course.courseName, `extra${n}`), { score: 100, total: 100, name: 'New assignment', hypo: true })
  }

  return (
    <div className="card class-card">
      <div className="class-head" onClick={() => setOpen((o) => !o)}>
        <div>
          <div className="ttl">{name}</div>
          <div className="meta">
            <span className={weightTagClass(weight)}>{weightLabel(weight)} · weight {weight}</span>
            {' · '}{course.assignments?.length || 0} assignments
          </div>
        </div>
        <div className="right">
          {eff.edited && eff.avg != null && (
            <span className="small faint">was <GradeBadge value={eff.official} showLetter={false} /></span>
          )}
          <GradeBadge value={eff.avg} />
          <Icon.chevron className={`chev ${open ? 'open' : ''}`} width={18} height={18} />
        </div>
      </div>

      {open && (
        <div className="assignments">
          {(course.assignments?.length || 0) === 0 ? (
            <div className="empty" style={{ padding: 24 }}>No assignments posted.</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr><th>Assignment</th><th>Category</th><th className="num">Score</th><th className="num">Out of</th><th className="num">%</th></tr>
                  </thead>
                  <tbody>
                    {classRows(quarter, course, edits).map((r) => {
                      const pct = r.score != null && r.total > 0 ? (r.score / r.total) * 100 : null
                      return (
                        <tr key={r.key}>
                          <td>{r.name}{r.edited && <span className="pill" style={{ marginLeft: 8, color: 'var(--yellow)' }}>{r.hypo ? 'added' : 'edited'}</span>}</td>
                          <td className="faint small">{r.category || '—'}</td>
                          <td className="num">
                            <input className="input mini" type="number" step="0.5" value={r.score ?? ''}
                              onChange={(e) => setEdit(r.key, { score: e.target.value === '' ? null : Number(e.target.value) })} />
                          </td>
                          <td className="num">
                            <input className="input mini" type="number" step="1" value={r.total ?? ''}
                              onChange={(e) => setEdit(r.key, { total: e.target.value === '' ? null : Number(e.target.value) })} />
                          </td>
                          <td className="num"><GradeBadge value={pct} showLetter={false} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="row-between" style={{ padding: '12px 20px' }}>
                <button className="btn ghost sm" onClick={addRow}><Icon.plus width={14} height={14} /> Add assignment</button>
                <span className="small faint">
                  Live average is a points-based estimate; HAC weights by category.
                  {delta != null && (
                    <span style={{ color: delta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {' '}({delta >= 0 ? '+' : ''}{delta.toFixed(2)} vs HAC)
                    </span>
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// All-quarters matrix: class rows × Q1–Q4 averages (reflects what-if edits).
function Overview({ byQuarter, loading, prefs, edits }) {
  const anyLoading = QUARTERS.some((q) => loading[q] || byQuarter[q.value] === undefined)

  const courses = useMemo(() => {
    const map = new Map()
    for (const q of QUARTERS) {
      for (const c of byQuarter[q.value]?.classes || []) {
        const k = courseKey(c.courseName)
        if (!map.has(k)) map.set(k, { key: k, name: cleanCourseName(c.courseName), raw: c.courseName, perQ: {} })
        map.get(k).perQ[q.value] = roundGrade(effectiveAverage(q.value, c, edits).avg)
      }
    }
    return Array.from(map.values())
  }, [byQuarter, edits])

  if (anyLoading && courses.length === 0) return <Loading label="Loading all four quarters…" />

  const quarterGpas = {}
  for (const q of QUARTERS) {
    quarterGpas[q.value] = (byQuarter[q.value]?.classes || []).length ? quarterGpa(byQuarter[q.value].classes, q.value, edits, prefs).w : null
  }

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      {anyLoading && <div className="notice" style={{ margin: 16 }}>Loading remaining quarters…</div>}
      <table className="table">
        <thead>
          <tr>
            <th>Class</th><th>Weight</th>
            {QUARTERS.map((q) => <th key={q.value} className="num">{q.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {courses.map((c) => {
            const w = prefs.weights[c.key] ?? detectWeight(c.raw)
            return (
              <tr key={c.key}>
                <td>{c.name}</td>
                <td><span className={weightTagClass(w)}>{w}</span></td>
                {QUARTERS.map((q) => (
                  <td key={q.value} className="num">
                    {c.perQ[q.value] != null ? <GradeBadge value={c.perQ[q.value]} showLetter={false} /> : <span className="faint">—</span>}
                  </td>
                ))}
              </tr>
            )
          })}
          <tr>
            <td colSpan={2} className="faint small" style={{ fontWeight: 700 }}>Quarter GPA</td>
            {QUARTERS.map((q) => (
              <td key={q.value} className="num mono" style={{ fontWeight: 700 }}>
                {quarterGpas[q.value] != null ? fmtGpa(quarterGpas[q.value]) : '—'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
