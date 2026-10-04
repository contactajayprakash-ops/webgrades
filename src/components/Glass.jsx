import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link, useHref, useNavigate } from 'react-router-dom'
import { getGlassAppearance, getGlassMode, subscribeGlassMode } from '../lib/glassMode.js'

// Shared base for every glass surface. `auto` picks SVG refraction on Chromium
// and the CSS-glass fallback on Safari/Firefox; `respectPreferences` makes it
// honor the OS reduced-motion / reduced-transparency settings we wired up.
// `quality: 'medium'` keeps the per-element GPU cost sane on Chromebooks.
// `appearance` deliberately NOT 'auto': the app has its own light/dark theme
// (data-theme), so the glass must follow it — not the OS scheme (see glassMode).
const BASE = {
  material: 'regular',
  refractionMode: 'auto',
  quality: 'medium',
  respectPreferences: true,
}

// quick-liquid is loaded ONLY when a glass surface actually renders in enhanced
// mode — it stays out of the entry chunk (keeps the cold-open boot path small),
// and 'standard' users never download it at all. Until it lands, surfaces render
// as the plain original element, then upgrade in place.
let LiquidGlassComp = null
let loadPromise = null
const loadSubs = new Set()
function loadQuickLiquid() {
  if (LiquidGlassComp || loadPromise) return
  loadPromise = import('quick-liquid/react')
    .then((m) => { LiquidGlassComp = m.LiquidGlass; loadSubs.forEach((f) => { try { f() } catch (_) {} }) })
    .catch(() => {}) // network/chunk failure → stay on the CSS element forever
}

// Snapshot combines mode + appearance so a theme switch re-renders glass live.
const snapshot = () => `${getGlassMode()}|${getGlassAppearance()}`

export function useGlassState() {
  const [m, a] = useSyncExternalStore(subscribeGlassMode, snapshot, () => 'enhanced|dark').split('|')
  return { enhanced: m === 'enhanced', appearance: a }
}

export function useGlassEnhanced() {
  return useGlassState().enhanced
}

// A glass surface. In 'enhanced' mode it renders through quick-liquid (and gets
// the `glass-host` marker so index.css hands the material over to it); in
// 'standard' mode it's exactly the original element — no wrapper, no cost, no
// quick-liquid download.
export default function Glass({ as = 'div', className = '', config, liquidPress, animateIn, children, ...rest }) {
  const { enhanced, appearance } = useGlassState()
  const [ready, setReady] = useState(!!LiquidGlassComp)

  useEffect(() => {
    if (!enhanced || LiquidGlassComp) return
    loadQuickLiquid()
    const fn = () => setReady(true)
    loadSubs.add(fn)
    if (LiquidGlassComp) setReady(true)
    return () => loadSubs.delete(fn)
  }, [enhanced])

  const Tag = as
  if (!enhanced || !ready || !LiquidGlassComp) {
    return <Tag className={className} {...rest}>{children}</Tag>
  }
  const LG = LiquidGlassComp
  // Light mode: the engine's default white tint (~0.16) vanishes against a light
  // background — everything read as invisible. A much stronger frost + firmer
  // edge gives the surfaces definition (dark mode keeps the airier defaults).
  const appearanceExtra = appearance === 'light'
    ? { tint: '#ffffff', tintOpacity: 0.55, edgeHighlight: 1, specularStrength: 0.5 }
    : null
  return (
    <LG
      as={as}
      className={className ? `glass-host ${className}` : 'glass-host'}
      config={{ ...BASE, appearance, ...appearanceExtra, ...config }}
      liquidPress={liquidPress}
      animateIn={animateIn}
      {...rest}
    >
      {children}
    </LG>
  )
}

// A router <Link> rendered as a glass surface. quick-liquid's `as` only takes
// intrinsic tags, so in enhanced mode we render an <a> and do the navigation
// ourselves — preserving cmd/ctrl/middle-click open-in-new-tab semantics.
// In standard mode it's exactly a plain <Link>, unchanged.
export function GlassLink({ to, className = '', config, children, onClick, ...rest }) {
  const enhanced = useGlassEnhanced()
  const navigate = useNavigate()
  const href = useHref(to)
  if (!enhanced) {
    return <Link to={to} className={className} onClick={onClick} {...rest}>{children}</Link>
  }
  const handleClick = (e) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }
  return (
    <Glass as="a" href={href} className={className} config={config} onClick={handleClick} {...rest}>
      {children}
    </Glass>
  )
}
