import { createContext, useCallback, useContext, useMemo, useState } from 'react'

// What-if assignment edits, shared across pages so a change on the Grades page
// flows into every GPA. Kept in memory (not persisted) — it's an exploration
// tool, so a full page reload clears it. Survives in-app navigation.
const WhatIfContext = createContext(null)

export function WhatIfProvider({ children }) {
  const [edits, setEdits] = useState({}) // editKey -> { score, total, name?, hypo? }

  const setEdit = useCallback((key, patch) => {
    setEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }))
  }, [])

  const removeEdit = useCallback((key) => {
    setEdits((e) => {
      const n = { ...e }
      delete n[key]
      return n
    })
  }, [])

  const reset = useCallback(() => setEdits({}), [])

  const value = useMemo(
    () => ({ edits, setEdit, removeEdit, reset, count: Object.keys(edits).length }),
    [edits, setEdit, removeEdit, reset]
  )

  return <WhatIfContext.Provider value={value}>{children}</WhatIfContext.Provider>
}

export function useWhatIf() {
  const ctx = useContext(WhatIfContext)
  if (!ctx) throw new Error('useWhatIf must be used within WhatIfProvider')
  return ctx
}
