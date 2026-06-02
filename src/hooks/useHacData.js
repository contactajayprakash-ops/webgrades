import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

// Fetch one `type` from the API with stale-while-revalidate behavior:
// - renders cached/persisted data instantly (no spinner) when available
// - updates in place when the background sync refreshes the cache (dataVersion)
export function useHacData(type, extra) {
  const { getData, peekData, dataVersion } = useAuth()
  const key = JSON.stringify(extra || {})

  const [data, setData] = useState(() => {
    const c = peekData(type, extra)
    return c === undefined ? null : c
  })
  const [loading, setLoading] = useState(() => peekData(type, extra) === undefined)
  const [error, setError] = useState(null)

  const run = useCallback(
    async (force = false) => {
      const cached = peekData(type, extra)
      if (!force && cached !== undefined) { setData(cached); setLoading(false); return }
      if (cached === undefined) setLoading(true) // only show a spinner when we have nothing
      setError(null)
      try {
        const d = await getData(type, { ...(extra || {}), force })
        setData(d)
      } catch (e) {
        setError(e.message || 'Something went wrong.')
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getData, peekData, type, key]
  )

  useEffect(() => { run(false) }, [run])

  // Background sync finished/advanced — pull the fresh value in without a spinner.
  useEffect(() => {
    const c = peekData(type, extra)
    if (c !== undefined) { setData(c); setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion])

  return { data, loading, error, refresh: () => run(true) }
}
