import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import { createAppsScriptPileAreaForSetup } from '@/app/pile-master/create-apps-script-pile-area-for-setup'
import { deriveExpectedPreviousShift } from '@/application/handover/derive-expected-previous-shift'
import type { HandoverCarryOverState } from '@/application/handover/handover-carry-over'
import { deriveActivePiles } from '@/application/pile-workspace/derive-active-piles'
import { deriveShiftWorkspacePiles } from '@/application/shift-registration/derive-shift-workspace-piles'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { ExpectedPreviousShift } from '@/domain/handover/expected-previous-shift'
import type { PendingBatchCarryOver } from '@/domain/handover/carry-over-pending-batch'
import type { HandoverPendingSample } from '@/domain/handover/carry-over-pending-sample'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import type { ManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import type { MasterData } from '@/domain/master/master-data'
import type { Shift } from '@/domain/shift/shift'
import { FleetSetupPage } from '@/features/fleet-setup/fleet-setup-page'
import { HandoverPage } from '@/features/handover/handover-page'
import { ManpowerSetupPage } from '@/features/manpower/manpower-setup-page'
import type { ImportHistoryRecord } from '@/infrastructure/local-db/records'
import { ShiftStartPage } from '@/features/shift-registration/shift-start-page'

interface HandoverOutcome {
  readonly pendingBatches: readonly PendingBatchCarryOver[]
  readonly pendingSamples: readonly HandoverPendingSample[]
  readonly handoverImport?: ImportHistoryRecord
}

/** `HandoverOutcome` plus the Manpower step's result (Phase 18 §4) — kept as a separate type so `HandoverOutcome` itself stays exactly what Handover produces. */
interface SetupOutcome extends HandoverOutcome {
  readonly manpower: readonly ManpowerAssignment[]
}

type SetupPhase =
  | { readonly kind: 'registration' }
  | {
      readonly kind: 'handover'
      readonly shift: Shift
      readonly masterData: MasterData
      readonly expectedPreviousShift: ExpectedPreviousShift
    }
  | {
      readonly kind: 'handover-unavailable'
      readonly shift: Shift
      readonly masterData: MasterData
    }
  | {
      readonly kind: 'manpower'
      readonly shift: Shift
      readonly masterData: MasterData
      readonly outcome: HandoverOutcome
    }
  | {
      readonly kind: 'fleet-setup'
      readonly shift: Shift
      readonly masterData: MasterData
      readonly outcome: SetupOutcome
    }
  | {
      readonly kind: 'initializing'
      readonly shift: Shift
      readonly masterData: MasterData
      readonly outcome: SetupOutcome
      readonly fleetSetup: FleetSetup
    }
  | {
      readonly kind: 'initialize-error'
      readonly code: string
      readonly shift: Shift
      readonly masterData: MasterData
      readonly outcome: SetupOutcome
      readonly fleetSetup: FleetSetup
    }

/**
 * The Start Shift setup orchestrator (Phase 18 §2): Registration →
 * Handover → Manpower → Fleet Setup → `initializeShiftWorkspace` →
 * `/home`. Every step reuses its existing screen unchanged — this
 * component only sequences them and performs the one atomic workspace
 * write at the end, via `LocalOperationalStore.initializeShiftWorkspace`
 * (never a manual Dexie write), which never runs before every step above
 * it has been reviewed.
 */
export function StartPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<SetupPhase>({ kind: 'registration' })

  const handleContinueFromRegistration = useCallback((shift: Shift, masterData: MasterData) => {
    const expected = deriveExpectedPreviousShift(shift)
    if (!expected.ok) {
      setPhase({ kind: 'handover-unavailable', shift, masterData })
      return
    }
    setPhase({ kind: 'handover', shift, masterData, expectedPreviousShift: expected.value })
  }, [])

  const handleImportReady = useCallback(
    (shift: Shift, masterData: MasterData) =>
      (carryOver: HandoverCarryOverState) => {
        const handoverImport: ImportHistoryRecord = {
          fingerprint: carryOver.fingerprint,
          sourceShiftId: carryOver.sourceShiftId,
          schemaVersion: carryOver.schemaVersion,
        }
        setPhase({
          kind: 'manpower',
          shift,
          masterData,
          outcome: {
            pendingBatches: carryOver.pendingBatches,
            pendingSamples: carryOver.pendingSamples,
            handoverImport,
          },
        })
      },
    [],
  )

  const handleStartWithoutPreviousShift = useCallback(
    (shift: Shift, masterData: MasterData) => () => {
      setPhase({
        kind: 'manpower',
        shift,
        masterData,
        outcome: { pendingBatches: [], pendingSamples: [] },
      })
    },
    [],
  )

  const handleManpowerReady = useCallback(
    (shift: Shift, masterData: MasterData, outcome: HandoverOutcome) =>
      (manpower: readonly ManpowerAssignment[]) => {
        setPhase({ kind: 'fleet-setup', shift, masterData, outcome: { ...outcome, manpower } })
      },
    [],
  )

  const runInitialize = useCallback(
    async (shift: Shift, masterData: MasterData, outcome: SetupOutcome, fleetSetup: FleetSetup) => {
      setPhase({ kind: 'initializing', shift, masterData, outcome, fleetSetup })
      const carryOverPiles = deriveShiftWorkspacePiles(outcome.pendingBatches, outcome.pendingSamples)
      const piles = deriveActivePiles({ carryOverPiles, fleetSetup, masterData })
      const result = await localOperationalStore.initializeShiftWorkspace({
        shift,
        piles,
        masterData,
        fleetSetup,
        pendingBatches: outcome.pendingBatches,
        pendingSamples: outcome.pendingSamples,
        manpower: outcome.manpower,
        handoverImport: outcome.handoverImport,
      })
      if (result.ok) {
        navigate('/home')
        return
      }
      setPhase({ kind: 'initialize-error', code: result.error.code, shift, masterData, outcome, fleetSetup })
    },
    [navigate],
  )

  const handleFleetSetupReady = useCallback(
    (shift: Shift, masterData: MasterData, outcome: SetupOutcome) => (fleetSetup: FleetSetup) => {
      void runInitialize(shift, masterData, outcome, fleetSetup)
    },
    [runInitialize],
  )

  const handleRetryInitialize = useCallback(() => {
    if (phase.kind !== 'initialize-error') return
    void runInitialize(phase.shift, phase.masterData, phase.outcome, phase.fleetSetup)
  }, [phase, runInitialize])

  if (phase.kind === 'registration') {
    return (
      <ShiftStartPage
        store={localOperationalStore}
        masterDataReader={localOperationalStore}
        onContinue={handleContinueFromRegistration}
      />
    )
  }

  if (phase.kind === 'handover-unavailable') {
    return (
      <div>
        <PageHeader title={t('handover.title')} />
        <div className="px-5 py-4">
          <Card>
            <CardContent role="alert" className="flex flex-col gap-3">
              <p>{t('setup.errors.previousShiftUnavailable')}</p>
              <Button
                type="button"
                onClick={() =>
                  setPhase({
                    kind: 'manpower',
                    shift: phase.shift,
                    masterData: phase.masterData,
                    outcome: { pendingBatches: [], pendingSamples: [] },
                  })
                }
              >
                {t('handover.startWithoutPreviousShift')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (phase.kind === 'handover') {
    return (
      <HandoverPage
        expectedPreviousShift={phase.expectedPreviousShift}
        store={localOperationalStore}
        onImportReady={handleImportReady(phase.shift, phase.masterData)}
        onStartWithoutPreviousShift={handleStartWithoutPreviousShift(phase.shift, phase.masterData)}
      />
    )
  }

  if (phase.kind === 'manpower') {
    return (
      <ManpowerSetupPage
        shift={phase.shift}
        masterData={phase.masterData}
        onManpowerReady={handleManpowerReady(phase.shift, phase.masterData, phase.outcome)}
        onBack={() => {
          const expected = deriveExpectedPreviousShift(phase.shift)
          setPhase(
            expected.ok
              ? { kind: 'handover', shift: phase.shift, masterData: phase.masterData, expectedPreviousShift: expected.value }
              : { kind: 'handover-unavailable', shift: phase.shift, masterData: phase.masterData },
          )
        }}
      />
    )
  }

  if (phase.kind === 'fleet-setup') {
    return (
      <FleetSetupPage
        shift={phase.shift}
        masterData={phase.masterData}
        onFleetSetupReady={handleFleetSetupReady(phase.shift, phase.masterData, phase.outcome)}
        onBack={() => {
          setPhase({
            kind: 'manpower',
            shift: phase.shift,
            masterData: phase.masterData,
            outcome: phase.outcome,
          })
        }}
        createNewPile={(draft) =>
          createAppsScriptPileAreaForSetup({ draft, sectorCode: phase.shift.sectorCode, masterData: phase.masterData })
        }
        onMasterDataUpdated={(masterData) =>
          setPhase((current) => (current.kind === 'fleet-setup' ? { ...current, masterData } : current))
        }
      />
    )
  }

  if (phase.kind === 'initializing') {
    return (
      <div>
        <PageHeader title={t('setup.initializing.title')} />
        <div className="px-5 py-4" aria-live="polite">
          <p className="text-sm text-muted-foreground">{t('setup.initializing.message')}</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={t('setup.initializing.title')} />
      <div className="px-5 py-4">
        <Card>
          <CardContent role="alert" className="flex flex-col gap-3">
            <p>{t('setup.errors.initializeFailed')}</p>
            <Button type="button" onClick={handleRetryInitialize}>
              {t('shiftStart.errors.retry')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
