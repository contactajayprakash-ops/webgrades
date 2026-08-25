// A personal weekly planner, per account — the online version of a paper
// student agenda. Tasks are the student's OWN notes ("read ch. 4", "p.32 #1-20")
// pinned to a class and a day; nothing here comes from HAC. Stored per username
// so each profile keeps its own agenda.
const keyFor = (u) => `wg_agenda_${u || '_anon'}`

export function loadAgenda(username) {
  try {
    const a = JSON.parse(localStorage.getItem(keyFor(username)))
    return Array.isArray(a) ? a : []
  } catch (_) { return [] }
}

export function saveAgenda(username, tasks) {
  try { localStorage.setItem(keyFor(username), JSON.stringify(tasks)) } catch (_) {}
}

export const uid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

// ---- Local-date helpers (agenda days are calendar days, never UTC) ----
export function dateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export const todayKey = () => dateKey(new Date())
export function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }

// Monday-start week (school week), but all 7 days are shown.
export function startOfWeek(d) {
  const x = new Date(d)
  const offset = (x.getDay() + 6) % 7 // 0 = Monday
  x.setDate(x.getDate() - offset)
  x.setHours(0, 0, 0, 0)
  return x
}

// The seven day keys of the week containing `weekStart` (a Monday).
export function weekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => dateKey(addDays(weekStart, i)))
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function labelFor(key) {
  const d = parseKey(key)
  return { weekday: WEEKDAY[d.getDay()], day: d.getDate(), month: MONTH[d.getMonth()] }
}
// Full single-day label, e.g. "Monday, Aug 25" — used by the daily view header.
export function dayLabel(key) {
  const d = parseKey(key)
  return `${WEEKDAY_FULL[d.getDay()]}, ${MONTH[d.getMonth()]} ${d.getDate()}`
}

// Remembered device-wide preference for the agenda view ('week' | 'day').
const VIEW_KEY = 'wg_agenda_view'
export function loadAgendaView() {
  try { return localStorage.getItem(VIEW_KEY) === 'day' ? 'day' : 'week' } catch (_) { return 'week' }
}
export function saveAgendaView(v) {
  try { localStorage.setItem(VIEW_KEY, v) } catch (_) {}
}
export function weekRangeLabel(weekStart) {
  const a = weekStart, b = addDays(weekStart, 6)
  const sameMonth = a.getMonth() === b.getMonth()
  return sameMonth
    ? `${MONTH[a.getMonth()]} ${a.getDate()} – ${b.getDate()}`
    : `${MONTH[a.getMonth()]} ${a.getDate()} – ${MONTH[b.getMonth()]} ${b.getDate()}`
}

// A stable pastel hue per course name, so each class reads as its own color.
export function courseHue(name) {
  let h = 0
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}
