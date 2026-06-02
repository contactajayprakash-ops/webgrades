import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { login as apiLogin, fetchData as apiFetchData, fetchIprDates as apiFetchIprDates } from '../api/hac.js'
import { cleanCourseName } from '../lib/courses.js'

const AuthContext = createContext(null)

const STORE_KEY = 'wg_session' // legacy single-session (migrated to profiles)
const PROFILES_KEY = 'wg_profiles'
const ACTIVE_KEY = 'wg_active'
const dataKeyFor = (username) => `wg_data_${username}`

function loadProfiles() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILES_KEY))
    if (Array.isArray(p)) return p.filter((x) => x && x.username && x.password)
  } catch (_) {}
  // migrate a legacy remembered session into a profile
  const legacy = loadStored()
  return legacy ? [legacy] : []
}

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

// The session to start with: the active profile, else a legacy remembered one.
function initialSession() {
  const profiles = loadProfiles()
  const active = localStorage.getItem(ACTIVE_KEY)
  if (active) {
    const p = profiles.find((x) => x.username === active)
    if (p) return { ...p, remember: true }
  }
  return profiles[0] ? { ...profiles[0], remember: true } : null
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
  const [session, setSession] = useState(initialSession)
  const [profiles, setProfiles] = useState(loadProfiles)
  // One isolated cache per account: username -> Map(key -> data). A fetch always
  // writes to ITS OWN account's cache, so a late background sync from a previous
  // profile can never bleed into the one you switched to.
  const caches = useRef(new Map())
  const inflight = useRef(new Map()) // `${username}|${key}` -> promise
  const syncGen = useRef(0) // bumped on every sync start; aborts superseded syncs
  const [dataVersion, setDataVersion] = useState(0) // bumped when cache changes -> consumers re-read

  // background sync state for the toast
  const [sync, setSync] = useState({ phase: 'idle', done: 0, total: 0, changes: [], initial: false })

  const bump = useCallback(() => setDataVersion((v) => v + 1), [])

  const cacheFor = useCallback((username) => {
    if (!username) return new Map()
    if (!caches.current.has(username)) caches.current.set(username, hydrateCache(username))
    return caches.current.get(username)
  }, [])

  const persistCache = useCallback((username) => {
    if (!username) return
    try {
      localStorage.setItem(dataKeyFor(username), JSON.stringify(Object.fromEntries(cacheFor(username))))
    } catch (_) {}
  }, [cacheFor])

  const creds = useMemo(
    () => (session ? { username: session.username, password: session.password } : null),
    [session]
  )
  const credsRef = useRef(creds)
  credsRef.current = creds
  const userRef = useRef(session?.username)
  userRef.current = session?.username

  // Synchronous read of the ACTIVE account's cache — instant render.
  const peekData = useCallback((type, extra) => cacheFor(userRef.current).get(keyOf(type, extra)), [cacheFor])

  // Cached fetch, scoped to the account it was issued for, with in-flight dedup.
  const getData = useCallback(async (type, extra) => {
    extra = extra || {}
    const c = credsRef.current
    if (!c) throw new Error('Not signed in.')
    const username = c.username
    const key = keyOf(type, extra)
    const acct = cacheFor(username)
    if (!extra.force && acct.has(key)) return acct.get(key)
    const ikey = `${username}|${key}`
    if (inflight.current.has(ikey)) return inflight.current.get(ikey)
    const { force, ...rest } = extra
    const p = (async () => {
      try {
        const { data } = await apiFetchData(c, type, rest)
        cacheFor(username).set(key, data) // write to THIS account's cache, never the active one
        persistCache(username)
        return data
      } finally {
        inflight.current.delete(ikey)
      }
    })()
    inflight.current.set(ikey, p)
    return p
  }, [cacheFor, persistCache])

  // Prefetch + revalidate everything for the current account. Aborts if the
  // user switches accounts mid-sync (a newer sync supersedes this one).
  const syncAll = useCallback(async () => {
    const c = credsRef.current
    if (!c) return
    const username = c.username
    const myGen = ++syncGen.current
    const acct = cacheFor(username)
    const initial = acct.size === 0
    setSync({ phase: 'syncing', done: 0, total: RESOURCES.length, changes: [], initial })
    const changes = []
    for (let i = 0; i < RESOURCES.length; i++) {
      if (syncGen.current !== myGen) return // superseded by an account switch
      const [type, extra] = RESOURCES[i]
      const old = acct.get(keyOf(type, extra))
      try {
        const data = await getData(type, { ...extra, force: old !== undefined })
        changes.push(...diffResource(type, extra, old, data))
        if (syncGen.current === myGen) bump()
      } catch (_) { /* keep stale */ }
      if (syncGen.current === myGen) setSync((s) => ({ ...s, done: i + 1 }))
    }
    if (syncGen.current === myGen) {
      setSync({ phase: 'done', done: RESOURCES.length, total: RESOURCES.length, changes, initial })
    }
  }, [cacheFor, getData, bump])

  const dismissSync = useCallback(() => setSync((s) => ({ ...s, phase: 'idle' })), [])

  const saveProfiles = useCallback((next) => {
    setProfiles(next)
    localStorage.setItem(PROFILES_KEY, JSON.stringify(next))
  }, [])

  // Validate credentials, save as a profile, and switch to it. Used both for
  // the first sign-in and for "Add account".
  const login = useCallback(async (username, password) => {
    const res = await apiLogin(username, password)
    const p = { username, password, userName: res.userName || username }
    setProfiles((prev) => {
      const next = [...prev.filter((x) => x.username !== username), p]
      localStorage.setItem(PROFILES_KEY, JSON.stringify(next))
      return next
    })
    localStorage.setItem(ACTIVE_KEY, username)
    localStorage.removeItem(STORE_KEY)
    setSession({ ...p, remember: true })
    bump()
    return p
  }, [bump])

  const switchProfile = useCallback((username) => {
    const p = profiles.find((x) => x.username === username)
    if (!p || username === session?.username) return
    syncGen.current++ // abort the outgoing account's in-flight sync
    localStorage.setItem(ACTIVE_KEY, username)
    setSession({ ...p, remember: true })
    bump()
  }, [profiles, session, bump])

  const removeProfile = useCallback((username) => {
    const next = profiles.filter((x) => x.username !== username)
    saveProfiles(next)
    caches.current.delete(username)
    localStorage.removeItem(dataKeyFor(username))
    if (session?.username === username) {
      syncGen.current++
      if (next.length) {
        localStorage.setItem(ACTIVE_KEY, next[0].username)
        setSession({ ...next[0], remember: true })
        bump()
      } else {
        localStorage.removeItem(ACTIVE_KEY)
        setSession(null)
      }
    }
  }, [profiles, session, saveProfiles, bump])

  const logout = useCallback(() => {
    syncGen.current++
    localStorage.removeItem(ACTIVE_KEY)
    localStorage.removeItem(STORE_KEY)
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

  const clearCache = useCallback(() => { cacheFor(userRef.current).clear(); bump() }, [cacheFor, bump])

  const value = {
    session,
    userName: session?.userName || null,
    isAuthed: !!session,
    profiles,
    activeUsername: session?.username || null,
    login,
    addAccount: login, // adding an account is the same flow (validate + switch)
    switchProfile,
    removeProfile,
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
