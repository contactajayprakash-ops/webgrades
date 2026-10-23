import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useHacData } from '../hooks/useHacData.js'
import { useFocusTrap } from '../hooks/useFocusTrap.js'
import { PageHead, Loading, ErrorBox, Empty } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'
import Glass from '../components/Glass.jsx'
import Segmented from '../components/Segmented.jsx'
import { weightTagClass } from '../lib/gpa.js'
import { currentSchoolYear } from '../lib/courses.js'
import { loadPlan, savePlan, plannedFor, addCourse, dropCourse, removeEntry, setAlternate, pruneSatisfied } from '../lib/plan.js'
import {
  mergeSemesters, courseStatus, subjectKey, subjectTitle, planSummary, displayCourseName, courseTags,
  courseWeight, weightTag, searchCatalog, gradesLabel, hasCourse, hacTodo, HAC_REQUESTS_URL, HAC_CAREER_PLAN_URL,
} from '../lib/planner.js'

// ---------- small helpers ----------

const fmtCredit = (n) => (n == null ? '—' : Number.isInteger(n) ? `${n}.0` : String(Math.round(n * 100) / 100))
const shortYear = (y) => (y ? y.replace(/^(\d{4})-(\d{2})(\d{2})$/, '$1–$3') : '')
const STATUS_LABEL = { done: 'Earned', current: 'In progress', requested: 'Requested', incomplete: 'Not complete', draft: 'Your draft', dropped: 'Dropping' }

function useMediaQuery(q) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const h = () => setM(mq.matches)
    h()
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [q])
  return m
}

// The per-account draft, kept in sync with profile switches and settings pulls.
function usePlanDraft(username) {
  const [plan, setPlan] = useState(() => loadPlan(username))
  useEffect(() => { setPlan(loadPlan(username)) }, [username])
  useEffect(() => {
    const h = () => setPlan(loadPlan(username))
    window.addEventListener('wg-settings-applied', h)
    return () => window.removeEventListener('wg-settings-applied', h)
  }, [username])
  const update = useCallback((fn) => {
    setPlan((p) => {
      const n = fn(p)
      if (n !== p) savePlan(username, n)
      return n
    })
  }, [username])
  return [plan, update]
}

function WeightTag({ name, code, credit }) {
  if (credit === 0) return null // lunch, release, late arrival: not a class
  const w = courseWeight(name, code)
  const t = weightTag(w)
  if (!t) return null
  return <span className={`wtag ${weightTagClass(w)}`}>{t}</span>
}

function Chip({ entry, status, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`plan-chip ${status}`} onClick={onClick} title={entry.codes ? entry.codes.join(', ') : entry.code}>
      <span className="plan-chip-name">{entry.name}</span>
      <span className="plan-chip-meta">
        {fmtCredit(entry.credit)} cr
        {entry.weight != null && <> · {weightTag(entry.weight)}</>}
        {(entry.tags || []).map((t) => <span key={t}> · {t}</span>)}
        {status === 'draft' && entry.alt && <> · Alternate</>}
      </span>
    </Tag>
  )
}

// ---------- page ----------

