import { useEffect, useRef, useState } from 'react'
import { haptic } from '../lib/haptics.js'

// Touch-only pull-to-refresh. Pull down from the very top; past the threshold it
// arms (haptic tick), and on release it fires onRefresh (haptic success) with a
// glassy spinning-orb animation. Desktop/mouse is untouched.
const THRESHOLD = 74   // px of resisted pull to trigger
const MAX = 118        // clamp so it can't be dragged forever
const RESIST = 0.52    // rubber-band resistance
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export default function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [dragging, setDragging] = useState(false)
  // At rest the transform must be `none` (not translateY(0)) — otherwise it forms
  // a containing block that would reposition fixed overlays inside the content.
  const [settled, setSettled] = useState(true)

  const pullRef = useRef(0)
  const armedRef = useRef(false)
  const activeRef = useRef(false)
  const startY = useRef(null)
  const refreshingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    if (!window.matchMedia?.('(pointer: coarse)').matches) return // touch devices only
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0
    const setP = (v) => { pullRef.current = v; setPull(v) }

    const onStart = (e) => {
      if (refreshingRef.current || !atTop()) { startY.current = null; return }
      startY.current = e.touches[0].clientY
      activeRef.current = false
    }
    const onMove = (e) => {
      if (startY.current == null || refreshingRef.current) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0 || !atTop()) {
        if (activeRef.current) { activeRef.current = false; setDragging(false); setP(0) }
        startY.current = atTop() ? startY.current : null
        return
      }
      activeRef.current = true
      setDragging(true)
      setSettled(false)
      const resisted = Math.min(MAX, dy * RESIST)
      setP(resisted)
      const armed = resisted >= THRESHOLD
      if (armed && !armedRef.current) haptic('tick') // just crossed the line
      armedRef.current = armed
      if (e.cancelable) e.preventDefault() // suppress native overscroll while pulling
    }
    const onEnd = async () => {
      if (startY.current == null && !activeRef.current) return
      startY.current = null
      setDragging(false)
      if (activeRef.current && pullRef.current >= THRESHOLD) {
        refreshingRef.current = true
        setRefreshing(true)
        setP(THRESHOLD)
        haptic('success')
        try { await Promise.all([Promise.resolve(onRefreshRef.current?.()), sleep(750)]) } catch (_) {}
        refreshingRef.current = false
        setRefreshing(false)
        setP(0)
      } else {
        setP(0)
      }
      activeRef.current = false
      armedRef.current = false
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  const show = pull > 1 || refreshing

  return (
    <>
      <div
        className="ptr-ind"
        aria-hidden="true"
        style={{
          opacity: show ? Math.min(1, pull / 22) : 0,
          transform: `translateX(-50%) translateY(${Math.min(pull, THRESHOLD) + 4}px)`,
        }}
      >
        <span
          className={`ptr-ring${refreshing ? ' spin' : ''}`}
          style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
        />
      </div>

      <div
        className="ptr-content"
        onTransitionEnd={() => { if (pullRef.current === 0 && !refreshingRef.current) setSettled(true) }}
        style={{
          transform: settled ? undefined : `translateY(${pull}px)`,
          transition: dragging ? 'none' : 'transform .5s cubic-bezier(.2,1.3,.32,1)',
        }}
      >
        {children}
      </div>
    </>
  )
}
