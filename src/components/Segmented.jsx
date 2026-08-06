import { useLayoutEffect, useRef, useState } from 'react'

// Apple segmented control with a single Liquid-Glass indicator that springs
// between segments (instead of each button toggling its own background). It
// measures the active button's box so it also slides correctly when the row
// wraps. Drop-in for the old `<div className="seg">…buttons…</div>` pattern.
//
//   <Segmented options={[{value,label}]} value={v} onChange={setV} />
export default function Segmented({ options, value, onChange, className = '', style, ariaLabel }) {
  const wrapRef = useRef(null)
  const [box, setBox] = useState({ x: 0, y: 0, w: 0, h: 0, ready: false })
  const activeIdx = Math.max(0, options.findIndex((o) => o.value === value))

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const measure = () => {
      const btn = wrap.querySelectorAll('.seg-btn')[activeIdx]
      if (!btn) return
      setBox({ x: btn.offsetLeft, y: btn.offsetTop, w: btn.offsetWidth, h: btn.offsetHeight, ready: true })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    // re-measure once fonts settle
    const t = setTimeout(measure, 60)
    return () => { ro.disconnect(); clearTimeout(t) }
  }, [activeIdx, options.length])

  return (
    <div className={`seg seg-sliding ${className}`} ref={wrapRef} style={style} role="tablist" aria-label={ariaLabel}>
      <span
        className="seg-indicator"
        aria-hidden="true"
        style={{
          transform: `translate(${box.x}px, ${box.y}px)`,
          width: box.w, height: box.h,
          opacity: box.ready ? 1 : 0,
        }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={`seg-btn ${o.value === value ? 'active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
