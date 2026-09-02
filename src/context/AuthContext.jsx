import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { login as apiLogin, fetchData as apiFetchData, fetchIprDates as apiFetchIprDates, fetchBatch as apiFetchBatch, wake as apiWake } from '../api/hac.js'
import { cleanCourseName, guessCurrentQuarter } from '../lib/courses.js'
import { clearPrefs } from '../lib/prefs.js'

const AuthContext = createContext(null)

const STORE_KEY = 'wg_session' // legacy single-session (migrated to profiles)
const PROFILES_KEY = 'wg_profiles'
const ACTIVE_KEY = 'wg_active'
const dataKeyFor = (username) => `wg_data_${username}`
const syncedKeyFor = (username) => `wg_synced_${username}`

// When a full sync last completed for this account (ms epoch), so we can show
// "grades as of Xm ago" — persisted so it survives reloads and shows honestly
// while offline.
function loadSyncedAt(username) {
  if (!username) return 0
  const v = Number(localStorage.getItem(syncedKeyFor(username)))
  return Number.isFinite(v) ? v : 0
}

function loadProfiles() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILES_KEY))
    if (Array.isArray(p)) return p.filter((x) => x && x.username && x.password)
  } catch (_) {}
  // migrate a legacy remembered session into a profile
  const legacy = loadStored()
  return legacy ? [legacy] : []
}

