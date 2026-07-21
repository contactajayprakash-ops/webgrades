import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../hooks/useFocusTrap.js'

// A tiny, dependency-free guided tour. Each step targets an element by CSS
// selector; we spotlight it (dim everything else) and float a tooltip beside it.
// The dim layer is click-through, so the user can actually interact with the
// highlighted control — only the tooltip captures clicks. Skippable anytime.
export default function Tour({ steps, onClose }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)
  const step = steps[i]
  const last = i === steps.length - 1
  const trapRef = useFocusTrap(true, onClose)

  // Scroll the target into view when the step changes.
  useLayoutEffect(() => {
    const el = step?.selector ? document.querySelector(step.selector) : null
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [i, step])

  // Track the target's position continuously — entrance animations, scrolling
  // and layout shifts all move it, so polling (with change detection so it
  // doesn't thrash renders) keeps the spotlight locked on.
  useEffect(() => {
    const tick = () => {
      const el = step?.selector ? document.querySelector(step.selector) : null
      if (!el) { setRect((r) => (r === null ? r : null)); return }
      const r = el.getBoundingClientRect()
      setRect((p) =>
        p && Math.abs(p.top - r.top) < 0.5 && Math.abs(p.left - r.left) < 0.5 &&
        Math.abs(p.width - r.width) < 0.5 && Math.abs(p.height - r.height) < 0.5
          ? p
          : { top: r.top, left: r.left, width: r.width, height: r.height }
      )
    }
    tick()
    const iv = setInterval(tick, 120)
    return () => clearInterval(iv)
  }, [step])

  // Esc skips the tour.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!step) return null

  const PAD = 8
  const spot = rect && rect.width
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null

  const W = 320
  let popStyle
  if (spot) {
    const left = Math.max(16, Math.min(spot.left, window.innerWidth - W - 16))
    const roomBelow = window.innerHeight - (spot.top + spot.height)
    if (roomBelow > 200) popStyle = { top: spot.top + spot.height + 14, left }
    else popStyle = { top: Math.max(16, spot.top - 14), left, transform: 'translateY(-100%)' }
  } else {
    popStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  // Portal to <body> so position:fixed resolves against the viewport — cards
  // here use backdrop-filter, which would otherwise become the containing block.
  return createPortal(
    <div className="tour-root">
      {spot ? <div className="tour-spot" style={spot} /> : <div className="tour-dim" />}
      <div className="tour-pop" style={popStyle} ref={trapRef} role="dialog" aria-modal="true" aria-label="Guided walkthrough">
        <button className="tour-x" onClick={onClose} aria-label="Close tour">✕</button>
        <div className="tour-step-n">Step {i + 1} of {steps.length}</div>
        <div className="tour-title">{step.title}</div>
        <div className="tour-body">{step.body}</div>
        <div className="tour-actions">
          <button className="tour-skip" onClick={onClose}>Skip tour</button>
          <div className="flex" style={{ gap: 8 }}>
            {i > 0 && <button className="btn ghost sm" onClick={() => setI(i - 1)}>Back</button>}
            <button className="btn sm" onClick={() => (last ? onClose() : setI(i + 1))}>{last ? 'Got it' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
