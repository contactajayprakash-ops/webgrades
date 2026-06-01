import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

// Fetch one `type` from the API with loading / error state and a manual refresh.
// `extra` should be a stable object (memoize it in the caller if it has fields).
export function useHacData(type, extra) {
  const { getData } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const key = JSON.stringify(extra || {})

  const run = useCallback(
    async (force = false) => {
      setLoading(true)
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
    [getData, type, key]
  )

  useEffect(() => {
    run(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  return { data, loading, error, refresh: () => run(true) }
}
