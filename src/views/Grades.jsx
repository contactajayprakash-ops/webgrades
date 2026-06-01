import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { PageHead, Loading, ErrorBox, Empty, GradeBadge } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import { parseGrade, detectWeight, weightedGpa, roundGrade, fmtGpa, weightLabel, weightTagClass } from '../lib/gpa.js'
import { cleanCourseName, courseKey, estimateAverage, QUARTERS } from '../lib/courses.js'
import { loadPrefs } from '../lib/prefs.js'

// editKey identifies one assignment field: quarter + course + row index.
const ek = (q, course, i) => `${q}::${course}::${i}`

export default function Grades() {
  const { getData } = useAuth()
  const [tab, setTab] = useState('4') // current quarter
  const [byQuarter, setByQuarter] = useState({}) // quarter -> { classes, error }
  const [loading, setLoading] = useState({}) // quarter -> bool
  const [edits, setEdits] = useState({}) // editKey -> { score, total }
  const prefs = loadPrefs()

  const loadQuarter = useCallback(async (q, force = false) => {
    setByQuarter((s) => (force ? { ...s, [q]: undefined } : s))
    setLoading((s) => ({ ...s, [q]: true }))
    try {
      const d = await getData('class', { quarter: q, force })
      setByQuarter((s) => ({ ...s, [q]: { classes: d?.assignmentsData || [] } }))
    } catch (e) {
      setByQuarter((s) => ({ ...s, [q]: { classes: [], error: e.message } }))
    } finally {
      setLoading((s) => ({ ...s, [q]: false }))
    }
  }, [getData])

  // Ensure the data the active tab needs is loaded.
  useEffect(() => {
    const need = tab === 'all' ? QUARTERS.map((q) => q.value) : [tab]
    for (const q of need) {
      if (byQuarter[q] === undefined && !loading[q]) loadQuarter(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const setEdit = (key, patch) =>
    setEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }))
  const resetEdits = () => setEdits({})
  const hasEdits = Object.keys(edits).length > 0

  return (
    <>
      <PageHead title="Grades" sub="Browse each quarter and edit any assignment to see live impact on your averages and GPA.">
        {hasEdits && <button className="btn ghost sm" onClick={resetEdits}>Reset edits</button>}
        <button className="btn ghost sm" onClick={() => loadQuarter(tab === 'all' ? '4' : tab, true)}>
          <Icon.refresh width={15} height={15} /> Refresh
        </button>
      </PageHead>

      <div className="seg mb-3" style={{ flexWrap: 'wrap' }}>
        {QUARTERS.map((q) => (
          <button key={q.value} className={tab === q.value ? 'active' : ''} onClick={() => setTab(q.value)}>{q.label}</button>
        ))}
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>All quarters</button>
      </div>

      {tab === 'all'
        ? <Overview byQuarter={byQuarter} loading={loading} prefs={prefs} />
        : <QuarterView
            quarter={tab}
            state={byQuarter[tab]}
            loading={loading[tab]}
            edits={edits}
            setEdit={setEdit}
            onRetry={() => loadQuarter(tab, true)}
            prefs={prefs}
          />}
    </>
  )
}

// Compute a class's effective assignment rows + live average given edits.
function liveClass(quarter, course, edits) {
  const base = (course.assignments || []).map((a, i) => {
    const key = ek(quarter, course.courseName, i)
    const e = edits[key]
    return {
      key,
      name: a.assignmentName || 'Assignment',
      category: a.category,
      dateDue: a.dateDue,
      score: e?.score !== undefined ? e.score : parseGrade(a.grade),
      total: e?.total !== undefined ? e.total : (parseGrade(a.totalPoints) ?? 100),
      edited: !!e,
    }
  })
  const official = parseGrade(course.overallAverage)
  const live = estimateAverage(base)
  const anyEdit = base.some((b) => b.edited)
  // Use the live estimate only when the student has actually edited something —
  // otherwise trust HAC's (category-weighted) official average.
  const effective = anyEdit ? live : official
  return { rows: base, official, live, effective, anyEdit }
}

function weightFor(course, prefs) {
  const k = courseKey(course.courseName)
  return prefs.weights[k] ?? detectWeight(course.courseName)
}

function QuarterView({ quarter, state, loading, edits, setEdit, onRetry, prefs }) {
  if (loading || state === undefined) return <Loading label={`Loading ${QUARTERS.find((q) => q.value === quarter)?.label}…`} />
  if (state.error) return <ErrorBox message={state.error} onRetry={onRetry} />
  const classes = state.classes || []
  if (!classes.length) return <Empty>No classes found for this quarter.</Empty>

  // Live quarter GPA from each class's effective average.
  const rows = classes.map((c) => {
    const lc = liveClass(quarter, c, edits)
    return { grade: roundGrade(lc.effective), weight: weightFor(c, prefs), credit: 0.5, include: lc.effective != null }
  })
  const { gpa } = weightedGpa(rows)
  const edited = classes.some((c) => liveClass(quarter, c, edits).anyEdit)

  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
      <div className="card stat" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span className="label">Quarter GPA {edited && <em style={{ color: 'var(--yellow)' }}>· what-if</em>}</span>
          <div className="value" style={{ marginTop: 6 }}>{fmtGpa(gpa)}</div>
        </div>
        <div className="small faint" style={{ maxWidth: 260, textAlign: 'right' }}>
          Weighted GPA if this quarter’s averages were your semester grades. Edit assignments below to watch it move.
        </div>
      </div>

      {classes.map((c, i) => (
        <ClassCard key={i} quarter={quarter} course={c} edits={edits} setEdit={setEdit} prefs={prefs} defaultOpen={classes.length <= 2} />
      ))}
    </div>
  )
}

