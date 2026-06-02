import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { login as apiLogin, fetchData as apiFetchData, fetchIprDates as apiFetchIprDates } from '../api/hac.js'
import { cleanCourseName } from '../lib/courses.js'

const AuthContext = createContext(null)

const STORE_KEY = 'wg_session'
const dataKeyFor = (username) => `wg_data_${username}`

// Every endpoint the app uses — prefetched on load so navigation is instant
// and re-fetched in the background to detect updates. Ordered by what the
// landing (dashboard) needs first.
const RESOURCES = [
  ['class', {}],
  ['class', { quarter: '4' }],
  ['class', { quarter: '3' }],
  ['class', { quarter: '2' }],
  ['class', { quarter: '1' }],
  ['rank', {}],
  ['transcript', {}],
  ['schedule', {}],
  ['attendance', {}],
]

const keyOf = (type, extra) => {
  const { force, ...rest } = extra || {}
  return `${type}:${JSON.stringify(rest)}`
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (s && s.username && s.password) return s
  } catch (_) {}
  return null
}

// Hydrate the cache for a user from localStorage so a reload shows data instantly.
function hydrateCache(username) {
  const m = new Map()
  if (!username) return m
  try {
    const raw = localStorage.getItem(dataKeyFor(username))
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw))) m.set(k, v)
  } catch (_) {}
  return m
}

// Human-readable summary of what changed between two responses for one resource.
function diffResource(type, extra, oldData, newData) {
  if (oldData === undefined || !newData) return []
  try {
    if (type === 'class') {
      const q = extra.quarter ? `Q${extra.quarter}` : 'Current'
      const oldMap = new Map((oldData.assignmentsData || []).map((c) => [c.courseName, c]))
      const out = []
      for (const c of newData.assignmentsData || []) {
        const o = oldMap.get(c.courseName)
        if (!o) continue
        const name = cleanCourseName(c.courseName)
        if (o.overallAverage !== c.overallAverage) {
          out.push(`${name} ${o.overallAverage} → ${c.overallAverage} (${q})`)
        } else {
          const d = (c.assignments?.length || 0) - (o.assignments?.length || 0)
          if (d > 0) out.push(`${name} +${d} new assignment${d > 1 ? 's' : ''} (${q})`)
        }
      }
      return out
    }
    if (type === 'rank') {
      return oldData.gpa !== newData.gpa || oldData.rank !== newData.rank ? ['Class rank / GPA updated'] : []
    }
    const labels = { transcript: 'Transcript', schedule: 'Schedule', attendance: 'Attendance' }
    if (labels[type]) {
      return JSON.stringify(oldData) !== JSON.stringify(newData) ? [`${labels[type]} updated`] : []
    }
  } catch (_) {}
  return []
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadStored)
  const cache = useRef(hydrateCache(session?.username))
  const inflight = useRef(new Map())
  const [dataVersion, setDataVersion] = useState(0) // bumped when cache changes -> consumers re-read

  // background sync state for the toast
  const [sync, setSync] = useState({ phase: 'idle', done: 0, total: 0, changes: [], initial: false })
  const syncing = useRef(false)

  const bump = useCallback(() => setDataVersion((v) => v + 1), [])

  const persistSession = useCallback((s) => {
    if (s && s.remember) localStorage.setItem(STORE_KEY, JSON.stringify(s))
    else localStorage.removeItem(STORE_KEY)
  }, [])

  const persistCache = useCallback((username) => {
    if (!username) return
    try {
      localStorage.setItem(dataKeyFor(username), JSON.stringify(Object.fromEntries(cache.current)))
    } catch (_) {}
  }, [])

  const creds = useMemo(
    () => (session ? { username: session.username, password: session.password } : null),
    [session]
  )
  const credsRef = useRef(creds)
  credsRef.current = creds
  const userRef = useRef(session?.username)
  userRef.current = session?.username

  // Synchronous cache read — lets components render persisted data instantly.
  const peekData = useCallback((type, extra) => cache.current.get(keyOf(type, extra)), [])

  // Cached fetch with in-flight de-duplication. `force` re-fetches.
  const getData = useCallback(async (type, extra) => {
    extra = extra || {}
    const c = credsRef.current
    if (!c) throw new Error('Not signed in.')
    const key = keyOf(type, extra)
    if (!extra.force && cache.current.has(key)) return cache.current.get(key)
    if (inflight.current.has(key)) return inflight.current.get(key)
    const { force, ...rest } = extra
    const p = (async () => {
      try {
        const { data } = await apiFetchData(c, type, rest)
        cache.current.set(key, data)
        persistCache(userRef.current)
        return data
      } finally {
        inflight.current.delete(key)
      }
    })()
    inflight.current.set(key, p)
    return p
  }, [persistCache])

  // Prefetch + revalidate everything. Reports diffs only for data we already had.
  const syncAll = useCallback(async () => {
    const c = credsRef.current
    if (!c || syncing.current) return
    syncing.current = true
    const initial = cache.current.size === 0
    setSync({ phase: 'syncing', done: 0, total: RESOURCES.length, changes: [], initial })
    const changes = []
    for (let i = 0; i < RESOURCES.length; i++) {
      const [type, extra] = RESOURCES[i]
      const key = keyOf(type, extra)
      const old = cache.current.get(key)
      try {
        // force a fresh fetch only when we already had data (revalidation);
        // on first load, no force so it de-dupes with the views' own fetches
        const data = await getData(type, { ...extra, force: old !== undefined })
        changes.push(...diffResource(type, extra, old, data))
        bump() // each completion updates any mounted view in place
      } catch (_) { /* keep stale */ }
      setSync((s) => ({ ...s, done: i + 1 }))
    }
    syncing.current = false
    setSync({ phase: 'done', done: RESOURCES.length, total: RESOURCES.length, changes, initial })
  }, [getData, bump])

  const dismissSync = useCallback(() => setSync((s) => ({ ...s, phase: 'idle' })), [])

  const login = useCallback(async (username, password, remember) => {
    const res = await apiLogin(username, password)
    const s = { username, password, userName: res.userName || username, remember: !!remember }
    cache.current = new Map()
    inflight.current = new Map()
    setSession(s)
    persistSession(s)
    return s
  }, [persistSession])

  const logout = useCallback(() => {
    const u = userRef.current
    cache.current = new Map()
    inflight.current = new Map()
    localStorage.removeItem(STORE_KEY)
    if (u) localStorage.removeItem(dataKeyFor(u))
    setSession(null)
  }, [])

  // Kick off a full prefetch/revalidate whenever we have a session (login or reload).
  useEffect(() => {
    if (creds) syncAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds])

  const getIprDates = useCallback(async () => {
    if (!creds) throw new Error('Not signed in.')
    return apiFetchIprDates(creds)
  }, [creds])

  const clearCache = useCallback(() => { cache.current = new Map(); bump() }, [bump])

  const value = {
    session,
    userName: session?.userName || null,
    isAuthed: !!session,
    login,
    logout,
    getData,
    peekData,
    getIprDates,
    clearCache,
    dataVersion,
    sync,
    syncAll,
    dismissSync,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
