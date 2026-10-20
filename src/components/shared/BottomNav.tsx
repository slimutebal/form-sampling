import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { NavSetupIcon } from '@/components/icons/NavSetupIcon'
import { NavReviewIcon } from '@/components/icons/NavReviewIcon'
import { NavReportIcon } from '@/components/icons/NavReportIcon'
import { cn } from '@/components/ui/cn'
import './BottomNavAdaptive.css'

const PRIMARY_NAVIGATION = [
  { to: '/regist', label: 'SETUP', iconTestId: 'setup-nav-icon' },
  { to: '/samples', label: 'REVIEW', iconTestId: 'review-nav-icon' },
  { to: '/report', label: 'REPORT', iconTestId: 'report-nav-icon' },
] as const

function isProductionRoute(pathname: string): boolean {
  return pathname === '/production' || pathname.startsWith('/production/')
}

/** The contextual REC/ADD action is separate from the three navigation tabs. */
export function RecordNavigationAction({ active, onClick }: Readonly<{ active: boolean; onClick: () => void }>) {
  return (
    <button type="button" aria-label={active ? 'Add' : 'REC'} aria-pressed={active}
      data-ui="record-nav-button" data-record-active={active || undefined}
      onClick={onClick} className="qps-record-button">
      <span aria-hidden="true" className="qps-record-button__content">
        <span className="qps-record-button__rec">REC</span>
        <Plus className="qps-record-button__plus" size={28} strokeWidth={2.8} />
      </span>
    </button>
  )
}

/** Route-driven primary dock; data operations remain in the production feature. */
export function BottomNav() {
  const { t } = useTranslation(['common'])
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const productionRoute = isProductionRoute(pathname)
  const productionRoot = pathname === '/production'
  // Re-mount the SVG trend on each click, including a re-click on the active tab.
  const [reviewTrendRun, setReviewTrendRun] = useState(0)
  const [reportTrendRun, setReportTrendRun] = useState(0)
  const activePrimary =
    pathname === '/regist' || pathname.startsWith('/regist/') ? 'setup' :
    pathname === '/samples' || pathname.startsWith('/samples/') ? 'review' :
    pathname === '/report' || pathname.startsWith('/report/') ? 'report' : null

  function handleCentreAction() {
    if (productionRoot) {
      window.dispatchEvent(new CustomEvent('record-workspace:add'))
      return
    }
    navigate('/production')
  }

  return (
    <nav aria-label={t('common:navigation.home')} className="qps-bottom-nav">
      <span aria-hidden="true" data-ui="bottom-nav-backdrop" className="qps-bottom-nav__backdrop" />
      <div className="qps-bottom-nav__frame">
        <div className={cn('qps-bottom-nav__tabs', activePrimary && `qps-bottom-nav__tabs--${activePrimary}-active`)}>
          <NavLink to={PRIMARY_NAVIGATION[0].to}
            onClick={() => {
              // Preserve fleet-default behavior when arriving from a different primary route.
              if (pathname !== '/regist') window.dispatchEvent(new CustomEvent('work-setup:open-fleet'))
            }}
            className={({ isActive }) => cn('qps-bottom-nav__tab', 'qps-bottom-nav__tab--setup', isActive && 'qps-bottom-nav__tab--active')}>
            <NavSetupIcon data-ui={PRIMARY_NAVIGATION[0].iconTestId} motion="none" />
            <span className="qps-bottom-nav__label">{PRIMARY_NAVIGATION[0].label}</span>
            <span aria-hidden="true" className="qps-bottom-nav__indicator" />
          </NavLink>
          <NavLink to={PRIMARY_NAVIGATION[1].to}
            onClick={() => setReviewTrendRun((run) => run + 1)}
            className={({ isActive }) => cn('qps-bottom-nav__tab', isActive && 'qps-bottom-nav__tab--active')}>
            <NavReviewIcon key={reviewTrendRun} data-ui={PRIMARY_NAVIGATION[1].iconTestId} />
            <span className="qps-bottom-nav__label">{PRIMARY_NAVIGATION[1].label}</span>
            <span aria-hidden="true" className="qps-bottom-nav__indicator" />
          </NavLink>
          <NavLink to={PRIMARY_NAVIGATION[2].to}
            onClick={() => setReportTrendRun((run) => run + 1)}
            className={({ isActive }) => cn('qps-bottom-nav__tab', isActive && 'qps-bottom-nav__tab--active')}>
            <NavReportIcon key={reportTrendRun} data-ui={PRIMARY_NAVIGATION[2].iconTestId} />
            <span className="qps-bottom-nav__label">{PRIMARY_NAVIGATION[2].label}</span>
            <span aria-hidden="true" className="qps-bottom-nav__indicator" />
          </NavLink>
        </div>
        <RecordNavigationAction active={productionRoute} onClick={handleCentreAction} />
      </div>
    </nav>
  )
}
