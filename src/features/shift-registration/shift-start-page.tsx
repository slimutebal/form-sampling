import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { refreshAppsScriptMasterData } from '@/app/google/google-master-data-sync'
import { createManpowerFromDraft } from '@/application/manpower/create-manpower-from-draft'
import type {
  CurrentShiftWorkspace,
  ShiftWorkspaceReadError,
  ShiftWorkspaceReader,
} from '@/application/ports/shift-workspace-reader'
import { createShiftRegistration } from '@/application/shift-registration/create-shift-registration'
import {
  createDefaultShiftRegistrationFormValues,
  type ShiftRegistrationFormValues,
} from '@/application/shift-registration/shift-registration-form-values'
import { generateShiftId as defaultGenerateShiftId } from '@/application/shift-registration/shift-id-generator'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { DomainError, Result } from '@/domain/common/result'
import { ok } from '@/domain/common/result'
import type { ManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import type { MasterData } from '@/domain/master/master-data'
import type { Shift } from '@/domain/shift/shift'
import { manpowerErrorTranslationKey } from '@/features/manpower/error-messages'
import {
  WorkSetupManpower,
  type WorkSetupManpowerSelection,
} from '@/features/manpower/work-setup-manpower'
import type { SelectedPerson } from '@/features/manpower/use-manpower-roster'
import { ResumeShiftCard } from '@/features/shift-registration/resume-shift-card'
import { ShiftRegistrationForm } from '@/features/shift-registration/shift-registration-form'
import { workspaceErrorTranslationKey } from '@/features/shift-registration/workspace-error-messages'
import {
  readWorkSetupDraft,
  saveWorkSetupDraft,
  type PersistedWorkSetupDraft,
} from '@/infrastructure/device/work-setup-draft-store'

export interface SetupChecker {
  readonly personId: string
  readonly name: string
  readonly source: 'EMPLOYEE' | 'CREW'
  readonly jobCode?: string
}

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: ShiftWorkspaceReadError }
  | {
      readonly kind: 'loaded'
      readonly currentWorkspace: CurrentShiftWorkspace | undefined
    }

type MasterDataPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly code: string }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'offline-first-use' }
  | { readonly kind: 'remote-failed' }
  | { readonly kind: 'ready'; readonly masterData: MasterData }

type Mode = 'resume' | 'form'

/**
 * Default production implementation:
 * Apps Script fetch then cache re-read.
 */
async function defaultRefreshMasterData(): Promise<Result<void, DomainError>> {
  const result = await refreshAppsScriptMasterData()
  return result.ok ? ok(undefined) : result
}

function defaultIsOnline(): boolean {
  return navigator.onLine
}

/**
 * Restore persisted manpower IDs against the current master-data snapshot.
 */
function restoreManpowerSelection(
  draft: PersistedWorkSetupDraft,
  masterData: MasterData,
): WorkSetupManpowerSelection {
  const selected: SelectedPerson[] = []
  for (const personId of draft.manpowerPersonIds) {
    const employee = masterData.employees.find(
      (candidate) => candidate.id === personId,
    )

    if (employee) {
      selected.push({
        personId: employee.id as string,
        name: employee.name,
        source: 'EMPLOYEE',
        jobDeskCode: '',
      })
      continue
    }

    const crew = masterData.crews.find(
      (candidate) => candidate.code === personId,
    )

    if (crew) {
      selected.push({
        personId: crew.code as string,
        name: crew.name,
        source: 'CREW',
        jobDeskCode: crew.jobCode ?? '',
      })
    }
  }

  const checkerPersonId = selected.some(
    (person) => person.personId === draft.checkerPersonId,
  )
    ? draft.checkerPersonId
    : undefined

  return {
    selected,
    checkerPersonId,
  }
}

/**
 * Landing owns Checker selection.
 *
 * Work Setup must always contain that Checker in the selected manpower
 * roster, even when a stale/empty local draft is restored.
 */
