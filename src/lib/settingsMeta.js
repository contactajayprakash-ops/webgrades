// Lightweight signal that local settings changed, so the cloud sync knows to
// push. No dependencies (no Firebase, no theme) — safe to import anywhere.
export const SETTINGS_META_KEY = 'wg_settings_updated' // ms of last local change

export function markSettingsChanged() {
  try { localStorage.setItem(SETTINGS_META_KEY, String(Date.now())) } catch (_) {}
  try { window.dispatchEvent(new Event('wg-settings-changed')) } catch (_) {}
}
