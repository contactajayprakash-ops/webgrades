// Cross-platform haptics.
//  - Android / most: the Vibration API.
//  - iOS Safari: has NO Vibration API, but toggling a hidden <input switch> plays
//    a real system haptic (iOS 17.4+). We keep one offscreen and "click" it.
let switchEl

function iosTick() {
  try {
    if (!switchEl) {
      const label = document.createElement('label')
      label.setAttribute('aria-hidden', 'true')
      label.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;opacity:0;pointer-events:none'
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.setAttribute('switch', '') // iOS-only toggle control
      label.appendChild(input)
      document.body.appendChild(label)
      switchEl = label
    }
    switchEl.click()
  } catch (_) {}
}

// kind: 'tick' (light) | 'success' (stronger). Falls back silently if unsupported.
export function haptic(kind = 'tick') {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(kind === 'success' ? [12, 28, 12] : 8)
      return
    }
    iosTick()
  } catch (_) {}
}