export default function Plan() {
  const { activeUsername } = useAuth()
  const cp = useHacData('careerplan', null)
  const [reqYear, setReqYear] = useState(null) // null = HAC's default request year
  const rq = useHacData('requests', reqYear ? { year: reqYear.requestYear, grade: reqYear.grade } : null)
  const [plan, updatePlan] = usePlanDraft(activeUsername)
  const [tab, setTab] = useState('plan')
  const narrow = useMediaQuery('(max-width: 900px)')

  const careerPlan = cp.data
  const requests = rq.data
  const nowYear = currentSchoolYear()
  // The school year the Requests tab is editing.
  const year = requests?.year || reqYear?.year || careerPlan?.requestYears?.[0]?.year || null
  const draft = useMemo(() => plannedFor(plan, year), [plan, year])

  // Once HAC shows a draft entry (or no longer shows a dropped one), it is done.
  const hacCodes = useMemo(() => (requests?.subjects || []).flatMap((s) => (s.courses || []).map((c) => c.code)), [requests])
  useEffect(() => {
    if (!requests || !year) return
    updatePlan((p) => pruneSatisfied(p, year, (code) => hasCourse(hacCodes, code)))
  }, [requests, year, hacCodes, updatePlan])

  const summary = useMemo(() => planSummary(careerPlan), [careerPlan])
  const todo = useMemo(() => hacTodo(requests, draft), [requests, draft])
  const rigor = useMemo(() => {
    const counts = { AP: 0, Adv: 0, Reg: 0 }
    for (const s of requests?.subjects || []) for (const c of s.courses || []) {
      if (draft.some((e) => e.kind === 'drop' && hasCourse([c.code], e.code))) continue
      const t = weightTag(courseWeight(c.name, c.code)); if (t && (c.credit || 0) > 0) counts[t]++
    }
    for (const e of draft) if (e.kind === 'add' && !e.alt) { const t = weightTag(courseWeight(e.hacName || e.name, e.code)); if (t) counts[t]++ }
    return counts
  }, [requests, draft])
  const requestedCredits = useMemo(() => {
    let n = requests?.total ?? 0
    for (const s of requests?.subjects || []) for (const c of s.courses || []) if (draft.some((e) => e.kind === 'drop' && hasCourse([c.code], e.code))) n -= c.credit || 0
    for (const e of draft) if (e.kind === 'add' && !e.alt && e.credit) n += e.credit
    return n
  }, [requests, draft])

  const refresh = () => { cp.refresh(); rq.refresh() }
  const loading = (cp.loading && !careerPlan) || (rq.loading && !requests && tab === 'requests')
  const error = cp.error && !careerPlan ? cp.error : null

  return (
    <>
      <PageHead title="Course Plan" sub="Your four-year plan and next year's course requests, from HAC.">
        <button className="btn ghost sm" onClick={refresh}><Icon.refresh width={15} height={15} /> Refresh</button>
      </PageHead>

      {loading && <Loading />}
      {error && !loading && <ErrorBox message={error} onRetry={refresh} />}

      {!loading && !error && careerPlan && (
        <>
          <div className="dash-tiles plan-tiles">
            <Glass className="card stat" config={{ material: 'regular', borderRadius: 20 }}>
              <span className="label">Credits earned</span>
              <span className="value">{fmtCredit(summary.earned)}</span>
              <span className="meta">of {fmtCredit(summary.needed)} needed · {fmtCredit(summary.inProgress)} in progress</span>
            </Glass>
            <Glass className="card stat" config={{ material: 'regular', borderRadius: 20 }}>
              <span className="label">Next year</span>
              <span className="value">{requests ? fmtCredit(requestedCredits) : '—'}</span>
              <span className="meta">{requests ? `credits requested · Grade ${Number(requests.grade)} · ${shortYear(requests.year)}` : rq.loading ? 'loading requests…' : 'requests not loaded'}</span>
            </Glass>
            <Glass className="card stat" config={{ material: 'regular', borderRadius: 20 }}>
              <span className="label">Rigor next year</span>
              <span className="value">{rigor.AP} AP<span className="plan-rigor-adv">{rigor.Adv} Adv</span></span>
              <span className="meta">{careerPlan.plan || 'Graduation plan'}</span>
            </Glass>
          </div>

          <div className="plan-tabs">
            <Segmented
              ariaLabel="Course plan view"
              options={[{ value: 'plan', label: '4-year plan' }, { value: 'requests', label: 'Requests' }]}
              value={tab} onChange={setTab}
            />
            {tab === 'requests' && careerPlan.requestYears?.length > 1 && (
              <Segmented
                ariaLabel="Request year"
                options={careerPlan.requestYears.map((y) => ({ value: y.year, label: `Grade ${Number(y.grade)}` }))}
                value={reqYear?.year || careerPlan.requestYears[0].year}
                onChange={(v) => { const y = careerPlan.requestYears.find((x) => x.year === v); setReqYear(y && y !== careerPlan.requestYears[0] ? y : null) }}
              />
            )}
          </div>

          {tab === 'plan' && (
            narrow
              ? <PlanByYear careerPlan={careerPlan} draft={draft} year={year} nowYear={nowYear} />
              : <PlanGrid careerPlan={careerPlan} draft={draft} year={year} nowYear={nowYear} />
          )}
          {tab === 'requests' && (
            rq.error && !requests
              ? <ErrorBox message={rq.error} onRetry={rq.refresh} />
              : requests
                ? <RequestsView requests={requests} draft={draft} year={year} todo={todo} updatePlan={updatePlan} careerPlan={careerPlan} />
                : <Loading label="Loading requests from HAC…" />
          )}
        </>
      )}
    </>
  )
}

