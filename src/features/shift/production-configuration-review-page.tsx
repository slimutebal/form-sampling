import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import type { ManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import type { Shift } from '@/domain/shift/shift'
import type { PileRegistrationDraft } from '@/application/pile-registration/pile-registration-draft'
import { formatShiftDateForDisplay } from '@/features/shift-registration/format-shift-date'

interface ProductionConfigurationReviewPageProps {
  readonly shift: Shift
  readonly manpower: readonly ManpowerAssignment[]
  readonly registrations: readonly PileRegistrationDraft[]
  readonly fleetSetup: FleetSetup
  readonly onBack: () => void
  readonly onFinish: () => void
  readonly isFinishing?: boolean
}

/** Final non-destructive confirmation boundary before workspace activation. */
export function ProductionConfigurationReviewPage({
  shift,
  manpower,
  registrations,
  fleetSetup,
  onBack,
  onFinish,
  isFinishing = false,
}: ProductionConfigurationReviewPageProps) {
  const { t } = useTranslation()
  const checker = manpower.find((person) => person.jobDeskCode === 'Checker')
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="border-b border-border px-5 py-3 text-center">
        <h1 className="type-page-title">{t('setupReview.title')}</h1>
      </header>
      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        <section className="rounded-xl border border-border p-3"><h2 className="type-section-title">Work Identity</h2><p>{formatShiftDateForDisplay(shift.date)} · {shift.shiftCode}</p><p>{shift.sectorCode} · {shift.samplingHouseCode}</p><p>Checker: {checker?.name ?? 'Not set'}</p></section>
        <section className="rounded-xl border border-border p-3"><h2 className="type-section-title">Manpower</h2><p>{manpower.length} configured</p></section>
        <section className="rounded-xl border border-border p-3"><h2 className="type-section-title">Samples</h2><p>{registrations.length} configured</p>{registrations.map((sample) => <p key={`${sample.pileId}-${sample.batch}`}>{sample.pileId} · Batch {sample.batch} · Last Trip {sample.rit}</p>)}</section>
        <section className="rounded-xl border border-border p-3"><h2 className="type-section-title">Fleet</h2><p>{fleetSetup.fronts.length} configured</p></section>
      </main>
      <footer className="grid shrink-0 grid-cols-2 gap-3 px-5 py-3"><Button type="button" variant="secondary" onClick={onBack}><ArrowLeft aria-hidden="true" size={18} />{t('setupReview.backToFleet')}</Button><Button type="button" variant="focus" disabled={isFinishing} onClick={onFinish}>{t('setupReview.finish')}<ArrowRight aria-hidden="true" size={18} /></Button></footer>
    </div>
  )
}
