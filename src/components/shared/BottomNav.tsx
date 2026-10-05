import { ClipboardList, FileText, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { cn } from '@/components/ui/cn'

/** The centre action is navigation outside Record and the sole add action inside it. */
export function BottomNav() {
  const { t } = useTranslation(['common'])
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const inRecordWorkspace = pathname === '/production'

  function handleCentreAction() {
    if (!inRecordWorkspace) {
      navigate('/production')
      return
    }
    window.dispatchEvent(new CustomEvent('record-workspace:add'))
  }

  return (
    <nav
      aria-label={t('common:navigation.home')}
      className="fixed inset-x-0 bottom-0 z-20 safe-bottom safe-x border-t border-border bg-background/95 shadow-[0_-2px_10px_rgba(15,23,42,0.06)] backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="mx-auto grid h-14 w-full max-w-md grid-cols-3 items-stretch">
        <NavLink to="/regist" className={({ isActive }) => cn('flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive ? 'text-primary' : 'text-muted-foreground')}>
          <ClipboardList aria-hidden="true" size={20} />
          <span>SETUP</span>
        </NavLink>
        <button type="button" aria-label={inRecordWorkspace ? 'Add' : 'REC'} onClick={handleCentreAction} className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold text-primary">
          <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-primary px-2 text-primary-foreground">{inRecordWorkspace ? <Plus aria-hidden="true" size={19} /> : 'REC'}</span>
          <span>{inRecordWorkspace ? 'ADD' : 'REC'}</span>
        </button>
        <NavLink to="/report" className={({ isActive }) => cn('flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive ? 'text-primary' : 'text-muted-foreground')}>
          <FileText aria-hidden="true" size={20} />
          <span>REPORT</span>
        </NavLink>
      </div>
    </nav>
  )
}