// Resources grouped into priority WAVES, each fetched as ONE batched round-trip
// (server logs into HAC once per wave). The whole point: a grade-drop refresh
// only needs wave 1 — the CURRENT quarter's grades, the one thing everyone opens
// the app for — so it lands and paints FIRST, before the slower GPA wave (other
// quarters + rank + transcript) even starts. GPA data follows; rarely-changing
// cold data is last and only fetched when it's missing from the cache.
//
// The pages read grades keyed by quarter number (`class {quarter:N}`), so wave 1
// MUST fetch that keyed current quarter — not just the generic `class {}` — or
// the Dashboard/Grades keep showing stale data until the whole GPA wave finishes.
const ALL_QUARTERS = ['4', '3', '2', '1']
function buildHotGpaWaves(curQ) {
  const hot = [['class', {}], ['class', { quarter: curQ }]]
  const gpa = [
    ['rank', {}],
    ['transcript', {}], // rank + transcript share one HAC page — merged server-side
    ...ALL_QUARTERS.filter((q) => q !== curQ).map((q) => ['class', { quarter: q }]),
  ]
  return [hot, gpa]
}
const WAVE_COLD = [
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
      const graded = (g) => g != null && String(g).trim() !== '' && /\d/.test(String(g))
      const out = []
      for (const c of newData.assignmentsData || []) {
        const o = oldMap.get(c.courseName)
        if (!o) continue
        const name = cleanCourseName(c.courseName)
        // Name the exact assignment(s) that were graded/changed, not just the avg.
        const oldA = new Map((o.assignments || []).map((a) => [a.assignmentName, a.grade]))
        let listed = 0
        for (const a of c.assignments || []) {
          if (!graded(a.grade) || oldA.get(a.assignmentName) === a.grade) continue
          out.push(`${name} — ${a.assignmentName || 'Assignment'}: ${String(a.grade).trim()}`)
          listed++
        }
        if (!listed && o.overallAverage !== c.overallAverage) {
          out.push(`${name} ${o.overallAverage} → ${c.overallAverage} (${q})`)
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
  const syncing = useRef(false) // a full (active-account) sync is currently running
  const bgSyncing = useRef(false) // a quiet background-profile sync is running
  const lastSyncAt = useRef(0) // ms timestamp of the last sync start (resume throttle)
  const [dataVersion, setDataVersion] = useState(0) // bumped when cache changes -> consumers re-read

  // background sync state for the toast
  const [sync, setSync] = useState({ phase: 'idle', done: 0, total: 0, changes: [], initial: false })
  const [syncedAt, setSyncedAt] = useState(() => loadSyncedAt(initialSession()?.username))

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
  const profilesRef = useRef(profiles)
  profilesRef.current = profiles

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

  // Prefetch + revalidate everything for the current account, wave by wave, so
  // the current grades (wave 1) refresh and paint FIRST. Each wave is a single
  // batched request. Aborts if the user switches accounts mid-sync.
  const syncAll = useCallback(async () => {
    const c = credsRef.current
    if (!c) return
    const username = c.username
    const myGen = ++syncGen.current
    syncing.current = true
    lastSyncAt.current = Date.now()
    const acct = cacheFor(username)
    const initial = acct.size === 0
    // Wave 1 refreshes the current quarter (calendar guess) so its grades paint
    // first; the remaining quarters ride along in the GPA wave.
    const [WAVE_HOT, WAVE_GPA] = buildHotGpaWaves(guessCurrentQuarter())
    // Cold resources rarely change — only refetch them when we have nothing cached.
    const coldNeeded = WAVE_COLD.filter(([t, e]) => acct.get(keyOf(t, e)) === undefined)
    const waves = [WAVE_HOT, WAVE_GPA, coldNeeded].filter((w) => w.length)
    const total = waves.reduce((n, w) => n + w.length, 0)
    setSync({ phase: 'syncing', done: 0, total, changes: [], initial })
    const changes = []
    let done = 0
    let fetched = 0 // how many resources actually refreshed (0 = total failure, e.g. offline)
    for (const wave of waves) {
      if (syncGen.current !== myGen) return // superseded by an account switch
      const olds = wave.map(([t, e]) => acct.get(keyOf(t, e)))
      // Fetch the whole wave in one batched request; if the server doesn't
      // support /batch (older deploy) or it errors, fall back to per-resource.
      const gotByKey = {}
      try {
        const { results } = await apiFetchBatch(c, wave.map(([type, extra]) => ({ type, ...extra })))
        wave.forEach(([type, extra], i) => {
          const r = results.find((x) => x.type === type && String(x.quarter ?? '') === String(extra.quarter ?? '')) || results[i]
          if (r && r.success && r.data !== undefined) gotByKey[keyOf(type, extra)] = r.data
        })
      } catch (_) {
        for (const [type, extra] of wave) {
          if (syncGen.current !== myGen) return
          try {
            const data = await getData(type, { ...extra, force: acct.get(keyOf(type, extra)) !== undefined })
            gotByKey[keyOf(type, extra)] = data
          } catch (_) { /* keep stale */ }
        }
      }
      if (syncGen.current !== myGen) return
      wave.forEach(([type, extra], i) => {
        const key = keyOf(type, extra)
        if (gotByKey[key] !== undefined) {
          acct.set(key, gotByKey[key])
          changes.push(...diffResource(type, extra, olds[i], gotByKey[key]))
          fetched++
        }
      })
      persistCache(username)
      done += wave.length
      if (syncGen.current === myGen) { bump(); setSync((s) => ({ ...s, done })) }
    }
    if (syncGen.current === myGen) {
      syncing.current = false
      // Only stamp "synced" if something actually refreshed — a fully-failed
      // sync (offline / server down) must not claim the data is fresh.
      if (fetched > 0) {
        const now = Date.now()
        try { localStorage.setItem(syncedKeyFor(username), String(now)) } catch (_) {}
        if (userRef.current === username) setSyncedAt(now)
      }
      setSync({ phase: 'done', done: total, total, changes, initial })
    }
  }, [cacheFor, persistCache, getData, bump])

  const dismissSync = useCallback(() => setSync((s) => ({ ...s, phase: 'idle' })), [])

  // Quietly refresh ONE (usually non-active) profile's grades into ITS OWN cache,
  // to keep background accounts warm so switching to them shows fresh data. No
  // toast, no changes feed — writes are keyed by username, so they can never bleed
  // into the active account. On a batch failure it just skips the wave (unlike the
  // active sync it must NOT fall back to getData, which is scoped to active creds).
  const syncProfileQuiet = useCallback(async (c) => {
    if (!c || !c.username || !c.password) return
    if (bgSyncing.current) return
    bgSyncing.current = true
    try {
      const username = c.username
      const acct = cacheFor(username)
      const [WAVE_HOT, WAVE_GPA] = buildHotGpaWaves(guessCurrentQuarter())
      const coldNeeded = WAVE_COLD.filter(([t, e]) => acct.get(keyOf(t, e)) === undefined)
      const waves = [WAVE_HOT, WAVE_GPA, coldNeeded].filter((w) => w.length)
      let fetched = 0
      for (const wave of waves) {
        const gotByKey = {}
        try {
          const { results } = await apiFetchBatch(c, wave.map(([type, extra]) => ({ type, ...extra })))
          wave.forEach(([type, extra], i) => {
            const r = results.find((x) => x.type === type && String(x.quarter ?? '') === String(extra.quarter ?? '')) || results[i]
            if (r && r.success && r.data !== undefined) gotByKey[keyOf(type, extra)] = r.data
          })
        } catch (_) { continue } // let this profile wait for the next cycle
        for (const [type, extra] of wave) {
          const key = keyOf(type, extra)
          if (gotByKey[key] !== undefined) { acct.set(key, gotByKey[key]); fetched++ }
        }
        persistCache(username)
      }
      if (fetched > 0) {
        try { localStorage.setItem(syncedKeyFor(username), String(Date.now())) } catch (_) {}
        // If this profile happens to be the active one, reflect its fresh data/time.
        if (userRef.current === username) { setSyncedAt(Date.now()); bump() }
      }
    } finally {
      bgSyncing.current = false
    }
  }, [cacheFor, persistCache, bump])

  const saveProfiles = useCallback((next) => {
    setProfiles(next)
    localStorage.setItem(PROFILES_KEY, JSON.stringify(next))
  }, [])

  // Validate credentials, save as a profile, and switch to it. Used for the
  // first sign-in and re-login. Preserves list order: an existing profile is
  // updated IN PLACE (never moved to the bottom); a new one is appended.
  const login = useCallback(async (username, password) => {
    const res = await apiLogin(username, password)
    const p = { username, password, userName: res.userName || username }
    setProfiles((prev) => {
      const next = prev.some((x) => x.username === username)
        ? prev.map((x) => (x.username === username ? p : x))
        : [...prev, p]
      localStorage.setItem(PROFILES_KEY, JSON.stringify(next))
      return next
    })
    localStorage.setItem(ACTIVE_KEY, username)
    localStorage.removeItem(STORE_KEY)
    setSession({ ...p, remember: true })
    bump()
    return p
  }, [bump])

  // "Add account" from the switcher — refuse to re-add one that's already there
  // (which would otherwise just reorder the list). Validate + append otherwise.
  const addAccount = useCallback(async (username, password) => {
    if (profiles.some((x) => x.username === username)) {
      throw new Error('That account is already added — pick it from the list above.')
    }
    return login(username, password)
  }, [profiles, login])

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
    clearPrefs(username) // forget that profile's cumulative/weight setup too
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

  // Kick off a full prefetch/revalidate whenever we have a session (login or
  // reload). Wake the (possibly asleep) server first so the first batch doesn't
  // eat the cold-start and fail.
  useEffect(() => {
    if (!creds) return
    let cancelled = false
    ;(async () => { await apiWake(); if (!cancelled) syncAll() })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds])

  // Show the switched-to account's own last-synced time immediately.
  useEffect(() => { setSyncedAt(loadSyncedAt(session?.username)) }, [session?.username])

  // An installed PWA (or a mobile tab) stays alive in the background — reopening
  // it resumes the page WITHOUT a reload, so the mount-time sync never re-runs.
  // Re-sync whenever the app becomes visible/focused again, so a reopen always
  // checks for new grades. Throttled so the focus+visibility double-fire and
  // rapid app-switching don't stack redundant syncs.
  const syncAllRef = useRef(syncAll)
  syncAllRef.current = syncAll
  useEffect(() => {
    const RESUME_THROTTLE_MS = 8000
    const resync = () => {
      if (document.visibilityState !== 'visible') return
      if (!credsRef.current) return
      if (syncing.current) return
      if (Date.now() - lastSyncAt.current < RESUME_THROTTLE_MS) return
      lastSyncAt.current = Date.now()
      ;(async () => { await apiWake(); syncAllRef.current() })()
    }
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('focus', resync)
    window.addEventListener('pageshow', resync) // bfcache restore (iOS back-swipe)
    return () => {
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('focus', resync)
      window.removeEventListener('pageshow', resync)
    }
  }, [])

  // Background polling: keep pulling new grades on a timer even while the app is
  // minimized / unfocused (but still open, e.g. a backgrounded Chromebook PWA on
  // Wi‑Fi) — unlike `resync` above, this does NOT require the page to be visible.
  // So grades are already fresh when the student reopens it instead of waiting on
  // a cold sync. Browsers throttle background timers (~1/min), so an unfocused app
  // effectively checks every couple minutes; a frozen/closed tab simply stops and
  // resumes via `resync` on reopen. Skips when offline or a sync is in flight.
  useEffect(() => {
    const POLL_MS = 120_000 // ~2 min
    const tick = () => {
      if (!credsRef.current) return
      if (syncing.current) return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      if (Date.now() - lastSyncAt.current < POLL_MS - 15_000) return // don't stack with a recent resync
      lastSyncAt.current = Date.now()
      ;(async () => { await apiWake(); syncAllRef.current() })()
    }
    const id = setInterval(tick, POLL_MS)
    return () => clearInterval(id)
  }, [])

  // Keep OTHER signed-in profiles warm on a slow, staggered timer so switching
  // accounts shows fresh grades instantly. Deliberately gentle on the Pi/HAC:
  // visible + online only, ONE profile per tick (rotated), spaced so each account
  // refreshes ~every 9 min, and never while the active account's sync is running.
  useEffect(() => {
    const PER_PROFILE_MS = 540_000 // each background profile refreshes ~every 9 min
    let idx = 0
    let timer
    const schedule = (ms) => { timer = setTimeout(tick, ms) }
    const tick = () => {
      const others = profilesRef.current.filter((p) => p.username !== userRef.current && p.password)
      // Spread the accounts across the window so two never fire back-to-back.
      const spacing = others.length ? Math.max(30_000, Math.round(PER_PROFILE_MS / others.length)) : PER_PROFILE_MS
      const ok = document.visibilityState === 'visible'
        && !(typeof navigator !== 'undefined' && navigator.onLine === false)
        && !syncing.current && !bgSyncing.current
      if (ok && others.length) {
        const p = others[idx % others.length]
        idx++
        syncProfileQuiet({ username: p.username, password: p.password })
      }
      schedule(spacing)
    }
    schedule(PER_PROFILE_MS) // wait one interval on load — let the active sync go first
    return () => clearTimeout(timer)
  }, [syncProfileQuiet])

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
    addAccount, // validate + append; refuses to re-add an existing account
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
    syncedAt,
    dismissSync,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