// ---------- 4-year plan ----------

// One subject's chips for one year: HAC rows (merged S1+S2) plus the draft.
function cellEntries(subject, yearStr, draft, draftYear, nowYear) {
  const merged = mergeSemesters((subject.courses || []).filter((c) => c.year === yearStr))
  const out = merged.map((m) => {
    let status = courseStatus(m, nowYear)
    if (yearStr === draftYear && draft.some((e) => e.kind === 'drop' && m.codes.some((c) => hasCourse([c], e.code)))) status = 'dropped'
    return { entry: m, status }
  })
  if (yearStr === draftYear) {
    const sk = subjectKey(subject)
    for (const e of draft) {
      if (e.kind !== 'add' || e.subject !== sk) continue
      if (merged.some((m) => m.codes.some((c) => hasCourse([c], e.code)))) continue
      out.push({ entry: { name: displayCourseName(e.name), credit: e.credit, weight: courseWeight(e.hacName || e.name, e.code), tags: courseTags(e.hacName || e.name), alt: e.alt, code: e.code }, status: 'draft' })
    }
  }
  return out
}

function Legend() {
  return (
    <div className="plan-legend">
      {['done', 'current', 'requested', 'draft'].map((s) => (
        <span key={s} className="plan-legend-item"><span className={`plan-chip mini ${s}`} />{STATUS_LABEL[s]}</span>
      ))}
    </div>
  )
}

function SubjectCredits({ s }) {
  const ok = (s.estCredit || 0) >= (s.creditNeeded || 0)
  return (
    <span className={`plan-subj-credits ${ok ? 'ok' : 'short'}`} title="Estimated credits / credits needed">
      {fmtCredit(s.estCredit)} / {fmtCredit(s.creditNeeded)}
    </span>
  )
}

