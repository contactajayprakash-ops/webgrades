import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useWhatIf } from '../context/WhatIfContext.jsx'
import { loadPrefs } from '../lib/prefs.js'
import { weightedGpa, unweightedGpa, fmtGpa } from '../lib/gpa.js'
import {
  buildLiveRows, buildCurrentLiveRaw, buildCurrentLive, buildPriorCourses, buildCumRows, splitTranscript,
} from '../lib/gpaCompute.js'

// The GPA numbers a student can pin to the dashboard — each maps to one of the
// "cards with a number" on the GPA page. `pick` pulls the value from the metrics
// object returned by useGpaMetrics(period).
export const GPA_METRICS = [
  { id: 'live_year', view: 'live', period: 'year', label: 'Live GPA', sub: 'Weighted · full year', pick: (m) => fmtGpa(m.live.weighted) },
  { id: 'live_s1', view: 'live', period: 's1', label: 'Live GPA · Sem 1', sub: 'Weighted · semester 1', pick: (m) => fmtGpa(m.live.weighted) },
  { id: 'live_s2', view: 'live', period: 's2', label: 'Live GPA · Sem 2', sub: 'Weighted · semester 2', pick: (m) => fmtGpa(m.live.weighted) },
  { id: 'live_unw', view: 'live', period: 'year', label: 'Unweighted GPA', sub: '4.0 scale · full year', pick: (m) => m.live.unweighted.toFixed(2) },
  { id: 'cum_year', view: 'cumulative', period: 'year', label: 'Cumulative GPA', sub: 'Weighted · full year', pick: (m) => fmtGpa(m.cumulative.weighted) },
  { id: 'cum_s1', view: 'cumulative', period: 's1', label: 'Cumulative · Sem 1', sub: 'Weighted · semester 1', pick: (m) => fmtGpa(m.cumulative.weighted) },
  { id: 'cum_s2', view: 'cumulative', period: 's2', label: 'Cumulative · Sem 2', sub: 'Weighted · semester 2', pick: (m) => fmtGpa(m.cumulative.weighted) },
  { id: 'cum_unw', view: 'cumulative', period: 'year', label: 'Cumulative Unweighted', sub: '4.0 scale · full year', pick: (m) => m.cumulative.unweighted.toFixed(2) },
]

export const findMetric = (id) => GPA_METRICS.find((m) => m.id === id)

function readQuarters(peekData) {
  const q = {}
  for (const n of ['1', '2', '3', '4']) {
    const d = peekData('class', { quarter: n })
    if (d) q[n] = { classes: d.assignmentsData || [] }
  }
  return q
}

// Compute the live + cumulative GPA for one time period, reading from the same
// prefetched cache the rest of the app uses. Pure, reactive to background sync.
export function useGpaMetrics(period = 'year') {
  const { getData, peekData, dataVersion, activeUsername } = useAuth()
  const { edits } = useWhatIf()
  const [prefs] = useState(() => loadPrefs(activeUsername))

  const [quarters, setQuarters] = useState(() => readQuarters(peekData))
  const [transcript, setTranscript] = useState(() => {
    const d = peekData('transcript')
    return d ? (d.transcript || []) : undefined
  })

  // Fetch anything the prefetch hasn't filled in yet (e.g. a cold dashboard).
  useEffect(() => {
    for (const n of ['1', '2', '3', '4']) {
      if (!peekData('class', { quarter: n })) getData('class', { quarter: n }).catch(() => {})
    }
    if (!peekData('transcript')) getData('transcript').catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Background sync advanced — pull fresh values in without a spinner.
  useEffect(() => {
    setQuarters(readQuarters(peekData))
    const t = peekData('transcript')
    if (t) setTranscript(t.transcript || [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion])

  return useMemo(() => {
    const live = buildLiveRows({ quarters, period, edits, weights: prefs.weights })
    const liveW = weightedGpa(live.rows)
    const liveU = unweightedGpa(live.rows)

    const currentLiveRaw = buildCurrentLiveRaw({ quarters, edits })
    const { latestYear, currentGroup, priorGroups } = splitTranscript(transcript, currentLiveRaw)
    const currentLive = buildCurrentLive({ currentLiveRaw, currentGroup, latestYear })
    const priorCourses = buildPriorCourses(priorGroups)
    const cumRows = buildCumRows({
      currentLive, priorCourses, included: prefs.cumulative.included, period, prefs, latestYear,
    })
    const cumW = weightedGpa(cumRows)
    const cumU = unweightedGpa(cumRows)

    return {
      ready: live.ready,
      hasTranscript: Array.isArray(transcript),
      cumConfirmed: !!prefs.cumulative.confirmed,
      live: { weighted: liveW.gpa, unweighted: liveU.gpa, credits: liveW.credits, count: live.rows.length },
      cumulative: { weighted: cumW.gpa, unweighted: cumU.gpa, credits: cumW.credits, count: cumRows.length },
    }
  }, [quarters, transcript, period, edits, prefs])
}
