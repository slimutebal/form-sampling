import { useCallback, useState } from 'react'
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
import { clearWorkSetupDraft } from '@/infrastructure/device/work-setup-draft-store'

interface HandoverOutcome {
  readonly pendingBatches: readonly PendingBatchCarryOver[]
  readonly pendingSamples: readonly HandoverPendingSample[]
  readonly handoverImport?: ImportHistoryRecord
}

interface SetupOutcome extends HandoverOutcome {
  readonly manpower: readonly ManpowerAssignment[]
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
  readonly expectedPreviousShift?: ExpectedPreviousShift
  readonly outcome?: SetupOutcome
  readonly fleetDraft?: readonly FleetSetupDraftEntry[]
}

function workSetupDraftFrom(shift: Shift, masterData: MasterData, manpower: readonly ManpowerAssignment[]): WorkSetupDraft {
  return {
    values: { shiftDate: shift.date, shiftCode: shift.shiftCode, sectorCode: shift.sectorCode, samplingHouseCode: shift.samplingHouseCode },
    manpower: {
      checkerPersonId: manpower.find((person) => person.jobDeskCode === 'Checker')?.personId,
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
  const landingState = location.state as { readonly setupChecker?: SetupChecker; readonly forceNew?: boolean; readonly setupDraft?: WorkSetupDraft } | null
  const [session, setSession] = useState<SetupSession>(() => ({ workSetupDraft: landingState?.setupDraft }))
  const goBack = useCallback(() => navigate(-1), [navigate])

  const handleContinueFromRegistration = useCallback((shift: Shift, masterData: MasterData, manpower: readonly ManpowerAssignment[]) => {
    const expected = deriveExpectedPreviousShift(shift)
    if (!expected.ok) return
    setSession((current) => ({
      ...current,
      workSetupDraft: workSetupDraftFrom(shift, masterData, manpower),
      shift,
      masterData,
      manpower,
      expectedPreviousShift: expected.value,
    }))
    navigate('/start/import')
  }, [navigate])

  const continueToPiles = useCallback((outcome: SetupOutcome) => {
    setSession((current) => ({ ...current, outcome }))
    navigate('/start/piles')
  }, [navigate])

  const handleImportReady = useCallback((carryOver: HandoverCarryOverState) => {
    if (!session.manpower) return
    continueToPiles({
      pendingBatches: carryOver.pendingBatches,
      pendingSamples: carryOver.pendingSamples,
      handoverImport: { fingerprint: carryOver.fingerprint, sourceShiftId: carryOver.sourceShiftId, schemaVersion: carryOver.schemaVersion },
      manpower: session.manpower,
      pileRegistrations: [],
    })
  }, [continueToPiles, session.manpower])

  const handleStartWithoutPreviousShift = useCallback(() => {
    if (!session.manpower) return
    setSession((current) => ({
      ...current,
      outcome: { pendingBatches: [], pendingSamples: [], manpower: session.manpower!, pileRegistrations: [] },
      fleetDraft: undefined,
    }))
    navigate('/start/piles')
  }, [navigate, session.manpower])

  const runInitialize = useCallback(async (shift: Shift, masterData: MasterData, outcome: SetupOutcome, fleetSetup: FleetSetup) => {
    const carryOverPiles = deriveShiftWorkspacePiles(outcome.pendingBatches, outcome.pendingSamples)
    const registeredPiles = deriveActiveRegistrationPiles(outcome.pileRegistrations)
    const piles = deriveActivePiles({ carryOverPiles: [...carryOverPiles, ...registeredPiles], fleetSetup, masterData })
    const result = await localOperationalStore.initializeShiftWorkspace({
      shift, piles, masterData, fleetSetup, pendingBatches: outcome.pendingBatches, pendingSamples: outcome.pendingSamples,
      manpower: outcome.manpower, handoverImport: outcome.handoverImport, pileRegistrations: outcome.pileRegistrations,
    })
    if (result.ok) {
      clearWorkSetupDraft()
      navigate('/home')
    }
  }, [navigate])

  if (location.pathname === '/start') {
    return <ShiftStartPage store={localOperationalStore} masterDataReader={localOperationalStore} onContinue={handleContinueFromRegistration}
      initialChecker={landingState?.setupChecker} forceNew={landingState?.forceNew} initialValues={session.workSetupDraft?.values}
      initialManpowerSelection={session.workSetupDraft?.manpower} onBack={goBack} />
  }

  if (!session.shift || !session.masterData || !session.manpower || !session.expectedPreviousShift) return <Navigate to="/start" replace />

  if (location.pathname === '/start/import') {
    return <HandoverPage expectedPreviousShift={session.expectedPreviousShift} store={localOperationalStore} onImportReady={handleImportReady}
      onStartWithoutPreviousShift={handleStartWithoutPreviousShift} onBack={goBack} hasExistingChoice={!!session.outcome}
      onContinueExistingChoice={session.outcome ? () => navigate('/start/piles') : undefined} />
  }

  if (!session.outcome) return <Navigate to="/start/import" replace />

  if (location.pathname === '/start/piles') {
    return <PileRegistrationPage shift={session.shift} masterData={session.masterData} initialRegistrations={session.outcome.pileRegistrations}
      onRegistrationsChange={(pileRegistrations) => setSession((current) => current.outcome ? { ...current, outcome: { ...current.outcome, pileRegistrations } } : current)}
      onRegistrationsReady={(pileRegistrations) => { setSession((current) => current.outcome ? { ...current, outcome: { ...current.outcome, pileRegistrations } } : current); navigate('/start/fleet') }}
      onBack={goBack} />
  }

  if (location.pathname === '/start/fleet') {
    return <FleetSetupPage shift={session.shift} masterData={session.masterData}
      onFleetSetupReady={(fleetSetup) => void runInitialize(session.shift!, session.masterData!, session.outcome!, fleetSetup)}
      initialEntries={session.fleetDraft} onEntriesChange={(fleetDraft) => setSession((current) => ({ ...current, fleetDraft }))} onBack={goBack}
      eligibleDestinationPileIds={activeRegistrationPileIds(session.outcome.pileRegistrations)}
      createNewPile={(draft) => createAppsScriptPileAreaForSetup({ draft, sectorCode: session.shift!.sectorCode, masterData: session.masterData! })}
      onMasterDataUpdated={(masterData) => setSession((current) => ({ ...current, masterData }))} />
  }

  return <Navigate to="/start" replace />
}
