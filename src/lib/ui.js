// Which interface to render: the new 2.0 "Midnight Glass" shell ('v2', default)
// or the classic sidebar UI ('legacy'). Device-syncable like other settings.
import { markSettingsChanged } from './settingsMeta.js'

const KEY = 'wg_ui'

export function loadUI() {
  try { return localStorage.getItem(KEY) === 'legacy' ? 'legacy' : 'v2' } catch (_) { return 'v2' }
}

export function setUI(v) {
  try { localStorage.setItem(KEY, v === 'legacy' ? 'legacy' : 'v2') } catch (_) {}
  markSettingsChanged() // sync + notify listeners (App swaps the shell live)
}
