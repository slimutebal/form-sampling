import { useTranslation } from 'react-i18next'
import { useOutletContext, useParams, useSearchParams } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { PageHeader } from '@/components/shared/PageHeader'
import { createBatchPosition, type BatchPosition } from '@/domain/batch/batch-position'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { ProductionRecordEntry } from '@/features/production/production-record-entry'

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
  const { workspace } = useOutletContext<ActiveWorkspaceContext>()
  const pile = workspace.piles.find((candidate) => candidate.id === pileId)

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

  return (
    <ProductionRecordEntry
      shift={workspace.shift}
      pile={pile}
      masterData={workspace.masterData}
      fleetSetup={workspace.fleetSetup}
      manpower={workspace.manpower}
      pendingBatches={workspace.pendingBatches}
      targetPosition={parseMissedTargetPosition(searchParams)}
      store={localOperationalStore}
    />
  )
}
