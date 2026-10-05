import { useTranslation } from 'react-i18next'
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { PageHeader } from '@/components/shared/PageHeader'
import { createBatchPosition, type BatchPosition } from '@/domain/batch/batch-position'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { ProductionRecordEntry } from '@/features/production/production-record-entry'
import { activeRegistrationsForPile } from '@/application/pile-registration/registration-context'

/**
 * Parses the optional `?batch=&rit=&mode=missed` missed-Rit correction
 * target (Phase 3 §9 — `/production/detail/.../rit/:ritNumber`'s "Record
 * Rit Ini" action). A malformed/absent target is never treated as an
 * error here — it simply falls back to the normal auto-derived-next-
 * position flow, since only `mode=missed` with both a valid BatchNumber
 * and RitNumber is a genuine correction request.
 */
function parseMissedTargetPosition(searchParams: URLSearchParams): BatchPosition | undefined {
  if (searchParams.get('mode') !== 'missed') {
    return undefined
  }
  const batchNumberResult = parseBatchNumber(Number(searchParams.get('batch')))
  const ritNumberResult = parseRitNumber(Number(searchParams.get('rit')))
  if (!batchNumberResult.ok || !ritNumberResult.ok) {
    return undefined
  }
  return createBatchPosition(batchNumberResult.value, ritNumberResult.value)
}

/**
 * Router adapter for `/production/record/:pileId` (Phase 2 — Production
 * Record final UI + write flow; Phase 3 — Missed Rit correction target).
 * Resolves the URL's PileId against the current workspace's own Pile
 * list and renders `ProductionRecordEntry` with the real Shift/Pile/
 * MasterData/FleetSetup/manpower/store — this is now the single screen
 * for the whole Production Record flow (Front No selection, Truck,
 * Physical Condition/Contamination/Disposition/Keterangan, save),
 * replacing the old two-step Front-select -> Haulage-checker flow. An
 * optional `?batch=&rit=&mode=missed` query targets a specific missed
 * Rit for correction (`ProductionRecordEntry` re-validates it is still
 * missed before allowing a save) — the operator never types a Rit value
 * either way.
 */
export function ProductionRecordPage() {
  const { t } = useTranslation('production')
  const { pileId } = useParams<{ pileId: string }>()
  const [searchParams] = useSearchParams()
  const { workspace, refreshWorkspace } = useOutletContext<ActiveWorkspaceContext>()
  const pile = workspace.piles.find((candidate) => candidate.id === pileId)
  const activeRegistrations = pile ? activeRegistrationsForPile(workspace.pileRegistrations, pile.id) : []
  const requestedBatch = parseBatchNumber(Number(searchParams.get('registrationBatch')))
  const registration = activeRegistrations.length === 1
    ? activeRegistrations[0]
    : requestedBatch.ok
      ? activeRegistrations.find((candidate) => Number(candidate.batch) === Number(requestedBatch.value))
      : undefined

  if (!pile) {
    return (
      <div>
        <PageHeader title={t('title')} />
        <div className="px-5 py-4">
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {t('errors.pileNotFound')}
          </p>
        </div>
      </div>
    )
  }

  if (activeRegistrations.length === 0) {
    return <div><PageHeader title={t('title')} /><div className="px-5 py-4"><p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No active batch registered for this pile.</p></div></div>
  }

  if (!registration) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden">
        <div className="shrink-0"><PageHeader title={t('title')} /></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold">Select Batch</h2>
          {activeRegistrations.map((candidate) => (
            <Link key={Number(candidate.batch)} to={`/production/record/${encodeURIComponent(pile.id as string)}?registrationBatch=${Number(candidate.batch)}`} className="rounded-lg border border-border p-3 font-medium">
              Batch {String(candidate.batch).padStart(3, '0')} · Trip {String(candidate.rit).padStart(3, '0')}
            </Link>
          ))}
        </div>
        </div>
      </div>
    )
  }

  return (
    <ProductionRecordEntry
      shift={workspace.shift}
      pile={pile}
      masterData={workspace.masterData}
      fleetSetup={workspace.fleetSetup}
      manpower={workspace.manpower}
      pendingBatches={workspace.pendingBatches}
      registration={registration}
      targetPosition={parseMissedTargetPosition(searchParams)}
      store={localOperationalStore}
      onFleetUpdated={refreshWorkspace}
    />
  )
}
