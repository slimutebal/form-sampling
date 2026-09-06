import { useTranslation } from 'react-i18next'
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { operationalFleetOptionForFront } from '@/application/haulage-operation/operational-fleet-options'
import { derivePileHaulagePlan } from '@/application/haulage-operation/derive-pile-haulage-plan'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { selectActiveContinuationBatches } from '@/domain/handover/carry-over-pending-batch'
import { PileHaulagePage } from '@/features/piles/pile-haulage-page'
import { pileHaulageErrorTranslationKey } from '@/features/piles/error-messages'

function InvalidFrontContext() {
  const { t } = useTranslation()
  return (
    <div>
      <PageHeader title={t('pileHaulage.title')} />
      <div className="px-4 py-4">
        <Card>
          <CardContent role="alert" className="flex flex-col gap-3">
            <p>{t('piles.errors.frontContextInvalid')}</p>
            <Link to="/piles">
              <Button type="button">{t('piles.backToPiles')}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/**
 * Router adapter for `/piles/:pileId` (Phase 18 wiring correction §11,
 * checker correction §5). The Front is resolved once here from the
 * `?front=` route query — chosen earlier on the Pile list, never asked
 * again inside the checker (`PileHaulagePage`) — and validated with
 * `operationalFleetOptionForFront` (exists, ACTIVE, destination matches
 * this Pile). A missing/stale Front never falls back to guessing another
 * one: it shows a stable translated error and sends the operator back to
 * Pile selection. Resolves the URL's PileId against the current
 * workspace's own Pile list — never recalculates batch/sampling logic
 * itself — and renders the existing `PileHaulagePage` with real
 * Shift/Pile/MasterData/FleetSetup/store. `derivePileHaulagePlan`
 * (application layer) is the only composition step here, and it only
 * wires together existing domain functions (`@/domain/batch/batch-engine`).
 */
export function PileDetailPage() {
  const { t } = useTranslation()
  const { pileId } = useParams<{ pileId: string }>()
  const [searchParams] = useSearchParams()
  const frontId = searchParams.get('front')
  const { workspace, refreshWorkspace } = useOutletContext<ActiveWorkspaceContext>()

  const pile = workspace.piles.find((candidate) => candidate.id === pileId)

  if (!pile) {
    return (
      <div>
        <PageHeader title={t('pileHaulage.title')} />
        <div className="px-4 py-4">
          <Card>
            <CardContent role="alert">
              <p>{t('piles.errors.pileNotFound')}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!frontId) {
    return <InvalidFrontContext />
  }

  const frontOptionResult = operationalFleetOptionForFront(workspace.masterData, workspace.fleetSetup, pile.id, frontId)
  if (!frontOptionResult.ok) {
    return <InvalidFrontContext />
  }

  const planResult = derivePileHaulagePlan(
    pile,
    workspace.masterData,
    workspace.pendingBatches,
    pile.freshPileStartPosition,
  )
  if (!planResult.ok) {
    return (
      <div>
        <PageHeader title={t('pileHaulage.title')} />
        <div className="px-4 py-4">
          <Card>
            <CardContent role="alert">
              <p>{t(pileHaulageErrorTranslationKey(planResult.error.code))}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const freshPileEligible = !selectActiveContinuationBatches(workspace.pendingBatches).some(
    (row) => row.pile.id === pile.id,
  )

  return (
    <PileHaulagePage
      shift={workspace.shift}
      pile={pile}
      masterData={workspace.masterData}
      fleetSetup={workspace.fleetSetup}
      frontOption={frontOptionResult.value}
      expectedPositions={planResult.value}
      store={localOperationalStore}
      freshPileEligible={freshPileEligible}
      onConfirmFreshPileStartPosition={async (startPosition) => {
        const result = await localOperationalStore.confirmFreshPileStartPosition(
          workspace.shiftId,
          pile.id,
          startPosition,
        )
        if (result.ok) {
          refreshWorkspace()
        }
        return result
      }}
    />
  )
}
