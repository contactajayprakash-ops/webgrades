import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useWhatIf } from '../context/WhatIfContext.jsx'
import { PageHead, Loading, ErrorBox, Empty, WhatIfBanner } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import { effectiveAverage } from '../lib/whatif.js'
import {
  detectWeight, parseGrade, classGpa, weightedGpa, unweightedGpa, semesterGrade, liveSemesterAverage, fmtGpa,
  WEIGHT_OPTIONS, weightTagClass, weightLabel,
} from '../lib/gpa.js'
import { cleanCourseName, courseKey, transcriptGrade, transcriptPeriod, PERIODS } from '../lib/courses.js'
import { loadPrefs, savePrefs } from '../lib/prefs.js'

const PERIOD_QUARTERS = { s1: ['1', '2'], s2: ['3', '4'], year: ['1', '2', '3', '4'] }

// Period-scoped grade + credit for a live current-year course (q = {1:avg,...}).
// Semester grades use HAC's rounding; the full-year grade is the average of the
// two whole-number semester grades (so 96 & 92 -> 94, and a one-sem 96 -> 96).
// Period grade + credit for a resolved current-year course. s1/s2 are the
// OFFICIAL transcript semester grades when posted, else the live estimate.
function resolvedPeriod(c, period) {
  if (period === 's1') return c.s1 == null ? null : { grade: c.s1, credit: 0.5 }
  if (period === 's2') return c.s2 == null ? null : { grade: c.s2, credit: 0.5 }
  const sems = [c.s1, c.s2].filter((x) => x != null)
  if (!sems.length) return null
  return { grade: sems.reduce((a, b) => a + b, 0) / sems.length, credit: c.credit }
}

// Match each live current-year course to its transcript course so we can use
// HAC's official semester grades. Live `semesterGrade` equals the posted sem1
// for every course, so grades are a reliable join key (text breaks ties).
const normName = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
function matchOfficial(liveCourses, txCourses) {
  const pairs = []
  for (const L of liveCourses) for (const T of txCourses) {
    const t1 = parseGrade(T.sem1), t2 = parseGrade(T.sem2)
    let s = 0
    if (L.rawS1 != null && t1 != null && L.rawS1 === t1) s += 100
    if (L.rawS2 != null && t2 != null && L.rawS2 === t2) s += 50
    const a = normName(L.name), b = normName(T.description)
    if (a && b && (a.includes(b) || b.includes(a))) s += 20
    if (s > 0) pairs.push({ L, T, s })
  }
  pairs.sort((a, b) => b.s - a.s)
  const uL = new Set(), uT = new Set(), map = {}
  for (const p of pairs) {
    if (uL.has(p.L.key) || uT.has(p.T.code)) continue
    map[p.L.key] = { sem1: parseGrade(p.T.sem1), sem2: parseGrade(p.T.sem2), credit: parseGrade(p.T.credit) }
    uL.add(p.L.key); uT.add(p.T.code)
  }
  return map
}

