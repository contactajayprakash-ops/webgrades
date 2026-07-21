import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useGpaMetrics } from '../hooks/useGpaMetrics.js'
import { PageHead } from '../components/ui.jsx'
import { fmtGpa, parseGrade } from '../lib/gpa.js'
import { cleanCourseName } from '../lib/courses.js'

const round2 = (x) => Math.round(x * 100) / 100

export default function Target() {
  return (
    <>
      <PageHead title="Targets" sub="Work backwards from a goal to the grades you actually need." />
      <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 18 }}>
        <GpaGoal />
        <ExamGoal />
        <ClassGoal />
      </div>
    </>
  )
}

function Field({ label, children }) {
  return (
    <label className="field" style={{ gap: 6 }}>
      <span className="small faint" style={{ fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="small faint" style={{ fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 720, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  )
}

// ---- GPA goal: what grades do my remaining credits need to average? ----
function GpaGoal() {
  const m = useGpaMetrics('year')
  const [which, setWhich] = useState('live')
  const [target, setTarget] = useState('')
  const [addCr, setAddCr] = useState('7')

  const src = which === 'cumulative' ? m.cumulative : m.live
  const ready = which === 'cumulative' ? (m.cumConfirmed && m.hasTranscript) : m.ready
  const curGpa = src.weighted
  const points = curGpa * src.credits
  const t = parseFloat(target)
  const a = parseFloat(addCr)

  const rows = useMemo(() => {
    if (!ready || !(t > 0) || !(a > 0)) return null
    const perCredit = (t * (src.credits + a) - points) / a // avg class-GPA the new credits must hit
    return [6.0, 5.5, 5.0].map((w) => ({ w, grade: 100 - (w - perCredit) * 10 }))
  }, [ready, t, a, src.credits, points])

  return (
    <div className="card card-pad">
      <h3 className="mb-3">GPA goal</h3>
      <div className="seg mb-3" style={{ alignSelf: 'flex-start' }}>
        <button className={which === 'live' ? 'active' : ''} onClick={() => setWhich('live')}>Live (this year)</button>
        <button className={which === 'cumulative' ? 'active' : ''} onClick={() => setWhich('cumulative')}>Cumulative</button>
      </div>

      {!ready ? (
        <p className="small faint" style={{ marginTop: 0 }}>
          {which === 'cumulative' ? 'Set up your cumulative GPA first on the GPA page.' : 'Loading your grades…'}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap" style={{ gap: 28, marginBottom: 18 }}>
            <Stat label="Current GPA" value={fmtGpa(curGpa)} />
            <Stat label="Credits so far" value={src.credits.toFixed(1)} />
          </div>

          <div className="flex flex-wrap" style={{ gap: 14, alignItems: 'flex-end' }}>
            <Field label="Target GPA">
              <input className="input" type="number" step="0.01" placeholder="e.g. 5.20" value={target}
                onChange={(e) => setTarget(e.target.value)} style={{ width: 130 }} />
            </Field>
            <Field label="Credits you'll add">
              <input className="input" type="number" step="0.5" value={addCr}
                onChange={(e) => setAddCr(e.target.value)} style={{ width: 130 }} />
            </Field>
          </div>

          {rows && (
            <div className="mt-3">
              <p className="small faint mb-2">
                To reach <b style={{ color: 'var(--text)' }}>{fmtGpa(t)}</b> across{' '}
                <b style={{ color: 'var(--text)' }}>{a}</b> more credit{a === 1 ? '' : 's'}, those courses need to average:
              </p>
              <div className="grid grid-3">
                {rows.map((r) => <NeedCell key={r.w} weight={r.w} grade={r.grade} />)}
              </div>
              <p className="small faint mt-3" style={{ marginBottom: 0 }}>
                Each box assumes all the new credits are at that course level. Mix-and-match lands you in between.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function NeedCell({ weight, grade }) {
  const lbl = weight >= 6 ? 'All AP (6.0)' : weight >= 5.5 ? 'All Advanced (5.5)' : 'All on-level (5.0)'
  let value, color, meta
  if (grade > 100) { value = 'Not reachable'; color = 'var(--red-text)'; meta = 'even a 100 falls short' }
  else if (grade <= 0) { value = 'Locked in'; color = 'var(--green-text)'; meta = 'already guaranteed' }
  else { value = round2(grade) + '%'; color = grade > 97 ? 'var(--orange-text)' : 'var(--text)'; meta = 'avg grade needed' }
  return (
    <div className="card stat" style={{ padding: '16px 18px' }}>
      <span className="label">{lbl}</span>
      <span className="value" style={{ fontSize: 26, color }}>{value}</span>
      <span className="meta">{meta}</span>
    </div>
  )
}

// ---- Final-exam calculator: what do I need on the exam? ----
// final = current*(1 - w) + exam*w  ->  exam = (desired - current*(1 - w)) / w
function ExamGoal() {
  const [current, setCurrent] = useState('')
  const [weight, setWeight] = useState('20')
  const [desired, setDesired] = useState('')

  const cur = parseFloat(current), w = parseFloat(weight) / 100, des = parseFloat(desired)
  const valid = cur >= 0 && w > 0 && w <= 1 && des >= 0
  const needed = valid ? (des - cur * (1 - w)) / w : null

  return (
    <div className="card card-pad">
      <h3 className="mb-3">Final-exam goal</h3>
      <p className="small faint" style={{ marginTop: 0 }}>
        Know your average before the exam and how much the exam counts? See what you need on it.
      </p>
      <div className="flex flex-wrap mt-3" style={{ gap: 14, alignItems: 'flex-end' }}>
        <Field label="Current average">
          <input className="input" type="number" step="0.5" placeholder="e.g. 92" value={current}
            onChange={(e) => setCurrent(e.target.value)} style={{ width: 130 }} />
        </Field>
        <Field label="Exam is worth (%)">
          <input className="input" type="number" step="5" placeholder="e.g. 20" value={weight}
            onChange={(e) => setWeight(e.target.value)} style={{ width: 130 }} />
        </Field>
        <Field label="Grade you want">
          <input className="input" type="number" step="1" placeholder="e.g. 90" value={desired}
            onChange={(e) => setDesired(e.target.value)} style={{ width: 130 }} />
        </Field>
      </div>

      {needed != null && (
        <div className="notice mt-3">
          {needed > 100
            ? `You'd need ${round2(needed)}% on the exam to finish with a ${des}% — not reachable if the exam maxes at 100.`
            : needed <= 0
              ? `You're set — even a 0 on the exam keeps you at or above ${des}%.`
              : `Score ${round2(needed)}% on the final to finish the class with a ${des}%.`}
        </div>
      )}
    </div>
  )
}

// ---- Class grade goal: what do I need on the next assignment? ----
function ClassGoal() {
  const { peekData, dataVersion } = useAuth()

  const classes = useMemo(() => {
    for (const q of ['4', '3', '2', '1']) {
      const list = peekData('class', { quarter: q })?.assignmentsData || []
      if (list.some((c) => parseGrade(c.overallAverage) != null)) return list
    }
    return []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekData, dataVersion])

  const [idx, setIdx] = useState(0)
  const [target, setTarget] = useState('')
  const [pts, setPts] = useState('100')
  const course = classes[Math.min(idx, classes.length - 1)]

  const { earned, possible, avg, cats } = useMemo(() => {
    if (!course) return { earned: 0, possible: 0, avg: null, cats: null }
    let e = 0, p = 0
    // per-category tallies so we can show Assessment (AOL) vs Progress averages
    const acc = { assessment: { e: 0, p: 0, n: 0 }, progress: { e: 0, p: 0, n: 0 } }
    for (const a of course.assignments || []) {
      // real assignments have a real date; HAC's category-total rows don't
      if (!/\d{1,2}\/\d{1,2}\/\d{4}/.test(a.dateDue || '')) continue
      const s = parseGrade(a.grade), tp = parseGrade(a.totalPoints)
      if (s == null || tp == null || tp <= 0) continue
      e += s; p += tp
      const cat = (a.category || '').toLowerCase()
      const bucket = cat.includes('assessment') ? acc.assessment : cat.includes('progress') ? acc.progress : null
      if (bucket) { bucket.e += s; bucket.p += tp; bucket.n += 1 }
    }
    const pct = (b) => (b.p > 0 ? (b.e / b.p) * 100 : null)
    return {
      earned: e, possible: p, avg: parseGrade(course.overallAverage),
      cats: { assessment: { avg: pct(acc.assessment), n: acc.assessment.n }, progress: { avg: pct(acc.progress), n: acc.progress.n } },
    }
  }, [course])

  const t = parseFloat(target), w = parseFloat(pts)
  const needed = (t > 0 && w > 0 && possible > 0) ? (t / 100) * (possible + w) - earned : null
  const neededPct = needed != null ? (needed / w) * 100 : null

  if (!classes.length) {
    return <div className="card card-pad"><h3 className="mb-3">Class grade goal</h3><p className="small faint" style={{ marginTop: 0 }}>No current classes loaded yet.</p></div>
  }

  return (
    <div className="card card-pad">
      <h3 className="mb-3">Class grade goal</h3>
      <Field label="Class">
        <select className="select" value={idx} onChange={(e) => setIdx(Number(e.target.value))} style={{ maxWidth: 360 }}>
          {classes.map((c, i) => <option key={i} value={i}>{cleanCourseName(c.courseName)}</option>)}
        </select>
      </Field>

      <div className="flex flex-wrap mt-3" style={{ gap: 28 }}>
        <Stat label="Current average" value={avg != null ? avg + '%' : '—'} />
        <Stat label="Points so far" value={possible > 0 ? `${round2(earned)} / ${round2(possible)}` : '—'} />
        {cats?.assessment?.avg != null && (
          <Stat label={`Assessment avg (${cats.assessment.n})`} value={round2(cats.assessment.avg) + '%'} />
        )}
        {cats?.progress?.avg != null && (
          <Stat label={`Progress avg (${cats.progress.n})`} value={round2(cats.progress.avg) + '%'} />
        )}
      </div>

      <div className="flex flex-wrap mt-3" style={{ gap: 14, alignItems: 'flex-end' }}>
        <Field label="Target average">
          <input className="input" type="number" step="1" placeholder="e.g. 93" value={target}
            onChange={(e) => setTarget(e.target.value)} style={{ width: 130 }} />
        </Field>
        <Field label="Next assignment worth">
          <input className="input" type="number" step="1" value={pts}
            onChange={(e) => setPts(e.target.value)} style={{ width: 150 }} />
        </Field>
      </div>

      {neededPct != null && possible > 0 && (
        <div className="notice mt-3">
          {neededPct > 100
            ? `A single ${w}-point assignment can't reach ${t}% — you'd need ${round2(neededPct)}% on it. Spread it across more points.`
            : neededPct <= 0
              ? `You're already at or above ${t}% — even a 0 on the next ${w} points keeps you there.`
              : `Score ${round2(neededPct)}% (${round2(needed)} / ${w} pts) on your next ${w}-point assignment to hit a ${t}% average.`}
        </div>
      )}

      <p className="small faint mt-3" style={{ marginBottom: 0 }}>
        Points-based estimate. HAC weights by category (Assessment vs Progress) and the split is set by each teacher, so your real number can differ.
      </p>
    </div>
  )
}
