// Per-ACCOUNT preferences (weight overrides, cumulative course selections, the
// pinned dashboard metric). Each profile gets its own setup — they used to share
// one key, which let one student's cumulative setup bleed onto another's.
// Stored as `wg_prefs_<username>` so switching profiles loads the right setup.
const LEGACY_KEY = 'wg_prefs' // old single shared key (migrated once, then removed)
const keyFor = (username) => `wg_prefs_${username || '_anon'}`

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
    manual: [],        // manually-added courses [{ id, name }] (grade/weight/credit live in the maps above, keyed `manual:<id>`)
    confirmed: false,  // has the user picked courses at least once?
  },
}

const normalize = (raw) => {
  const p = { ...DEFAULT, ...JSON.parse(raw) }
  // Reset cumulative if it predates the current keying scheme.
  if (!p.cumulative || p.cumulative.v !== CUMULATIVE_VERSION) {
    p.cumulative = structuredClone(DEFAULT.cumulative)
  }
  // Additive fields introduced after v2 — backfill without wiping selections.
  if (!Array.isArray(p.cumulative.manual)) p.cumulative.manual = []
  return p
}

export function loadPrefs(username) {
  const key = keyFor(username)
  try {
    let raw = localStorage.getItem(key)
    // One-time migration: the old shared prefs belonged to whoever's signed in
    // first — hand them to this account, then drop the shared key so it can't
    // bleed onto other profiles.
    if (!raw && username) {
      const legacy = localStorage.getItem(LEGACY_KEY)
      if (legacy) {
        localStorage.setItem(key, legacy)
        localStorage.removeItem(LEGACY_KEY)
        raw = legacy
      }
    }
    if (raw) return normalize(raw)
  } catch (_) {}
  return structuredClone(DEFAULT)
}

export function savePrefs(username, prefs) {
  try {
    localStorage.setItem(keyFor(username), JSON.stringify(prefs))
  } catch (_) {}
}

// Drop a profile's saved setup (called when the profile is removed).
export function clearPrefs(username) {
  try { localStorage.removeItem(keyFor(username)) } catch (_) {}
}