export default function Gpa() {
  const { getData, peekData, dataVersion } = useAuth()
  const [prefs, setPrefsState] = useState(loadPrefs)
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
    setPrefsState((p) => { const n = structuredClone(p); mut(n); savePrefs(n); return n })
  }, [])

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
  const weightForLive = useCallback((name) => prefs.weights[courseKey(name)] ?? detectWeight(name), [prefs])

  const liveBuild = useMemo(() => {
    const mergeQuarters = (qs) => {
      const map = new Map() // courseName -> grades[]
      for (const q of qs) {
        for (const c of quarters[q]?.classes || []) {
          if (!map.has(c.courseName)) map.set(c.courseName, [])
          const g = effectiveAverage(q, c, edits).avg
          if (g != null) map.get(c.courseName).push(g)
        }
      }
      return Array.from(map.entries()).map(([name, grades]) => {
        // Live semester average = average of the rounded quarters (NOT re-rounded),
        // so the live GPA stays consistent with the quarter GPAs.
        const auto = liveSemesterAverage(grades)
        return { key: name, name: cleanCourseName(name), rawName: name, autoGrade: auto }
      })
    }
    const semRows = period === 's2' ? mergeQuarters(['3', '4'])
      : period === 's1' ? mergeQuarters(['1', '2'])
      : [...mergeQuarters(['1', '2']), ...mergeQuarters(['3', '4'])]

    const needed = PERIOD_QUARTERS[period]
    const ready = needed.every((q) => quarters[q] && !quarters[q].error)
    const anyError = needed.some((q) => quarters[q]?.error)
    const rows = semRows.map((r) => ({
      key: r.key, name: r.name,
      grade: liveGrades[r.key] !== undefined ? liveGrades[r.key] : r.autoGrade,
      autoGrade: r.autoGrade,
      weight: weightForLive(r.rawName),
      credit: 0.5,
      include: !liveExcluded[r.key] && (liveGrades[r.key] !== undefined ? liveGrades[r.key] : r.autoGrade) != null,
    }))
    return { rows, ready, anyError, error: needed.map((q) => quarters[q]?.error).find(Boolean) }
  }, [quarters, period, liveGrades, liveExcluded, weightForLive, edits])

  const liveResult = weightedGpa(liveBuild.rows)

  // ---- CUMULATIVE rows ----
  // Current-year courses come from LIVE classwork (real names + both semesters,
  // since the transcript only posts sem1 mid-year). PRIOR years come from the
  // transcript. Live semester grades use HAC's rounding so sem1 matches the
  // transcript exactly. Period: s1 -> sem1, s2 -> sem2, year -> avg(sem1, sem2).
  const txGroups = Array.isArray(transcript) ? transcript : []
  const latestYear = useMemo(() => txGroups.reduce((m, g) => (g.year > m ? g.year : m), ''), [txGroups])
  const currentGroup = useMemo(() => txGroups.find((g) => g.year === latestYear), [txGroups, latestYear])
  const priorGroups = useMemo(() => txGroups.filter((g) => g.year !== latestYear), [txGroups, latestYear])

  // Current-year courses from live classwork (computed semester grades).
  const currentLiveRaw = useMemo(() => {
    const map = new Map()
    for (const q of ['1', '2', '3', '4']) {
      for (const c of quarters[q]?.classes || []) {
        const k = courseKey(c.courseName)
        if (!map.has(k)) map.set(k, { key: k, name: cleanCourseName(c.courseName), rawName: c.courseName, q: {} })
        const g = effectiveAverage(q, c, edits).avg
        if (g != null) map.get(k).q[q] = g
      }
    }
    return Array.from(map.values()).map((c) => {
      const s1 = semesterGrade([c.q['1'], c.q['2']])
      const s2 = semesterGrade([c.q['3'], c.q['4']])
      return { ...c, rawS1: s1, rawS2: s2 }
    })
  }, [quarters, edits])

  // Map live courses to their official transcript grades (current school year).
  const officialMap = useMemo(() => {
    const txCur = (currentGroup?.courses || []).map((c) => ({ ...c, code: c.courseCode || `${latestYear}-${c.description}` }))
    return txCur.length ? matchOfficial(currentLiveRaw, txCur) : {}
  }, [currentLiveRaw, currentGroup, latestYear])

  // Resolved current courses: use HAC's posted semester grades + credit when
  // available (year finalized), else fall back to the live estimate (mid-year).
  const currentLive = useMemo(() => currentLiveRaw.map((c) => {
    const o = officialMap[c.key]
    const s1 = o && o.sem1 != null ? o.sem1 : c.rawS1
    const s2 = o && o.sem2 != null ? o.sem2 : c.rawS2
    const credit = o && o.credit != null && s1 != null && s2 != null ? o.credit : (s1 != null && s2 != null ? 1 : 0.5)
    return { ...c, s1, s2, credit, official: !!o, sems: [s1, s2].filter((x) => x != null).join(' / ') || '—' }
  }), [currentLiveRaw, officialMap])

  const priorCourses = useMemo(() => {
    const out = []
    for (const g of priorGroups) for (const c of g.courses || []) {
      out.push({ ...c, code: c.courseCode || `${g.year}-${c.description}`, year: g.year })
    }
    return out
  }, [priorGroups])

  const cumConfirmed = prefs.cumulative.confirmed
  const cumIncluded = prefs.cumulative.included

  const cumRows = useMemo(() => {
    const rows = []
    // current year — official transcript grades when posted, else live estimate
    for (const c of currentLive) {
      if (!cumIncluded[c.key]) continue
      const pg = resolvedPeriod(c, period)
      if (!pg) continue
      rows.push({
        key: c.key, name: c.name, year: latestYear,
        grade: prefs.cumulative.grades?.[c.key] ?? pg.grade, autoGrade: pg.grade,
        weight: prefs.cumulative.weights[c.key] ?? detectWeight(c.rawName),
        credit: prefs.cumulative.credits?.[c.key] ?? pg.credit, include: true,
      })
    }
    // prior years — completed, so they ALWAYS count at their full-year grade
    // and full credit, in every period (a cumulative GPA is a running total).
    for (const c of priorCourses) {
      if (!cumIncluded[c.code]) continue
      const pg = transcriptPeriod(c, 'year')
      if (!pg) continue
      rows.push({
        key: c.code, name: c.description || c.code, year: c.year,
        grade: prefs.cumulative.grades?.[c.code] ?? pg.grade, autoGrade: pg.grade,
        weight: prefs.cumulative.weights[c.code] ?? detectWeight(c.description, c.courseCode),
        credit: prefs.cumulative.credits?.[c.code] ?? pg.credit, include: true,
      })
    }
    return rows
  }, [currentLive, priorCourses, cumIncluded, period, prefs, latestYear])

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
