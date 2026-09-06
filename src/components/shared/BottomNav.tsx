import { useEffect, useRef, useState } from 'react'
import { FileText, FlaskConical, Home, Package, Truck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router'
import { cn } from '@/components/ui/cn'

const navItems = [
  { to: '/home', labelKey: 'navigation.home', Icon: Home },
  { to: '/fleet', labelKey: 'navigation.fleet', Icon: Truck },
  { to: '/piles', labelKey: 'navigation.piles', Icon: Package },
  { to: '/samples', labelKey: 'navigation.samples', Icon: FlaskConical },
  { to: '/report', labelKey: 'navigation.report', Icon: FileText },
] as const

/** Ignore scroll noise below this size — prevents a tiny bounce/rubber-band from flipping visibility. */
const DIRECTION_THRESHOLD_PX = 16
/** Always visible within this distance of the top, regardless of direction. */
const TOP_ANCHOR_PX = 8

/**
 * Mirrors a native app's bottom nav rather than a web footer: visible by
 * default, hides on a deliberate downward scroll, and returns immediately
 * on any upward scroll. Binds to the window/document scroll position
 * (this app scrolls the document itself — `AppLayout`'s `<main>` has no
 * `overflow` of its own), not an inner container. A page that can't
 * scroll (short content) never triggers a hide. Resets to visible on
 * every route change so navigating never lands on a hidden nav.
 */
function useBottomNavVisible() {
  const { pathname } = useLocation()
  const [visible, setVisible] = useState(true)
  const [trackedPathname, setTrackedPathname] = useState(pathname)
  const lastScrollY = useRef(0)
  const accumulated = useRef(0)

  // Adjusting state during render (React's documented pattern for
  // resetting on a prop/derived-value change) rather than in a
  // useEffect — this reset must apply before this render commits, not
  // one render later. Refs are never touched here (only allowed in
  // effects/handlers, not during render) — the effect below handles them.
  if (pathname !== trackedPathname) {
    setTrackedPathname(pathname)
    setVisible(true)
  }

  useEffect(() => {
    lastScrollY.current = window.scrollY
    accumulated.current = 0
  }, [trackedPathname])

  useEffect(() => {
    function handleScroll() {
      const currentScrollY = window.scrollY
      const notScrollable = document.documentElement.scrollHeight <= window.innerHeight

      if (notScrollable || currentScrollY <= TOP_ANCHOR_PX) {
        setVisible(true)
        lastScrollY.current = currentScrollY
        accumulated.current = 0
        return
      }

      const delta = currentScrollY - lastScrollY.current
      lastScrollY.current = currentScrollY

      // A reversal resets the run so a brief wobble at a direction change
      // doesn't carry over stale momentum from the opposite direction.
      if (delta !== 0 && Math.sign(delta) !== Math.sign(accumulated.current)) {
        accumulated.current = 0
      }
      accumulated.current += delta

      if (accumulated.current > DIRECTION_THRESHOLD_PX) {
        setVisible(false)
        accumulated.current = 0
      } else if (accumulated.current < -DIRECTION_THRESHOLD_PX) {
        setVisible(true)
        accumulated.current = 0
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return visible
}

export function BottomNav() {
  const { t } = useTranslation()
  const visible = useBottomNavVisible()

  return (
    <nav
      aria-label={t('navigation.home')}
      className={cn(
        'fixed inset-x-0 bottom-0 z-10 safe-bottom safe-x border-t border-border bg-background/95 shadow-[0_-2px_10px_rgba(15,23,42,0.06)] backdrop-blur transition-transform duration-200 ease-out supports-[backdrop-filter]:bg-background/80',
        visible ? 'translate-y-0' : 'translate-y-full',
      )}
    >
      <ul className="flex h-14 items-stretch justify-around">
        {navItems.map(({ to, labelKey, Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex h-full min-w-11 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('flex items-center justify-center rounded-full px-2.5 py-0.5', isActive && 'bg-primary/10')}>
                    <Icon aria-hidden="true" size={20} />
                  </span>
                  <span>{t(labelKey)}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
