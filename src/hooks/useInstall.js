import { useEffect, useState } from 'react'
import {
  canInstall, subscribeInstall, promptInstall, isInstalled, isIos, isAndroid, isStandalone,
} from '../lib/pwaInstall.js'

// Reactive view of the shared PWA-install state. `desktop` = has a taskbar/shelf
// to pin to (not iOS, not Android).
export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => subscribeInstall(() => force((n) => n + 1)), [])
  return {
    can: canInstall(),
    installed: isInstalled(),
    standalone: isStandalone(),
    ios: isIos(),
    desktop: !isIos() && !isAndroid(),
    promptInstall,
  }
}
