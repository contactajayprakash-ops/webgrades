import { useEffect, useRef } from 'react'

// Trap keyboard focus inside an overlay while it's active: focus the first
// control on open, keep Tab/Shift-Tab cycling within, run onEscape on Esc, and
// restore focus to the previously-focused element on close. Returns a ref to
// put on the overlay container. Purely additive — mouse use is unaffected.
const SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function useFocusTrap(active, onEscape) {
  const ref = useRef(null)
  const escRef = useRef(onEscape)
  escRef.current = onEscape

  useEffect(() => {
    if (!active) return
    const node = ref.current
    if (!node) return
    const prev = document.activeElement

    const focusables = () => [...node.querySelectorAll(SELECTOR)].filter((el) => el.offsetParent !== null)
    const first = focusables()[0]
    if (first) first.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') { escRef.current?.(); return }
      if (e.key !== 'Tab') return
      const f = focusables()
      if (!f.length) return
      const a = f[0], z = f[f.length - 1]
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
    }

    node.addEventListener('keydown', onKey)
    return () => {
      node.removeEventListener('keydown', onKey)
      if (prev && prev.focus) prev.focus()
    }
  }, [active])

  return ref
}