function mergeInitialChecker(
  selection: WorkSetupManpowerSelection,
  initialChecker: SetupChecker | undefined,
): WorkSetupManpowerSelection {
  if (!initialChecker) {
    return selection
  }

  const hasChecker = selection.selected.some(
    (person) => person.personId === initialChecker.personId,
  )

  return {
    selected: hasChecker
      ? selection.selected
      : [
          ...selection.selected,
          {
            personId: initialChecker.personId,
            name: initialChecker.name,
            source: initialChecker.source,
            jobDeskCode: initialChecker.jobCode ?? 'Checker',
          },
        ],
    checkerPersonId: initialChecker.personId,
  }
}

/**
 * Smallest read shape required by fresh registration from the
 * validated local MasterData cache.
 */
export interface MasterDataCacheReader {
  readCachedMasterData(): Promise<
    Result<
      {
        readonly masterData: MasterData
        readonly fetchedAt: Date
      } | undefined,
      DomainError
    >
  >
}

interface ShiftStartPageProps {
  /**
   * Production passes LocalOperationalStore.
   * Tests may pass a lightweight fake.
   */
  store: ShiftWorkspaceReader

  /**
   * Master-data cache reader.
   */
  masterDataReader: MasterDataCacheReader

  /**
   * Injectable for deterministic tests.
   */
  generateShiftId?: () => string

  /**
   * Injectable first-use remote master refresh.
   */
  refreshMasterData?: () => Promise<Result<void, DomainError>>

  /**
   * Injectable online-state reader.
   */
  isOnline?: () => boolean

  /**
   * Injectable local clock.
   */
  now?: () => Date

  /**
   * Informational callback when registration becomes valid.
   */
  onRegistrationReady?: (shift: Shift) => void

  /**
   * Continue setup with validated Shift, MasterData and manpower.
   */
  onContinue: (
    shift: Shift,
    masterData: MasterData,
    manpower: readonly ManpowerAssignment[],
  ) => void

  /**
   * Checker selected on Landing.
   */
  initialChecker?: SetupChecker

  /**
   * Restored Work Setup values.
   */
  initialValues?: ShiftRegistrationFormValues

  /**
   * Restored manpower state.
   */
  initialManpowerSelection?: WorkSetupManpowerSelection

  onBack?: () => void

  forceNew?: boolean
}

/**
 * Shift registration / Work Setup screen.
 */