function ClassCard({ quarter, course, edits, setEdit, prefs, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const lc = liveClass(quarter, course, edits)
  const weight = weightFor(course, prefs)
  const name = cleanCourseName(course.courseName)
  const delta = lc.anyEdit && lc.official != null && lc.live != null ? lc.live - lc.official : null

  const addRow = () => {
    const i = (course.assignments?.length || 0) + Object.keys(edits).filter((k) => k.startsWith(`${quarter}::${course.courseName}::extra`)).length
    setEdit(`${quarter}::${course.courseName}::extra${i}`, { score: 100, total: 100, name: 'New assignment', hypo: true })
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
          {lc.anyEdit && lc.live != null && (
            <span className="small faint">was <GradeBadge value={lc.official} showLetter={false} /></span>
          )}
          <GradeBadge value={lc.effective} />
          <Icon.chevron className={`chev ${open ? 'open' : ''}`} width={18} height={18} />
        </div>
      </div>

      {open && (
        <div className="assignments">
          {lc.rows.length === 0 ? (
            <div className="empty" style={{ padding: 24 }}>No assignments posted.</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr><th>Assignment</th><th>Category</th><th className="num">Score</th><th className="num">Out of</th><th className="num">%</th></tr>
                  </thead>
                  <tbody>
                    {lc.rows.map((r) => {
                      const pct = r.score != null && r.total > 0 ? (r.score / r.total) * 100 : null
                      return (
                        <tr key={r.key} className={r.edited ? '' : ''}>
                          <td>{r.name}{r.edited && <span className="pill" style={{ marginLeft: 8, color: 'var(--yellow)' }}>edited</span>}</td>
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
                <span className="small faint">
                  Live average is a points-based estimate; HAC weights by category. {delta != null && (
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

// All-quarters matrix: class rows × Q1–Q4 averages.
function Overview({ byQuarter, loading, prefs }) {
  const anyLoading = QUARTERS.some((q) => loading[q] || byQuarter[q.value] === undefined)

  // Union of courses by stable key, in the order first seen.
  const courses = useMemo(() => {
    const map = new Map()
    for (const q of QUARTERS) {
      for (const c of byQuarter[q.value]?.classes || []) {
        const k = courseKey(c.courseName)
        if (!map.has(k)) map.set(k, { key: k, name: cleanCourseName(c.courseName), raw: c.courseName, perQ: {} })
        map.get(k).perQ[q.value] = parseGrade(c.overallAverage)
      }
    }
    return Array.from(map.values())
  }, [byQuarter])

  if (anyLoading && courses.length === 0) return <Loading label="Loading all four quarters…" />

  // Per-quarter GPA across the bottom.
  const quarterGpa = {}
  for (const q of QUARTERS) {
    const rows = (byQuarter[q.value]?.classes || []).map((c) => ({
      grade: roundGrade(parseGrade(c.overallAverage)), weight: weightFor(c, prefs), credit: 0.5, include: true,
    }))
    quarterGpa[q.value] = rows.length ? weightedGpa(rows).gpa : null
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
                {quarterGpa[q.value] != null ? fmtGpa(quarterGpa[q.value]) : '—'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
