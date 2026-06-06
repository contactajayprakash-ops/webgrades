import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useWhatIf } from '../context/WhatIfContext.jsx'
import { PageHead, Loading, ErrorBox, Empty, WhatIfBanner } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import {
  detectWeight, parseGrade, classGpa, weightedGpa, unweightedGpa, fmtGpa,
  WEIGHT_OPTIONS, weightTagClass, weightLabel,
} from '../lib/gpa.js'
import { courseKey, transcriptGrade, PERIODS } from '../lib/courses.js'
import {
  PERIOD_QUARTERS, buildLiveRows, buildCurrentLiveRaw, buildCurrentLive,
  buildPriorCourses, buildCumRows, splitTranscript,
} from '../lib/gpaCompute.js'
import { loadPrefs, savePrefs } from '../lib/prefs.js'

export default function Gpa() {
  const { getData, peekData, dataVersion, activeUsername } = useAuth()
  const [prefs, setPrefsState] = useState(() => loadPrefs(activeUsername))
  const [period, setPeriod] = useState('year')
  const [view, setView] = useState('live')

  // seed from the (prefetched/persisted) cache so it renders instantly
  const [quarters, setQuarters] = useState(() => {
    const init = {}
    for (const q of ['1', '2', '3', '4']) {
      const d = peekData('class', { quarter: q })
      if (d) init[q] = { classes: d.assignmentsData || [] }
    }
    return init
  })
  const [qLoading, setQLoading] = useState({})
  const [transcript, setTranscript] = useState(() => {
    const d = peekData('transcript')
    return d ? (d.transcript || []) : undefined
  })
  const [liveGrades, setLiveGrades] = useState({}) // courseName -> grade override
  const [liveExcluded, setLiveExcluded] = useState({}) // courseName -> true
  const { edits, count: whatIfCount } = useWhatIf()

  const updatePrefs = useCallback((mut) => {
    setPrefsState((p) => { const n = structuredClone(p); mut(n); savePrefs(activeUsername, n); return n })
  }, [activeUsername])

  // ---- loaders — read cache instantly, only spin when genuinely empty ----
  const loadQuarter = useCallback(async (q, force = false) => {
    const cached = peekData('class', { quarter: q })
    if (!force && cached) { setQuarters((s) => ({ ...s, [q]: { classes: cached.assignmentsData || [] } })); return }
    setQLoading((s) => ({ ...s, [q]: true }))
    try {
      const d = await getData('class', { quarter: q, force })
      setQuarters((s) => ({ ...s, [q]: { classes: d?.assignmentsData || [] } }))
    } catch (e) {
      setQuarters((s) => ({ ...s, [q]: { error: e.message } }))
    } finally {
      setQLoading((s) => ({ ...s, [q]: false }))
    }
  }, [getData, peekData])

  const loadTranscript = useCallback(async (force = false) => {
    const cached = peekData('transcript')
    if (!force && cached) { setTranscript(cached.transcript || []); return }
    if (!cached) setTranscript(undefined)
    try {
      const d = await getData('transcript', { force })
      setTranscript(d?.transcript || [])
    } catch (e) {
      setTranscript({ error: e.message })
    }
  }, [getData, peekData])

  useEffect(() => {
    for (const q of PERIOD_QUARTERS[period]) {
      if (quarters[q] === undefined && !qLoading[q]) loadQuarter(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  useEffect(() => { loadTranscript() }, [loadTranscript])

  // background sync finished — pull fresh data in place (no spinners)
  useEffect(() => {
    setQuarters((s) => {
      const n = { ...s }
      for (const q of ['1', '2', '3', '4']) {
        const d = peekData('class', { quarter: q })
        if (d) n[q] = { classes: d.assignmentsData || [] }
      }
      return n
    })
    const t = peekData('transcript')
    if (t) setTranscript(t.transcript || [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion])

  // ---- LIVE rows (classwork) ----
  const liveBuild = useMemo(
    () => buildLiveRows({ quarters, period, edits, weights: prefs.weights, liveGrades, liveExcluded }),
    [quarters, period, liveGrades, liveExcluded, prefs.weights, edits]
  )

  const liveResult = weightedGpa(liveBuild.rows)

  // ---- CUMULATIVE rows ----
  // Current-year courses come from LIVE classwork (real names + both semesters,
  // since the transcript only posts sem1 mid-year). PRIOR years come from the
  // transcript. Live semester grades use HAC's rounding so sem1 matches the
  // transcript exactly. Period: s1 -> sem1, s2 -> sem2, year -> avg(sem1, sem2).
  const { latestYear, currentGroup, priorGroups } = useMemo(() => splitTranscript(transcript), [transcript])

  const currentLiveRaw = useMemo(() => buildCurrentLiveRaw({ quarters, edits }), [quarters, edits])
  const currentLive = useMemo(
    () => buildCurrentLive({ currentLiveRaw, currentGroup, latestYear }),
    [currentLiveRaw, currentGroup, latestYear]
  )
  const priorCourses = useMemo(() => buildPriorCourses(priorGroups), [priorGroups])

  const cumConfirmed = prefs.cumulative.confirmed
  const cumIncluded = prefs.cumulative.included

  const cumRows = useMemo(
    () => buildCumRows({ currentLive, priorCourses, included: cumIncluded, period, prefs, latestYear }),
    [currentLive, priorCourses, cumIncluded, period, prefs, latestYear]
  )

  const cumResult = weightedGpa(cumRows)

  // ---- handlers ----
  const setLiveGrade = (key, v) => setLiveGrades((s) => ({ ...s, [key]: v }))
  const setLiveWeight = (name, w) => updatePrefs((p) => { p.weights[courseKey(name)] = Number(w) })
  const resetLive = () => { setLiveGrades({}); setLiveExcluded({}) }
  const hasLiveEdits = Object.keys(liveGrades).length > 0 || Object.keys(liveExcluded).length > 0

  const toggleCum = (code) => updatePrefs((p) => {
    if (p.cumulative.included[code]) delete p.cumulative.included[code]
    else p.cumulative.included[code] = true
  })

  return (
    <>
      <PageHead title="GPA" sub="Weighted GPA by time period — live from current grades, or cumulative across your transcript." />

      <WhatIfBanner />

      {/* time-period axis */}
      <div className="seg mb-3">
        {PERIODS.map((p) => (
          <button key={p.id} className={period === p.id ? 'active' : ''} onClick={() => setPeriod(p.id)}>{p.label}</button>
        ))}
      </div>

      {/* dual headline cards — click to choose which breakdown shows */}
      <div className="grid grid-2 mb-3">
        <HeadlineCard
          active={view === 'live'} onClick={() => setView('live')}
          label="Live GPA" accent="var(--accent)"
          value={liveBuild.ready ? fmtGpa(liveResult.gpa) : null}
          note={`This year’s grades · ${liveResult.credits.toFixed(1)} cr`}
          whatIf={hasLiveEdits || whatIfCount > 0}
        />
        <HeadlineCard
          active={view === 'cumulative'} onClick={() => setView('cumulative')}
          label="Cumulative GPA" accent="var(--accent-2)"
          value={!cumConfirmed ? 'Set up' : (Array.isArray(transcript) ? fmtGpa(cumResult.gpa) : null)}
          note={!cumConfirmed ? 'Pick which courses count →' : `Incl. transcript · ${cumRows.length} courses · ${cumResult.credits.toFixed(1)} cr`}
          whatIf={whatIfCount > 0}
        />
      </div>

      {/* breakdown for the selected view */}
      {view === 'live' ? (
        liveBuild.anyError ? <ErrorBox message={liveBuild.error} onRetry={() => PERIOD_QUARTERS[period].forEach((q) => loadQuarter(q, true))} />
          : !liveBuild.ready ? <Loading label="Averaging quarters…" />
          : liveBuild.rows.length === 0 ? <Empty>No classwork found for this period.</Empty>
          : (
            <>
              <div className="row-between mb-3">
                <div className="small faint">Edit any grade or weight to model a what-if.</div>
                {hasLiveEdits && <button className="btn ghost sm" onClick={resetLive}>Reset</button>}
              </div>
              <GpaTable
                rows={liveBuild.rows} whatIf={hasLiveEdits} editableGrade
                result={liveResult}
                onGrade={(k, v) => setLiveGrade(k, v)}
                onWeight={setLiveWeight}
                onInclude={(k, inc) => setLiveExcluded((s) => { const n = { ...s }; if (inc) delete n[k]; else n[k] = true; return n })}
              />
            </>
          )
      ) : (
        <CumulativeView
          transcript={transcript} currentLive={currentLive} currentGroup={currentGroup}
          priorGroups={priorGroups} latestYear={latestYear} period={period}
          confirmed={cumConfirmed} included={cumIncluded}
          weights={prefs.cumulative.weights} credits={prefs.cumulative.credits || {}} grades={prefs.cumulative.grades || {}}
          rows={cumRows} result={cumResult}
          onToggle={toggleCum} updatePrefs={updatePrefs}
          onRetry={() => loadTranscript(true)}
        />
      )}
    </>
  )
}

function HeadlineCard({ active, onClick, label, value, note, accent, whatIf }) {
  return (
    <button className="card stat" onClick={onClick}
      style={{ textAlign: 'left', cursor: 'pointer', border: active ? `1px solid ${accent}` : undefined, background: active ? undefined : 'var(--bg-soft)' }}>
      {active && <span className="glow" style={{ background: accent }} />}
      <span className="label">{label} {whatIf && <em style={{ color: 'var(--yellow)' }}>· what-if</em>}</span>
      {value == null
        ? <span className="value skeleton" style={{ height: 34, width: 130 }} />
        : <span className="value" style={{ fontSize: value === 'Set up' ? 22 : undefined }}>{value}</span>}
      <span className="meta">{note}</span>
    </button>
  )
}

function WeightSelect({ value, onChange }) {
  return (
    <select className={`select mini ${weightTagClass(value)}`} value={value} onChange={onChange}>
      {WEIGHT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.value} · {weightLabel(o.value)}</option>)}
    </select>
  )
}

function CumulativeView({ transcript, currentLive, currentGroup, priorGroups, latestYear, period, confirmed, included, weights, credits, grades, rows, result, onToggle, updatePrefs, onRetry }) {
  if (transcript === undefined) return <Loading label="Loading your transcript…" />
  if (transcript?.error) return <ErrorBox message={transcript.error} onRetry={onRetry} />
  if (!priorGroups.length && !currentLive.length && Array.isArray(transcript)) {
    return <Loading label="Loading classes…" />
  }

  const selectAllNumeric = () => updatePrefs((p) => {
    for (const c of currentLive) if (c.s1 != null || c.s2 != null) p.cumulative.included[c.key] = true
    for (const g of priorGroups) for (const c of g.courses || []) {
      if (transcriptGrade(c) != null) p.cumulative.included[c.courseCode || `${g.year}-${c.description}`] = true
    }
  })
  const clearAll = () => updatePrefs((p) => { p.cumulative.included = {} })
  const confirm = () => updatePrefs((p) => { p.cumulative.confirmed = true })
  const editSelection = () => updatePrefs((p) => { p.cumulative.confirmed = false })
  const setWeight = (key, w) => updatePrefs((p) => { p.cumulative.weights[key] = Number(w) })
  const setCredit = (key, v) => updatePrefs((p) => { p.cumulative.credits = p.cumulative.credits || {}; p.cumulative.credits[key] = v === '' ? null : Number(v) })
  const resetOverrides = () => updatePrefs((p) => { p.cumulative.weights = {}; p.cumulative.grades = {}; p.cumulative.credits = {} })
  const hasOverrides = Object.keys(weights).length > 0 || Object.keys(grades).length > 0 || Object.keys(credits).length > 0
  const selectedCount = Object.keys(included).length

  if (!confirmed) {
    return (
      <div className="card">
        <div style={{ padding: '18px 20px' }}>
          <h3>Pick the courses that count toward your GPA</h3>
          <p className="small faint mt-2" style={{ marginBottom: 0 }}>
            Current-year classes come from live grades (real names, both semesters). Older courses come from your
            transcript. Check the ones that count toward class rank — pass/fail courses (grade “P”) can’t be averaged.
            Weights and the credit each course is worth (1.0 full-year, 0.5 single-semester) are editable here and remembered.
          </p>
          <div className="flex mt-3">
            <button className="btn ghost sm" onClick={selectAllNumeric}>Select all graded</button>
            <button className="btn ghost sm" onClick={clearAll}>Clear</button>
            {hasOverrides && <button className="btn ghost sm" onClick={resetOverrides}>Reset edits</button>}
            <span className="small faint">{selectedCount} selected</span>
          </div>
        </div>

        {/* current year — from live classwork */}
        <div className="nav-section" style={{ padding: '8px 20px', textTransform: 'none', fontSize: 12.5 }}>
          {latestYear || 'Current year'}{currentGroup ? ` · Grade ${currentGroup.grade} · ${currentGroup.building}` : ''} · from live grades
        </div>
        <table className="table">
          <tbody>
            {currentLive.length === 0 ? (
              <tr><td className="faint small" style={{ padding: '14px 20px' }}>Loading current classes…</td></tr>
            ) : currentLive.map((c) => {
              const w = weights[c.key] ?? detectWeight(c.rawName)
              const defCr = c.s1 != null && c.s2 != null ? 1 : 0.5
              const cr = credits[c.key] ?? defCr
              return (
                <tr key={c.key}>
                  <td style={{ width: 40 }}>
                    <input type="checkbox" checked={!!included[c.key]} onChange={() => onToggle(c.key)}
                      style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                  </td>
                  <td>{c.name}<span className="faint small"> · live</span></td>
                  <td><WeightSelect value={w} onChange={(e) => setWeight(c.key, e.target.value)} /></td>
                  <td className="num faint small">{c.sems}</td>
                  <td className="num mono">{c.s1 != null && c.s2 != null ? ((c.s1 + c.s2) / 2) : (c.s1 ?? c.s2 ?? '—')}</td>
                  <td className="num"><input className="input mini" type="number" step="0.5" min="0" title="Credit" value={cr} onChange={(e) => setCredit(c.key, e.target.value)} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* prior years — from transcript */}
        {priorGroups.map((g, gi) => (
          <div key={gi}>
            <div className="nav-section" style={{ padding: '8px 20px', textTransform: 'none', fontSize: 12.5 }}>
              {g.year} · Grade {g.grade} · {g.building}
            </div>
            <table className="table">
              <tbody>
                {(g.courses || []).map((c, ci) => {
                  const code = c.courseCode || `${g.year}-${c.description}`
                  const grade = transcriptGrade(c)
                  const numeric = grade != null
                  const w = weights[code] ?? detectWeight(c.description, c.courseCode)
                  const cr = credits[code] ?? (parseGrade(c.credit) ?? 0.5)
                  return (
                    <tr key={ci} className={numeric ? '' : 'dim'}>
                      <td style={{ width: 40 }}>
                        <input type="checkbox" disabled={!numeric} checked={!!included[code]} onChange={() => onToggle(code)}
                          style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                      </td>
                      <td>{c.description}<span className="faint small"> · {c.courseCode}</span></td>
                      <td>{numeric && <WeightSelect value={w} onChange={(e) => setWeight(code, e.target.value)} />}</td>
                      <td className="num faint small">{[c.sem1, c.sem2].filter((v) => v).join(' / ') || '—'}</td>
                      <td className="num mono">{numeric ? grade : (c.sem1 || '—')}</td>
                      <td className="num">{numeric && <input className="input mini" type="number" step="0.5" min="0" title="Credit" value={cr} onChange={(e) => setCredit(code, e.target.value)} />}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}

        <div className="row-between" style={{ padding: '16px 20px' }}>
          <span className="small faint">Weights &amp; credits are editable (last column) — change any before showing.</span>
          <button className="btn" disabled={!selectedCount} onClick={confirm}>Show cumulative GPA ({selectedCount})</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="row-between mb-3">
        <div className="small faint">
          {PERIODS.find((p) => p.id === period)?.label} · {rows.length} of your selected courses have a grade for this period.
        </div>
        <div className="flex">
          {hasOverrides && <button className="btn ghost sm" onClick={resetOverrides}>Reset edits</button>}
          <button className="btn ghost sm" onClick={editSelection}>Edit selection</button>
          <button className="btn ghost sm" onClick={onRetry}><Icon.refresh width={15} height={15} /> Refresh</button>
        </div>
      </div>
      {rows.length === 0
        ? <Empty>None of your selected courses have a grade for this period. Try Full Year.</Empty>
        : <GpaTable
            rows={rows} result={result} showYear editableGrade
            onGrade={(k, v) => updatePrefs((p) => { p.cumulative.grades = p.cumulative.grades || {}; p.cumulative.grades[k] = v })}
            onWeight={(k, w) => updatePrefs((p) => { p.cumulative.weights[k] = Number(w) })}
            onCredit={(k, v) => setCredit(k, v)}
            onInclude={(k) => onToggle(k)}
          />}
    </>
  )
}

// ---- shared table ----
function GpaTable({ rows, result, whatIf, showYear, editableGrade, onGrade, onWeight, onCredit, onInclude }) {
  const res = result || weightedGpa(rows)
  const ures = unweightedGpa(rows)
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 18 }}>
      <div className="grid grid-3">
        <div className="card stat">
          <span className="glow" style={{ background: 'var(--accent)' }} />
          <span className="label">Weighted GPA {whatIf && <em style={{ color: 'var(--yellow)' }}>· what-if</em>}</span>
          <span className="value">{fmtGpa(res.gpa)}</span>
          <span className="meta">Frisco 6.0 scale</span>
        </div>
        <div className="card stat">
          <span className="glow" style={{ background: 'var(--green)' }} />
          <span className="label">Unweighted GPA</span>
          <span className="value">{ures.gpa.toFixed(2)}</span>
          <span className="meta">4.0 scale · A=4 B=3 C=2</span>
        </div>
        <div className="card stat">
          <span className="label">Total Credits</span>
          <span className="value">{res.credits.toFixed(1)}</span>
          <span className="meta">{res.points.toFixed(2)} weighted pts</span>
        </div>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>Class</th>
              {showYear && <th>Year</th>}
              <th className="num">Grade</th>
              <th>Weight</th>
              <th className="num">Credit</th>
              <th className="num">Class GPA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cg = r.include ? classGpa(r.grade, r.weight, r.credit) : null
              const edited = r.autoGrade != null && r.grade != null && Math.abs(r.grade - r.autoGrade) > 0.001
              return (
                <tr key={r.key} className={r.include ? '' : 'dim'}>
                  <td>
                    <input type="checkbox" checked={r.include} onChange={(e) => onInclude?.(r.key, e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                  </td>
                  <td>{r.name}{edited && <span className="pill" style={{ marginLeft: 8, color: 'var(--yellow)' }}>edited</span>}</td>
                  {showYear && <td className="faint small">{r.year}</td>}
                  <td className="num">
                    {editableGrade
                      ? <input className="input mini" type="number" step="0.01" value={r.grade ?? ''} onChange={(e) => onGrade?.(r.key, e.target.value === '' ? null : Number(e.target.value))} />
                      : <span className="mono">{r.grade ?? '—'}</span>}
                  </td>
                  <td>
                    <select className={`select mini ${weightTagClass(r.weight)}`} value={r.weight} onChange={(e) => onWeight?.(r.key, e.target.value)}>
                      {WEIGHT_OPTIONS.map((w) => <option key={w.value} value={w.value}>{w.value} · {weightLabel(w.value)}</option>)}
                    </select>
                  </td>
                  <td className="num">
                    {onCredit
                      ? <input className="input mini" type="number" step="0.5" value={r.credit ?? ''} onChange={(e) => onCredit(r.key, e.target.value === '' ? null : Number(e.target.value))} />
                      : <span className="mono faint">{r.credit}</span>}
                  </td>
                  <td className="num mono">{cg == null ? '—' : cg.toFixed(3)}</td>
                </tr>
              )
            })}
            <tr>
              <td colSpan={showYear ? 6 : 5} className="faint small" style={{ fontWeight: 700 }}>Weighted GPA</td>
              <td className="num mono" style={{ fontWeight: 700 }}>{fmtGpa(res.gpa)}</td>
            </tr>
          </tbody>
        </table>
        <div className="small faint" style={{ padding: '14px 20px' }}>
          Formula: <span className="mono">(weight − (100 − grade) × 0.1) × credit</span>, summed ÷ total credits = {res.points.toFixed(2)} ÷ {res.credits.toFixed(1)}.
        </div>
      </div>
    </div>
  )
}
