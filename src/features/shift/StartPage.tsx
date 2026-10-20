import { useCallback, useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import { createAppsScriptPileAreaForSetup } from '@/app/pile-master/create-apps-script-pile-area-for-setup'
import { deriveExpectedPreviousShift } from '@/application/handover/derive-expected-previous-shift'
import type { HandoverCarryOverState } from '@/application/handover/handover-carry-over'
import { deriveActivePiles } from '@/application/pile-workspace/derive-active-piles'
import {
  activeRegistrationPileIds,
  deriveActiveRegistrationPiles,
  type PileRegistrationDraft,
} from '@/application/pile-registration/pile-registration-draft'
import { deriveShiftWorkspacePiles } from '@/application/shift-registration/derive-shift-workspace-piles'
import { parsePastedProductionSamples } from '@/application/pile-registration/parse-pasted-production-samples'
import type { FleetSetupDraftEntry } from '@/application/fleet-setup/fleet-setup-draft'
import type { ShiftRegistrationFormValues } from '@/application/shift-registration/shift-registration-form-values'
import type { ExpectedPreviousShift } from '@/domain/handover/expected-previous-shift'
import type { PendingBatchCarryOver } from '@/domain/handover/carry-over-pending-batch'
import type { HandoverPendingSample } from '@/domain/handover/carry-over-pending-sample'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import type { ManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import type { MasterData } from '@/domain/master/master-data'
import type { Shift } from '@/domain/shift/shift'
import { FleetSetupPage } from '@/features/fleet-setup/fleet-setup-page'
import { HandoverPage } from '@/features/handover/handover-page'
import type { ImportHistoryRecord } from '@/infrastructure/local-db/records'
import { ShiftStartPage, type SetupChecker } from '@/features/shift-registration/shift-start-page'
import type { WorkSetupManpowerSelection } from '@/features/manpower/work-setup-manpower'
import { PileRegistrationPage } from '@/features/shift/pile-registration-page'
import { ProductionConfigurationReviewPage } from '@/features/shift/production-configuration-review-page'
import { ProductionSourcePage } from '@/features/shift/production-source-page'
import { clearWorkSetupDraft } from '@/infrastructure/device/work-setup-draft-store'
import {
  clearPreShiftSetupSession,
  readPreShiftSetupSession,
  savePreShiftSetupSession,
} from '@/infrastructure/device/pre-shift-setup-session-store'

interface HandoverOutcome {
  readonly pendingBatches: readonly PendingBatchCarryOver[]
  readonly pendingSamples: readonly HandoverPendingSample[]
  readonly handoverImport?: ImportHistoryRecord
}

interface SetupOutcome extends HandoverOutcome {
  readonly manpower: readonly ManpowerAssignment[]
  readonly checkerPersonId?: string
  readonly pileRegistrations: readonly PileRegistrationDraft[]
}

interface WorkSetupDraft {
  readonly values: ShiftRegistrationFormValues
  readonly manpower: WorkSetupManpowerSelection
}

/** State shared by the real setup routes. The URL is the authoritative step. */
interface SetupSession {
  readonly workSetupDraft?: WorkSetupDraft
  readonly shift?: Shift
  readonly masterData?: MasterData
  readonly manpower?: readonly ManpowerAssignment[]
  readonly checkerPersonId?: string
  readonly expectedPreviousShift?: ExpectedPreviousShift
  readonly outcome?: SetupOutcome
  readonly fleetDraft?: readonly FleetSetupDraftEntry[]
  readonly fleetSetup?: FleetSetup
}

type SetupStep = 'work' | 'source' | 'piles' | 'fleet' | 'review'

const SETUP_STEP_PATH: Readonly<Record<SetupStep, string>> = {
  work: '/start',
  source: '/start/source',
  piles: '/start/piles',
  fleet: '/start/fleet',
  review: '/start/review',
}

function workSetupDraftFrom(shift: Shift, masterData: MasterData, manpower: readonly ManpowerAssignment[], checkerPersonId?: string): WorkSetupDraft {
  return {
    values: { shiftDate: shift.date, shiftCode: shift.shiftCode, sectorCode: shift.sectorCode, samplingHouseCode: shift.samplingHouseCode },
    manpower: {
      checkerPersonId: checkerPersonId ?? manpower.find((person) => person.jobDeskCode === 'Checker')?.personId,
      selected: manpower.map((person) => ({
        personId: person.personId,
        name: person.name,
        source: masterData.employees.some((employee) => employee.id === person.personId) ? 'EMPLOYEE' : 'CREW',
        jobDeskCode: person.jobDeskCode,
      })),
    },
  }
}

export function StartPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const landingState = location.state as {
    readonly setupChecker?: SetupChecker
    readonly forceNew?: boolean
    readonly setupDraft?: WorkSetupDraft
    readonly identityLocked?: boolean
    readonly setupValues?: ShiftRegistrationFormValues
  } | null
  const [session, setSession] = useState<SetupSession>(() => {
    if (landingState?.forceNew) return { workSetupDraft: landingState.setupDraft }
    const recovered = readPreShiftSetupSession<SetupSession>()
    return { ...recovered, workSetupDraft: landingState?.setupDraft ?? recovered?.workSetupDraft }
  })
  const goToSetupStep = useCallback((step: SetupStep, replace = false) => {
    navigate(SETUP_STEP_PATH[step], { replace })
  }, [navigate])

  useEffect(() => {
    savePreShiftSetupSession(session)
  }, [session])

  const handleContinueFromRegistration = useCallback((shift: Shift, masterData: MasterData, manpower: readonly ManpowerAssignment[], checkerPersonId: string) => {
    const expected = deriveExpectedPreviousShift(shift)
    if (!expected.ok) return
    setSession((current) => ({
      ...current,
      workSetupDraft: workSetupDraftFrom(shift, masterData, manpower, checkerPersonId),
      shift,
      masterData,
      manpower,
      checkerPersonId,
      expectedPreviousShift: expected.value,
    }))
    goToSetupStep('source')
  }, [goToSetupStep])

  const continueToPiles = useCallback((outcome: SetupOutcome) => {
    setSession((current) => ({ ...current, outcome }))
    goToSetupStep('piles')
  }, [goToSetupStep])

  const handleImportReady = useCallback((carryOver: HandoverCarryOverState) => {
    if (!session.manpower) return
    continueToPiles({
      pendingBatches: carryOver.pendingBatches,
      pendingSamples: carryOver.pendingSamples,
      handoverImport: { fingerprint: carryOver.fingerprint, sourceShiftId: carryOver.sourceShiftId, schemaVersion: carryOver.schemaVersion },
      manpower: session.manpower,
      checkerPersonId: session.checkerPersonId!,
      pileRegistrations: carryOver.pendingBatches.map((row) => ({
        pileId: row.pile.id,
        oreCode: row.pile.oreCode,
        batch: row.pendingBatch.batchNumber,
        rit: row.pendingBatch.lastRit,
        status: row.pendingBatch.status === 'CONTINUE' ? 'ACTIVE' : 'INACTIVE',
      })),
    })
  }, [continueToPiles, session.manpower, session.checkerPersonId])

  const handleStartWithoutPreviousShift = useCallback(() => {
    if (!session.manpower) return
    setSession((current) => ({
      ...current,
      outcome: { pendingBatches: [], pendingSamples: [], manpower: session.manpower!, checkerPersonId: session.checkerPersonId!, pileRegistrations: [] },
      fleetDraft: undefined,
    }))
    goToSetupStep('piles')
  }, [goToSetupStep, session.manpower, session.checkerPersonId])

  const handlePastedReport = useCallback((report: string) => {
    if (!session.masterData || !session.shift || !session.manpower) return
    const pileRegistrations = parsePastedProductionSamples(report, session.masterData, session.shift.sectorCode)
    setSession((current) => ({
      ...current,
      outcome: { pendingBatches: [], pendingSamples: [], manpower: session.manpower!, checkerPersonId: session.checkerPersonId!, pileRegistrations },
      fleetDraft: undefined,
    }))
    goToSetupStep('piles')
  }, [goToSetupStep, session.manpower, session.masterData, session.shift, session.checkerPersonId])

  const runInitialize = useCallback(async (shift: Shift, masterData: MasterData, outcome: SetupOutcome, fleetSetup: FleetSetup) => {
    const carryOverPiles = deriveShiftWorkspacePiles(outcome.pendingBatches, outcome.pendingSamples)
    const registeredPiles = deriveActiveRegistrationPiles(outcome.pileRegistrations)
    const piles = deriveActivePiles({ carryOverPiles: [...carryOverPiles, ...registeredPiles], fleetSetup, masterData })
    const activeShift: Shift = { ...shift, status: 'ACTIVE' }
    const result = await localOperationalStore.initializeShiftWorkspace({
      shift: activeShift, piles, masterData, fleetSetup, pendingBatches: outcome.pendingBatches, pendingSamples: outcome.pendingSamples,
      manpower: outcome.manpower, checkerPersonId: outcome.checkerPersonId, handoverImport: outcome.handoverImport, pileRegistrations: outcome.pileRegistrations,
    })
    if (result.ok) {
      clearWorkSetupDraft()
      clearPreShiftSetupSession()
      navigate('/production', { replace: true })
    }
  }, [navigate])

  if (location.pathname === '/start') {
    return <ShiftStartPage store={localOperationalStore} masterDataReader={localOperationalStore} onContinue={handleContinueFromRegistration}
      initialChecker={landingState?.setupChecker} forceNew={landingState?.forceNew}
      identityLocked={landingState?.identityLocked}
      initialValues={landingState?.setupValues ?? session.workSetupDraft?.values}
      initialManpowerSelection={session.workSetupDraft?.manpower} onBack={() => navigate('/', { replace: true })} />
  }

  if (!session.shift || !session.masterData || !session.manpower || !session.expectedPreviousShift) return <Navigate to="/start" replace />

  if (location.pathname === '/start/source') {
    return <ProductionSourcePage
      onImportFile={() => navigate('/start/import')}
      onPasteReport={handlePastedReport}
      onCreateNew={handleStartWithoutPreviousShift}
      onBack={() => goToSetupStep('work', true)}
    />
  }

  if (location.pathname === '/start/import') {
    return <HandoverPage expectedPreviousShift={session.expectedPreviousShift} store={localOperationalStore} onImportReady={handleImportReady}
      onStartWithoutPreviousShift={handleStartWithoutPreviousShift} onBack={() => goToSetupStep('source', true)} hasExistingChoice={!!session.outcome}
      onContinueExistingChoice={session.outcome ? () => goToSetupStep('piles') : undefined} />
  }

  if (!session.outcome) return <Navigate to="/start/source" replace />

  if (location.pathname === '/start/piles') {
    return <PileRegistrationPage shift={session.shift} masterData={session.masterData} initialRegistrations={session.outcome.pileRegistrations}
      onRegistrationsChange={(pileRegistrations) => setSession((current) => current.outcome ? { ...current, outcome: { ...current.outcome, pileRegistrations } } : current)}
      onRegistrationsReady={(pileRegistrations) => { setSession((current) => current.outcome ? { ...current, outcome: { ...current.outcome, pileRegistrations } } : current); goToSetupStep('fleet') }}
      onBack={() => goToSetupStep('source', true)} />
  }

  if (location.pathname === '/start/fleet') {
    return <FleetSetupPage shift={session.shift} masterData={session.masterData}
      onFleetSetupReady={(fleetSetup) => { setSession((current) => ({ ...current, fleetSetup })); goToSetupStep('review') }}
      initialEntries={session.fleetDraft} onEntriesChange={(fleetDraft) => setSession((current) => ({ ...current, fleetDraft }))} onBack={() => goToSetupStep('piles', true)}
      eligibleDestinationPileIds={activeRegistrationPileIds(session.outcome.pileRegistrations)}
      createNewPile={(draft) => createAppsScriptPileAreaForSetup({ draft, sectorCode: session.shift!.sectorCode, masterData: session.masterData! })}
      onMasterDataUpdated={(masterData) => setSession((current) => ({ ...current, masterData }))} />
  }

  if (location.pathname === '/start/review' && session.fleetSetup) {
    return <ProductionConfigurationReviewPage
      shift={session.shift}
      manpower={session.outcome.manpower}
      registrations={session.outcome.pileRegistrations}
      fleetSetup={session.fleetSetup}
      onBack={() => goToSetupStep('fleet', true)}
      onFinish={() => void runInitialize(session.shift!, session.masterData!, session.outcome!, session.fleetSetup!)}
    />
  }

  return <Navigate to="/start" replace />
}
