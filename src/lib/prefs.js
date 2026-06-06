// Lightweight per-browser preferences (weight overrides, cumulative course
// selections). Stored in localStorage so a student's tweaks survive refreshes.
const KEY = 'wg_prefs'

// Bump when the cumulative selection keying changes, so stale saved selections
// reset instead of showing a half-checked list. v2: current-year courses keyed
// by courseKey (live) rather than transcript course code.
const CUMULATIVE_VERSION = 2

const DEFAULT = {
  weights: {},        // courseKey -> overridden weight
  dashboard: {         // dashboard customization
    gpaMetric: null,   // id of the GPA metric pinned to the first card (null = plain link)
  },
  cumulative: {        // cumulative GPA config
    v: CUMULATIVE_VERSION,
    included: {},      // key (courseKey for current, transcript code for prior) -> true
    weights: {},       // key -> weight
    grades: {},        // key -> grade override
    credits: {},       // key -> credit override
    confirmed: false,  // has the user picked courses at least once?
  },
}

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = { ...DEFAULT, ...JSON.parse(raw) }
      // Reset cumulative if it predates the current keying scheme.
      if (!p.cumulative || p.cumulative.v !== CUMULATIVE_VERSION) {
        p.cumulative = structuredClone(DEFAULT.cumulative)
      }
      return p
    }
  } catch (_) {}
  return structuredClone(DEFAULT)
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch (_) {}
}