export function ShiftStartPage({
  store,
  masterDataReader,
  generateShiftId = defaultGenerateShiftId,
  refreshMasterData = defaultRefreshMasterData,
  isOnline = defaultIsOnline,
  now = () => new Date(),
  onRegistrationReady,
  onContinue,
  initialChecker,
  initialValues,
  initialManpowerSelection,
  onBack,
  forceNew = false,
}: ShiftStartPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<LoadPhase>({
    kind: 'loading',
  })

  const [reloadToken, setReloadToken] = useState(0)

  const [mode, setMode] = useState<Mode>('form')

  const [formValues, setFormValues] =
    useState<ShiftRegistrationFormValues>(
      () =>
        initialValues ??
        createDefaultShiftRegistrationFormValues(now()),
    )

  const [submissionError, setSubmissionError] = useState<
    string | undefined
  >(undefined)

  /**
   * IMPORTANT:
   *
   * initialChecker must always be merged into restored manpower.
   * Work Setup never asks the user to choose Checker again.
   */
  const [manpowerSelection, setManpowerSelection] =
    useState<WorkSetupManpowerSelection>(() =>
      mergeInitialChecker(
        initialManpowerSelection ?? { selected: [] },
        initialChecker,
      ),
    )

  const [manpowerError, setManpowerError] = useState<string>()

  const pengawasCount = manpowerSelection.selected.filter(
    (person) => person.source === 'EMPLOYEE',
  ).length

  const isSupervisorMissing = pengawasCount === 0

  const [masterDataPhase, setMasterDataPhase] =
    useState<MasterDataPhase>({
      kind: 'loading',
    })

  const [masterDataReloadToken, setMasterDataReloadToken] =
    useState(0)

  const hasAttemptedFirstUseFetchRef = useRef(false)

  const hasRestoredWorkSetupDraftRef = useRef(false)

  /**
   * Detect existing local active workspace.
   */
  useEffect(() => {
    let cancelled = false

    void store.loadCurrentShiftWorkspace().then((result) => {
      if (cancelled) {
        return
      }

      if (result.ok) {
        setPhase({
          kind: 'loaded',
          currentWorkspace: result.value,
        })

        setMode(
          result.value && !forceNew ? 'resume' : 'form',
        )
      } else {
        setPhase({
          kind: 'error',
          error: result.error,
        })
      }
    })

    return () => {
      cancelled = true
    }
  }, [forceNew, store, reloadToken])

  /**
   * Master data is only required when actually entering Work Setup.
   */
  const needsMasterData =
    phase.kind === 'loaded' && mode === 'form'

  useEffect(() => {
    if (!needsMasterData) {
      return
    }

    let cancelled = false

    void masterDataReader
      .readCachedMasterData()
      .then((result) => {
        if (cancelled) {
          return
        }

        if (!result.ok) {
          setMasterDataPhase({
            kind: 'error',
            code: result.error.code,
          })
          return
        }

        if (result.value) {
          setMasterDataPhase({
            kind: 'ready',
            masterData: result.value.masterData,
          })
        } else if (!isOnline()) {
          setMasterDataPhase({
            kind: 'offline-first-use',
          })
        } else {
          setMasterDataPhase({
            kind: 'unavailable',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    isOnline,
    needsMasterData,
    masterDataReader,
    masterDataReloadToken,
  ])

  /**
   * Persist Work Setup locally.
   */
  const persistWorkSetupDraft = useCallback(
    (
      values: ShiftRegistrationFormValues,
      manpower: WorkSetupManpowerSelection,
    ) => {
      saveWorkSetupDraft({
        step: 'WORK_SETUP',
        checkerPersonId: manpower.checkerPersonId,
        shiftDate: values.shiftDate,
        shiftCode: values.shiftCode,
        sectorCode: values.sectorCode,
        samplingHouseCode: values.samplingHouseCode,
        manpowerPersonIds: manpower.selected.map(
          (person) => person.personId,
        ),
      })
    },
    [],
  )

  /**
   * Restore local Work Setup draft once MasterData is available.
   *
   * CRITICAL:
   * The Landing Checker is re-merged after draft restoration so an
   * old/empty draft cannot erase the Checker selected on Landing.
   */
  useEffect(() => {
    if (
      masterDataPhase.kind !== 'ready' ||
      hasRestoredWorkSetupDraftRef.current
    ) {
      return
    }

    hasRestoredWorkSetupDraftRef.current = true

    const draft = readWorkSetupDraft()

    if (draft) {
      const restoredValues: ShiftRegistrationFormValues = {
        shiftDate: draft.shiftDate,
        shiftCode: draft.shiftCode,
        sectorCode: draft.sectorCode,
        samplingHouseCode: draft.samplingHouseCode,
      }

      const restoredManpower = mergeInitialChecker(
        restoreManpowerSelection(
          draft,
          masterDataPhase.masterData,
        ),
        initialChecker,
      )

      setFormValues(restoredValues)
      setManpowerSelection(restoredManpower)

      /**
       * Rewrite the restored draft immediately.
       *
       * This ensures the Landing-selected Checker is also present in
       * persisted Work Setup state after restoring a stale draft.
       */
      persistWorkSetupDraft(
        restoredValues,
        restoredManpower,
      )

      return
    }

    /**
     * No persisted Work Setup draft yet.
     * Persist the current state, including Landing Checker.
     */
    persistWorkSetupDraft(
      formValues,
      manpowerSelection,
    )
  }, [
    formValues,
    initialChecker,
    manpowerSelection,
    masterDataPhase,
    persistWorkSetupDraft,
  ])

  const handleRetry = useCallback(() => {
    setPhase({
      kind: 'loading',
    })

    setReloadToken((token) => token + 1)
  }, [])

  const handleRetryMasterData = useCallback(() => {
    setMasterDataPhase({
      kind: 'loading',
    })

    setMasterDataReloadToken(
      (token) => token + 1,
    )
  }, [])

  const handleRefreshRemoteMasterData =
    useCallback(async () => {
      setMasterDataPhase({
        kind: 'loading',
      })

      const result = await refreshMasterData()

      if (!result.ok) {
        setMasterDataPhase({
          kind: 'remote-failed',
        })

        return
      }

      handleRetryMasterData()
    }, [
      handleRetryMasterData,
      refreshMasterData,
    ])

  /**
   * On first use with no cache, attempt Apps Script refresh once.
   */
  useEffect(() => {
    if (
      masterDataPhase.kind !== 'unavailable' ||
      hasAttemptedFirstUseFetchRef.current
    ) {
      return
    }

    hasAttemptedFirstUseFetchRef.current = true

    void Promise.resolve().then(
      handleRefreshRemoteMasterData,
    )
  }, [
    handleRefreshRemoteMasterData,
    masterDataPhase.kind,
  ])

  const handleResume = useCallback(() => {
    navigate('/production')
  }, [navigate])

  const handleStartNew = useCallback(() => {
    setSubmissionError(undefined)

    setFormValues(
      createDefaultShiftRegistrationFormValues(now()),
    )

    setMode('form')
  }, [now])

  const handleFormSubmit = useCallback(
    (values: ShiftRegistrationFormValues) => {
      if (masterDataPhase.kind !== 'ready') {
        return
      }

      setFormValues(values)

      /**
       * Work Setup requires at least one Employee/Staff Pengawas.
       *
       * Checker does not automatically satisfy this if Checker is Crew.
       */
      if (isSupervisorMissing) {
        setManpowerError(
          t('manpower.errors.supervisorRequired'),
        )
        return
      }

      const manpowerResult = createManpowerFromDraft(
        manpowerSelection.selected.map((person) => ({
          personId: person.personId,
          jobDeskCode:
            person.personId ===
            manpowerSelection.checkerPersonId
              ? 'Checker'
              : person.source === 'CREW'
                ? 'Sampler'
                : '',
        })),
        masterDataPhase.masterData,
      )

      if (!manpowerResult.ok) {
        setManpowerError(
          t(
            manpowerErrorTranslationKey(
              manpowerResult.error.code,
            ),
          ),
        )

        return
      }

      const result = createShiftRegistration({
        shiftId: generateShiftId(),
        ...values,
        masterData: masterDataPhase.masterData,
      })

      if (result.ok) {
        setSubmissionError(undefined)
        setManpowerError(undefined)

        onRegistrationReady?.(result.value)

        onContinue(
          result.value,
          masterDataPhase.masterData,
          manpowerResult.value,
        )
      } else {
        setSubmissionError(
          'shiftStart.errors.registrationFailed',
        )
      }
    },
    [
      generateShiftId,
      isSupervisorMissing,
      manpowerSelection,
      masterDataPhase,
      onContinue,
      onRegistrationReady,
      t,
    ],
  )

  /**
   * Loading workspace.
   */
  if (phase.kind === 'loading') {
    return (
      <div>
        <PageHeader
          title="WORK SETUP"
        />

        <div
          className="px-5 py-4"
          aria-live="polite"
        >
          <p className="text-sm text-muted-foreground">
            {t('shiftStart.loading')}
          </p>
        </div>
      </div>
    )
  }

  /**
   * Workspace read error.
   */
  if (phase.kind === 'error') {
    return (
      <div>
        <PageHeader
          title="WORK SETUP"
        />

        <div className="px-5 py-4">
          <Card>
            <CardContent
              role="alert"
              className="flex flex-col gap-3"
            >
              <p>
                {t(
                  workspaceErrorTranslationKey(
                    phase.error.code,
                  ),
                )}
              </p>

              <Button
                type="button"
                onClick={handleRetry}
              >
                {t('shiftStart.errors.retry')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const pageTitle = 'WORK SETUP'

  return (
    /**
     * CRITICAL:
     *
     * Work Setup itself is locked to the device viewport.
     * The page must NOT vertically scroll.
     *
     * Only WorkSetupManpower's roster box should use overflow-y-auto.
     */
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      {mode === 'form' ? (
        <div className="grid shrink-0 grid-cols-[auto_1fr] items-center gap-2 border-b border-border px-5 py-2">
          <LanguageSwitcher compact />

          <h1 className="text-center text-[19px] font-semibold leading-tight">
            WORK SETUP
          </h1>

        </div>
      ) : null}

      {mode === 'resume' ? (
        <PageHeader title={pageTitle} />
      ) : null}

      {/*
        Main content MUST NOT become a page scroll container.
      */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-3">
        {mode === 'resume' &&
        phase.currentWorkspace ? (
          <ResumeShiftCard
            shift={phase.currentWorkspace.shift}
            onResume={handleResume}
            onStartNew={handleStartNew}
          />
        ) : null}

        {mode === 'form' ? (
          <>
            {masterDataPhase.kind === 'loading' ? (
              <p
                className="text-sm text-muted-foreground"
                aria-live="polite"
              >
                {t(
                  'shiftStart.masterData.loading',
                )}
              </p>
            ) : null}

            {masterDataPhase.kind === 'error' ? (
              <Card>
                <CardContent
                  role="alert"
                  className="flex flex-col gap-3"
                >
                  <p>
                    {t(
                      'shiftStart.masterData.errors.loadFailed',
                    )}
                  </p>

                  <Button
                    type="button"
                    onClick={
                      handleRetryMasterData
                    }
                  >
                    {t(
                      'shiftStart.errors.retry',
                    )}
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {masterDataPhase.kind ===
            'offline-first-use' ? (
              <Card>
                <CardContent role="alert">
                  <p>
                    {t(
                      'shiftStart.masterData.offlineFirstUse',
                    )}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {masterDataPhase.kind ===
            'remote-failed' ? (
              <Card>
                <CardContent
                  role="alert"
                  className="flex flex-col gap-3"
                >
                  <p>
                    {t(
                      'shiftStart.masterData.remoteFailed',
                    )}
                  </p>

                  <Button
                    type="button"
                    onClick={() =>
                      void handleRefreshRemoteMasterData()
                    }
                  >
                    {t(
                      'shiftStart.masterData.retryRemote',
                    )}
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {masterDataPhase.kind === 'ready' ? (
              /**
               * This wrapper also must not scroll.
               *
               * Remaining height is passed down to:
               * ShiftRegistrationForm
               * → WorkSetupManpower
               * → work-setup-roster
               */
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {submissionError ? (
                  <p
                    role="alert"
                    className="shrink-0 text-sm text-red-600"
                  >
                    {t(submissionError)}
                  </p>
                ) : null}

                <ShiftRegistrationForm
                  className="min-h-0 flex-1 pt-8 sm:pt-10"
                  values={formValues}
                  masterData={
                    masterDataPhase.masterData
                  }
                  onValuesChange={(values) => {
                    setFormValues(values)

                    persistWorkSetupDraft(
                      values,
                      manpowerSelection,
                    )
                  }}
                  onSubmit={handleFormSubmit}
                  showSubmitButton={false}
                >
                  <WorkSetupManpower
                    masterData={
                      masterDataPhase.masterData
                    }
                    value={manpowerSelection}
                    error={
                      isSupervisorMissing
                        ? t(
                            'manpower.errors.supervisorRequired',
                          )
                        : manpowerError
                    }
                    onChange={(selection) => {
                      setManpowerSelection(
                        selection,
                      )

                      setManpowerError(
                        undefined,
                      )

                      persistWorkSetupDraft(
                        formValues,
                        selection,
                      )
                    }}
                  />
                </ShiftRegistrationForm>

                {/*
                  Footer is always outside the scrollable manpower roster.
                  Do NOT use mt-auto here.
                */}
                <div className="grid shrink-0 grid-cols-2 gap-3 pt-3">
                  {onBack ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      onClick={onBack}
                    >
                      {t('fleetSetup.back')}
                    </Button>
                  ) : (
                    <span />
                  )}

                  <Button
                    type="submit"
                    form="work-setup-form"
                    className="w-full"
                    disabled={
                      isSupervisorMissing
                    }
                  >
                    {t(
                      'shiftStart.form.submit',
                    )}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
