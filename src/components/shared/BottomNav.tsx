import { FileText, FlaskConical, Home, Package, Truck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { cn } from '@/components/ui/cn'

const navItems = [
  { to: '/home', labelKey: 'navigation.home', Icon: Home },
  { to: '/fleet', labelKey: 'navigation.fleet', Icon: Truck },
  { to: '/piles', labelKey: 'navigation.piles', Icon: Package },
  { to: '/samples', labelKey: 'navigation.samples', Icon: FlaskConical },
  { to: '/report', labelKey: 'navigation.report', Icon: FileText },
] as const

export function BottomNav() {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('navigation.home')}
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex h-16 items-stretch justify-around">
        {navItems.map(({ to, labelKey, Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex h-full min-w-11 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              <Icon aria-hidden="true" size={22} />
              <span>{t(labelKey)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
