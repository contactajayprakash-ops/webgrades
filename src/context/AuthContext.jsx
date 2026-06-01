import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { login as apiLogin, fetchData as apiFetchData, fetchIprDates as apiFetchIprDates } from '../api/hac.js'

const AuthContext = createContext(null)

const STORE_KEY = 'wg_session'

// Load a remembered session from localStorage (only if the user opted in).
function loadStored() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (s && s.username && s.password) return s
  } catch (_) {}
  return null
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadStored) // { username, password, userName, remember }

  // In-memory cache of API responses, keyed by `${type}:${JSON.stringify(extra)}`.
  // Cleared on logout. Avoids re-scraping (each call re-logs into HAC and is slow).
  const cache = useRef(new Map())

  const persist = useCallback((s) => {
    if (s && s.remember) {
      localStorage.setItem(STORE_KEY, JSON.stringify(s))
    } else {
      localStorage.removeItem(STORE_KEY)
    }
  }, [])

  const login = useCallback(async (username, password, remember) => {
    const res = await apiLogin(username, password)
    const s = { username, password, userName: res.userName || username, remember: !!remember }
    cache.current.clear()
    setSession(s)
    persist(s)
    return s
  }, [persist])

  const logout = useCallback(() => {
    cache.current.clear()
    localStorage.removeItem(STORE_KEY)
    setSession(null)
  }, [])

  const creds = useMemo(
    () => (session ? { username: session.username, password: session.password } : null),
    [session]
  )

  // Cached data fetch. Pass { force: true } in extra to bypass the cache.
  const getData = useCallback(
    async (type, extra = {}) => {
      if (!creds) throw new Error('Not signed in.')
      const { force, ...rest } = extra
      const key = `${type}:${JSON.stringify(rest)}`
      if (!force && cache.current.has(key)) return cache.current.get(key)
      const { data, userName } = await apiFetchData(creds, type, rest)
      cache.current.set(key, data)
      // Refresh the displayed name if the API returns a better one.
      if (userName && session && userName !== session.userName) {
        setSession((prev) => (prev ? { ...prev, userName } : prev))
      }
      return data
    },
    [creds, session]
  )

  const getIprDates = useCallback(async () => {
    if (!creds) throw new Error('Not signed in.')
    return apiFetchIprDates(creds)
  }, [creds])

  const clearCache = useCallback(() => cache.current.clear(), [])

  const value = {
    session,
    userName: session?.userName || null,
    isAuthed: !!session,
    login,
    logout,
    getData,
    getIprDates,
    clearCache,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
