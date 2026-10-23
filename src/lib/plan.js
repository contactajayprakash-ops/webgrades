// Course planner draft — what a student wants changed in next year's HAC course
// requests, per account. HAC's Career Plan + Requests pages are the source of
// truth for what the school has; this is the student's own delta on top of it:
// courses to ADD (with an optional "alternate" flag) and HAC requests to DROP.
// The Course Plan page shows the draft next to HAC's list and spells out what
// still needs entering in HAC; entries clear themselves once HAC matches.
//
// Stored as `wg_plan_<username>` = { v, years: { "<year>": [entry] } } where
// year is "2027-2028" and an entry is { kind: 'add'|'drop', code, name, credit,
// subject, alt }. Synced across devices with the other settings (useSettingsSync).
import { markSettingsChanged } from './settingsMeta.js'

export const planKeyFor = (username) => `wg_plan_${username || '_anon'}`
const PLAN_VERSION = 1

const empty = () => ({ v: PLAN_VERSION, years: {} })

export function loadPlan(username) {
  try {
    const p = JSON.parse(localStorage.getItem(planKeyFor(username)) || 'null')
    if (p && p.v === PLAN_VERSION && p.years && typeof p.years === 'object') return p
  } catch (_) {}
  return empty()
}

export function savePlan(username, plan) {
  try { localStorage.setItem(planKeyFor(username), JSON.stringify(plan)) } catch (_) {}
  markSettingsChanged()
}

// Draft entries for one school year ("2027-2028").
export const plannedFor = (plan, year) => (plan?.years?.[year] || [])

const setYear = (plan, year, list) => ({ ...plan, years: { ...plan.years, [year]: list } })

// All return a NEW plan object (never mutate). `code` identifies an entry.
export function addCourse(plan, year, entry) {
  const list = plannedFor(plan, year).filter((e) => e.code !== entry.code)
  return setYear(plan, year, [...list, { kind: 'add', alt: false, ...entry }])
}
export function dropCourse(plan, year, entry) {
  const list = plannedFor(plan, year).filter((e) => e.code !== entry.code)
  return setYear(plan, year, [...list, { ...entry, kind: 'drop' }])
}
export function removeEntry(plan, year, code) {
  return setYear(plan, year, plannedFor(plan, year).filter((e) => e.code !== code))
}
export function setAlternate(plan, year, code, alt) {
  return setYear(plan, year, plannedFor(plan, year).map((e) => (e.code === code ? { ...e, alt: !!alt } : e)))
}
// Drop entries HAC already reflects (an add that is now requested, a drop that is
// gone). `inHac(code)` says whether HAC currently lists a course. Returns the
// same object when nothing changed.
export function pruneSatisfied(plan, year, inHac) {
  const list = plannedFor(plan, year)
  const keep = list.filter((e) => (e.kind === 'drop' ? inHac(e.code) : !inHac(e.code)))
  return keep.length === list.length ? plan : setYear(plan, year, keep)
}
