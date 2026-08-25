import { cloudGet, cloudSet } from './cloudSync.js'

// Returns { data, updatedAt } or null. `data` is a { localStorageKey: value } map.
export const pullSettings = (username, password) => cloudGet('settings', username, password)

export const pushSettings = (username, password, data, updatedAt) =>
  cloudSet('settings', username, password, { data: data || {}, updatedAt: updatedAt || Date.now() })