function PlanGrid({ careerPlan, draft, year, nowYear }) {
  const years = careerPlan.years || []
  const subjects = careerPlan.subjects || []
  return (
    <div className="card plan-card">
      <div className="plan-grid" style={{ gridTemplateColumns: `minmax(140px, 170px) repeat(${years.length}, minmax(118px, 1fr))` }}>
        <div className="plan-gh plan-gh-first">Subject area</div>
        {years.map((y) => (
          <div key={y.year} className={`plan-gh ${y.year === nowYear ? 'now' : ''}`}>
            Grade {Number(y.grade)} <span className="faint">{shortYear(y.year)}</span>
          </div>
        ))}
        {subjects.map((s) => (
          <div className="plan-row" key={s.name} style={{ display: 'contents' }}>
            <div className="plan-subj">
              <div className="plan-subj-name">{subjectTitle(s.name)}</div>
              <SubjectCredits s={s} />
            </div>
            {years.map((y) => (
              <div key={y.year} className={`plan-cell ${y.year === nowYear ? 'now' : ''}`}>
                {cellEntries(s, y.year, draft, year, nowYear).map(({ entry, status }) => (
                  <Chip key={entry.key || entry.code} entry={entry} status={status} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="plan-foot">
        <Legend />
        <a className="btn ghost sm" href={HAC_CAREER_PLAN_URL} target="_blank" rel="noreferrer">Open in HAC ↗</a>
      </div>
    </div>
  )
}

function PlanByYear({ careerPlan, draft, year, nowYear }) {
  const years = careerPlan.years || []
  const [sel, setSel] = useState(() => (years.find((y) => y.year === nowYear) || years[0])?.year)
  const y = years.find((x) => x.year === sel) || years[0]
  if (!y) return <Empty>No career plan found.</Empty>
  const rows = (careerPlan.subjects || [])
    .map((s) => ({ s, items: cellEntries(s, y.year, draft, year, nowYear) }))
    .filter((r) => r.items.length)
  const credits = rows.reduce((n, r) => n + r.items.filter((i) => i.status !== 'dropped').reduce((m, i) => m + (i.entry.credit || 0), 0), 0)
  return (
    <div className="card plan-card">
      <div className="plan-yearbar">
        <Segmented ariaLabel="School year" options={years.map((x) => ({ value: x.year, label: `Gr ${Number(x.grade)}` }))} value={y.year} onChange={setSel} />
        <span className="small faint">{shortYear(y.year)} · {fmtCredit(credits)} cr</span>
      </div>
      {rows.length === 0 && <Empty>Nothing on the plan for this year yet.</Empty>}
      {rows.map(({ s, items }) => (
        <div className="plan-ysubj" key={s.name}>
          <div className="plan-ysubj-head">
            <span className="plan-subj-name">{subjectTitle(s.name)}</span>
            <SubjectCredits s={s} />
          </div>
          <div className="plan-chips">
            {items.map(({ entry, status }) => <Chip key={entry.key || entry.code} entry={entry} status={status} />)}
          </div>
        </div>
      ))}
      <div className="plan-foot">
        <Legend />
        <a className="btn ghost sm" href={HAC_CAREER_PLAN_URL} target="_blank" rel="noreferrer">Open in HAC ↗</a>
      </div>
    </div>
  )
}

// ---------- requests ----------

const FLAG_LABEL = { required: 'Required', locked: 'Locked', 'incomplete-prerequisite': 'Prerequisite missing', 'alternate-request': 'Alternate' }

function RequestsView({ requests, draft, year, todo, updatePlan, careerPlan }) {
  const [picker, setPicker] = useState(null) // { subject, name }
  const [showAll, setShowAll] = useState(false)
  const subjects = requests.subjects || []
  const numbered = subjects.filter((s) => /^\d+\./.test(s.name))
  const extra = subjects.filter((s) => !/^\d+\./.test(s.name))
  const extraShown = showAll ? extra : extra.filter((s) => (s.courses || []).length || draft.some((e) => e.subject === subjectKey(s)))
  const isDropped = (code) => draft.some((e) => e.kind === 'drop' && hasCourse([code], e.code))
  const draftFor = (s) => draft.filter((e) => e.kind === 'add' && e.subject === subjectKey(s))

  const onDrop = (s, c) => updatePlan((p) => (isDropped(c.code)
    ? removeEntry(p, year, c.code)
    : dropCourse(p, year, { code: c.code, name: c.name, credit: c.credit, subject: subjectKey(s), subjectName: s.name })))
  const onRemove = (code) => updatePlan((p) => removeEntry(p, year, code))
  const onAlt = (code, alt) => updatePlan((p) => setAlternate(p, year, code, alt))
  const onPick = (c) => {
    const s = picker
    updatePlan((p) => addCourse(p, year, { code: c.code, name: c.name, hacName: c.hacName, credit: c.credit ?? null, subject: s.subject, subjectName: s.name }))
  }

  const limit = requests.limits || {}
  return (
    <>
      <div className="card plan-card req-intro">
        <div className="req-intro-main">
          <div className="req-intro-title">Course requests · {shortYear(requests.year)}</div>
          <div className="small faint">{requests.school ? `${requests.school} · ` : ''}Grade {Number(requests.grade)} · {fmtCredit(requests.total)} credits requested{limit.max ? ` · up to ${fmtCredit(limit.max)}` : ''}</div>
        </div>
        <a className="btn ghost sm" href={HAC_REQUESTS_URL} target="_blank" rel="noreferrer">Open in HAC ↗</a>
      </div>

      {todo.length > 0 ? (
        <Glass className="card plan-card todo-card" config={{ material: 'regular', borderRadius: 26 }}>
          <div className="todo-head">
            <Icon.checklist width={18} height={18} />
            <div>
              <div className="todo-title">To enter in HAC</div>
              <div className="small faint">HAC only takes requests on its own site. Open Requests there, then for each subject area:</div>
            </div>
          </div>
          <ol className="todo-list">
            {todo.map((t) => (
              <li key={t.subject}>
                <b>{subjectTitle(t.name)}</b> → <b>Edit</b>, then
                {t.adds.map((e) => <span key={e.code} className="todo-step add">check <b>{displayCourseName(e.name)}</b> <span className="mono faint">{e.code}</span>{e.alt ? ' as an alternate' : ''}</span>)}
                {t.drops.map((e) => <span key={e.code} className="todo-step drop">uncheck <b>{displayCourseName(e.name)}</b> <span className="mono faint">{e.code}</span></span>)}
              </li>
            ))}
          </ol>
          <div className="small faint">This list clears itself once HAC shows the change (refresh here after saving there).</div>
        </Glass>
      ) : draft.length === 0 ? (
        <div className="notice plan-notice">Tap <b>Add</b> under a subject area to plan a course, or <b>Drop</b> to plan removing one. This page then lists exactly what to change in HAC.</div>
      ) : null}

      <div className="grid req-grid">
        {[...numbered, ...extraShown].map((s) => (
          <div className="card plan-card req-subject" key={s.name}>
            <div className="req-head">
              <div className="req-head-text">
                <div className="req-name">{subjectTitle(s.name)}</div>
                <div className="small faint">{fmtCredit(s.total)} cr{s.altTotal ? ` · ${fmtCredit(s.altTotal)} alternate` : ''}{requirementNote(requests, careerPlan, s)}</div>
              </div>
              {s.editable !== false && subjectKey(s) !== 'NOCODE' && (
                <button className="btn ghost sm" onClick={() => setPicker({ subject: subjectKey(s), name: s.name })}><Icon.plus width={14} height={14} /> Add</button>
              )}
            </div>
            {(s.courses || []).length === 0 && draftFor(s).length === 0 && <div className="req-empty">Nothing requested</div>}
            {(s.courses || []).map((c) => (
              <div className={`req-row ${isDropped(c.code) ? 'dropped' : ''}`} key={c.code}>
                <div className="req-row-main">
                  <div className="req-row-name">{displayCourseName(c.name)} <WeightTag name={c.name} code={c.code} credit={c.credit} /></div>
                  <div className="req-row-sub">
                    <span className="mono">{c.code}</span> · {fmtCredit(c.credit)} cr
                    {courseTags(c.name).map((t) => <span key={t}> · {t}</span>)}
                    {(c.flags || []).map((f) => <span key={f} className="req-flag"> · {FLAG_LABEL[f] || f}</span>)}
                    {c.altCredit ? <span> · alternate</span> : null}
                  </div>
                </div>
                <button className="btn ghost sm" onClick={() => onDrop(s, c)}>{isDropped(c.code) ? 'Keep' : 'Drop'}</button>
              </div>
            ))}
            {draftFor(s).map((e) => (
              <div className="req-row draft" key={e.code}>
                <div className="req-row-main">
                  <div className="req-row-name">{displayCourseName(e.name)} <WeightTag name={e.hacName || e.name} code={e.code} /></div>
                  <div className="req-row-sub"><span className="mono">{e.code}</span>{e.credit != null ? ` · ${fmtCredit(e.credit)} cr` : ''} · not in HAC yet</div>
                </div>
                <label className="checkbox req-alt"><input type="checkbox" checked={!!e.alt} onChange={(ev) => onAlt(e.code, ev.target.checked)} /> Alt</label>
                <button className="circle-btn req-x" aria-label="Remove from draft" onClick={() => onRemove(e.code)}><Icon.trash width={15} height={15} /></button>
              </div>
            ))}
          </div>
        ))}
      </div>
      {extra.length > extraShown.length && (
        <button className="btn ghost sm" style={{ marginTop: 14 }} onClick={() => setShowAll(true)}>Show all subject areas ({extra.length - extraShown.length} more)</button>
      )}

      {picker && (
        <Picker subject={picker.subject} subjectName={picker.name} grade={Number(requests.grade) || null} existing={[...(subjects.find((s) => subjectKey(s) === picker.subject)?.courses || []).map((c) => c.code), ...draft.filter((e) => e.kind === 'add').map((e) => e.code)]} onPick={onPick} onClose={() => setPicker(null)} />
      )}
    </>
  )
}

// "needs 1.0 more" from HAC's graduation credit table, when it says so.
function requirementNote(requests, careerPlan, s) {
  const row = (requests.requirements || []).find((r) => subjectKey(r.name) === subjectKey(s))
  if (!row || !(row.needed > 0)) return null
  return ` · ${fmtCredit(row.needed)} still needed to graduate`
}

function Picker({ subject, subjectName, grade, existing, onPick, onClose }) {
  const [q, setQ] = useState('')
  const [scope, setScope] = useState(subject === '12' ? 'all' : 'subject')
  const ref = useFocusTrap(true, onClose)
  const results = useMemo(() => searchCatalog(q, { subject: scope === 'subject' ? subject : null, grade }), [q, scope, subject, grade])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return (
    <>
      <div className="install-backdrop" onClick={onClose} />
      <div className="picker-wrap" ref={ref} role="dialog" aria-modal="true" aria-label={`Add a course to ${subjectTitle(subjectName)}`}>
      <Glass className="picker-sheet" config={{ material: 'thick', borderRadius: 26 }}>
        <div className="picker-head">
          <div>
            <div className="install-title">Add to {subjectTitle(subjectName)}</div>
            <div className="install-sub">FISD course catalog{grade ? ` · Grade ${grade} courses first` : ''} · tap one to add it to your draft</div>
          </div>
          <button className="circle-btn" aria-label="Close" onClick={onClose} style={{ fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <label className="sidebar-search picker-search">
          <Icon.search width={15} height={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses" aria-label="Search courses" autoFocus />
        </label>
        <Segmented ariaLabel="Catalog scope" className="picker-scope" options={[{ value: 'subject', label: 'This subject' }, { value: 'all', label: 'All courses' }]} value={scope} onChange={setScope} />
        <div className="picker-list">
          {results.length === 0 && <div className="req-empty">No matches{scope === 'subject' ? ' — try All courses' : ''}.</div>}
          {results.map((c) => {
            const have = hasCourse(existing, c.code)
            const offered = !grade || c.grades.includes(grade)
            const tag = c.level === 'AP' || c.level === 'IB' ? c.level : weightTag(c.weight) === 'Adv' ? 'Adv' : null
            return (
              <button key={c.code} className={`picker-row ${have ? 'have' : ''} ${offered ? '' : 'later'}`} disabled={have} onClick={() => { onPick(c); onClose() }}>
                <span className="picker-row-main">
                  <span className="req-row-name">{displayCourseName(c.name)} {tag && <span className={`wtag ${weightTagClass(c.weight ?? 5)}`}>{tag}</span>}</span>
                  <span className="req-row-sub">
                    <span className="mono">{c.code}</span> · {fmtCredit(c.credit)} cr · <span className={offered ? '' : 'picker-warn'}>{gradesLabel(c.grades)}</span>
                    {c.level && c.level !== tag && <> · {c.level}</>}
                    {c.virtual && <> · Virtual</>}
                  </span>
                  {c.prereq && <span className="picker-prereq">Needs: {c.prereq}</span>}
                </span>
                <span className="picker-row-act">{have ? 'Added' : 'Add'}</span>
              </button>
            )
          })}
        </div>
      </Glass>
      </div>
    </>
  )
}
