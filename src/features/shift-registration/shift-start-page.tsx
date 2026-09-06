import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { refreshAppsScriptMasterData } from '@/app/google/google-master-data-sync'
import type { DomainError, Result } from '@/domain/common/result'
import { ok } from '@/domain/common/result'
import type {
  CurrentShiftWorkspace,
  ShiftWorkspaceReadError,
  ShiftWorkspaceReader,
} from '@/application/ports/shift-workspace-reader'
import { createShiftRegistration } from '@/application/shift-registration/create-shift-registration'
import { generateShiftId as defaultGenerateShiftId } from '@/application/shift-registration/shift-id-generator'
import {
  EMPTY_SHIFT_REGISTRATION_FORM_VALUES,
  type ShiftRegistrationFormValues,
} from '@/application/shift-registration/shift-registration-form-values'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { MasterData } from '@/domain/master/master-data'
import type { Shift } from '@/domain/shift/shift'
import { ResumeShiftCard } from '@/features/shift-registration/resume-shift-card'
import { ShiftRegistrationForm } from '@/features/shift-registration/shift-registration-form'
import { ShiftRegistrationSummary } from '@/features/shift-registration/shift-registration-summary'
import { workspaceErrorTranslationKey } from '@/features/shift-registration/workspace-error-messages'

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: ShiftWorkspaceReadError }
  | { readonly kind: 'loaded'; readonly currentWorkspace: CurrentShiftWorkspace | undefined }

type MasterDataPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly code: string }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'offline-first-use' }
  | { readonly kind: 'remote-failed' }
  | { readonly kind: 'ready'; readonly masterData: MasterData }

type Mode = 'resume' | 'form' | 'review'

/** Default production implementation: Apps Script fetch then cache re-read. */
async function defaultRefreshMasterData(): Promise<Result<void, DomainError>> {
  const result = await refreshAppsScriptMasterData()
  return result.ok ? ok(undefined) : result
}

function defaultIsOnline(): boolean {
  return navigator.onLine
}

/** The smallest read shape a fresh registration needs from the Phase 16 master-data cache (`@/application/google/google-ports` `MasterDataCacheStore`, structurally satisfied by `LocalOperationalStore`). */
export interface MasterDataCacheReader {
  readCachedMasterData(): Promise<Result<{ readonly masterData: MasterData; readonly fetchedAt: Date } | undefined, DomainError>>
}

interface ShiftStartPageProps {
  /** Production callers pass the app-wide LocalOperationalStore singleton (it structurally satisfies this port); tests pass a lightweight fake. */
  store: ShiftWorkspaceReader
  /** Production callers pass the app-wide LocalOperationalStore singleton; tests pass a lightweight fake. Only consulted once there is no active workspace to resume. */
  masterDataReader: MasterDataCacheReader
  /** Injectable so tests can supply a fixed or deliberately-invalid ShiftId instead of a random UUID. */
  generateShiftId?: () => string
  /** Injectable first-use Apps Script refresh; tests never make a real request. */
  refreshMasterData?: () => Promise<Result<void, DomainError>>
  /** Injectable for deterministic offline tests. */
  isOnline?: () => boolean
  /** Fired the moment a registration is successfully validated (before the operator reviews it) — an informational hook only, not the setup-continuation trigger. */
  onRegistrationReady?: (shift: Shift) => void
  /** Phase 18 wiring correction §6: fired only from the review screen's explicit Continue action, handing the caller (setup orchestrator) the registered Shift and the MasterData snapshot it was validated against. */
  onContinue: (shift: Shift, masterData: MasterData) => void
}

/**
 * The Shift Start / Resume screen (Phase 8, extended by Phase 18).
 * Detects whether a Shift workspace already exists locally and either
 * offers to resume it, or walks the operator through a new Shift
 * registration against the cached MasterData snapshot (Phase 16 §8) —
 * never free text (Phase 18 §1-§4). Registration only produces a
 * validated domain Shift in status NEW; it does not itself initialize a
 * workspace — the caller drives the rest of setup (Handover → Fleet
 * Setup → `initializeShiftWorkspace`) once `onContinue` fires.
 */
export function ShiftStartPage({
  store,
  masterDataReader,
  generateShiftId = defaultGenerateShiftId,
  refreshMasterData = defaultRefreshMasterData,
  isOnline = defaultIsOnline,
  onRegistrationReady,
  onContinue,
}: ShiftStartPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)
  const [mode, setMode] = useState<Mode>('form')
  const [formValues, setFormValues] = useState<ShiftRegistrationFormValues>(EMPTY_SHIFT_REGISTRATION_FORM_VALUES)
  const [registeredShift, setRegisteredShift] = useState<Shift | undefined>(undefined)
  const [submissionError, setSubmissionError] = useState<string | undefined>(undefined)

  const [masterDataPhase, setMasterDataPhase] = useState<MasterDataPhase>({ kind: 'loading' })
  const [masterDataReloadToken, setMasterDataReloadToken] = useState(0)
  const hasAttemptedFirstUseFetchRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    void store.loadCurrentShiftWorkspace().then((result) => {
      if (cancelled) {
        return
      }
      if (result.ok) {
        setPhase({ kind: 'loaded', currentWorkspace: result.value })
        setMode(result.value ? 'resume' : 'form')
      } else {
        setPhase({ kind: 'error', error: result.error })
      }
    })

    return () => {
      cancelled = true
    }
  }, [store, reloadToken])

  // Only consulted once the screen actually needs the registration form —
  // no active workspace to resume, or the operator explicitly chose
  // "Start New Shift" over an existing one (Phase 18: "if no active
  // workspace: read validated cached master data"). Resume never needs
  // it, so a Resume-eligible operator can never be blocked or shown a
  // MasterData error the Resume path has nothing to do with.
  const needsMasterData = phase.kind === 'loaded' && mode === 'form'
  useEffect(() => {
    if (!needsMasterData) {
      return
    }
    let cancelled = false

    void masterDataReader.readCachedMasterData().then((result) => {
      if (cancelled) {
        return
      }
      if (!result.ok) {
        setMasterDataPhase({ kind: 'error', code: result.error.code })
        return
      }
      if (result.value) {
        setMasterDataPhase({ kind: 'ready', masterData: result.value.masterData })
      } else if (!isOnline()) {
        setMasterDataPhase({ kind: 'offline-first-use' })
      } else {
        setMasterDataPhase({ kind: 'unavailable' })
      }
    })

    return () => {
      cancelled = true
    }
  }, [isOnline, needsMasterData, masterDataReader, masterDataReloadToken])

  const handleRetry = useCallback(() => {
    setPhase({ kind: 'loading' })
    setReloadToken((token) => token + 1)
  }, [])

  const handleRetryMasterData = useCallback(() => {
    setMasterDataPhase({ kind: 'loading' })
    setMasterDataReloadToken((token) => token + 1)
  }, [])

  const handleRefreshRemoteMasterData = useCallback(async () => {
    setMasterDataPhase({ kind: 'loading' })
    const result = await refreshMasterData()
    if (!result.ok) {
      setMasterDataPhase({ kind: 'remote-failed' })
      return
    }
    handleRetryMasterData()
  }, [handleRetryMasterData, refreshMasterData])

  useEffect(() => {
    if (masterDataPhase.kind !== 'unavailable' || hasAttemptedFirstUseFetchRef.current) return
    hasAttemptedFirstUseFetchRef.current = true
    void Promise.resolve().then(handleRefreshRemoteMasterData)
  }, [handleRefreshRemoteMasterData, masterDataPhase.kind])

  const handleResume = useCallback(() => {
    navigate('/home')
  }, [navigate])

  const handleStartNew = useCallback(() => {
    setSubmissionError(undefined)
    setMode('form')
  }, [])

  const handleEdit = useCallback(() => {
    setSubmissionError(undefined)
    setMode('form')
  }, [])

  const handleFormSubmit = useCallback(
    (values: ShiftRegistrationFormValues) => {
      if (masterDataPhase.kind !== 'ready') {
        return
      }
      setFormValues(values)
      const result = createShiftRegistration({
        shiftId: generateShiftId(),
        ...values,
        masterData: masterDataPhase.masterData,
      })
      if (result.ok) {
        setSubmissionError(undefined)
        setRegisteredShift(result.value)
        setMode('review')
        onRegistrationReady?.(result.value)
      } else {
        // The form already passed field-level validation, so reaching
        // here means something outside the form fields failed (e.g. the
        // generated ShiftId). Never leave this silent, and never render
        // result.error.message — only a translated, generic message.
        setSubmissionError('shiftStart.errors.registrationFailed')
      }
    },
    [generateShiftId, masterDataPhase, onRegistrationReady],
  )

  const handleContinue = useCallback(() => {
    if (!registeredShift || masterDataPhase.kind !== 'ready') {
      return
    }
    onContinue(registeredShift, masterDataPhase.masterData)
  }, [registeredShift, masterDataPhase, onContinue])

  if (phase.kind === 'loading') {
    return (
      <div>
        <PageHeader title={t('shiftStart.form.pageTitle')} />
        <div className="px-4 py-4" aria-live="polite">
          <p className="text-sm text-muted-foreground">{t('shiftStart.loading')}</p>
        </div>
      </div>
    )
  }

  if (phase.kind === 'error') {
    return (
      <div>
        <PageHeader title={t('shiftStart.form.pageTitle')} />
        <div className="px-4 py-4">
          <Card>
            <CardContent role="alert" className="flex flex-col gap-3">
              <p>{t(workspaceErrorTranslationKey(phase.error.code))}</p>
              <Button type="button" onClick={handleRetry}>
                {t('shiftStart.errors.retry')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const pageTitle = mode === 'resume' ? t('shiftStart.resume.pageTitle') : t('shiftStart.form.pageTitle')

  return (
    <div>
      <PageHeader title={pageTitle} />
      <div className="flex flex-col gap-4 px-4 py-4">
        {mode === 'resume' && phase.currentWorkspace ? (
          <ResumeShiftCard shift={phase.currentWorkspace.shift} onResume={handleResume} onStartNew={handleStartNew} />
        ) : null}

        {mode === 'form' ? (
          <>
            {masterDataPhase.kind === 'loading' ? (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {t('shiftStart.masterData.loading')}
              </p>
            ) : null}

            {masterDataPhase.kind === 'error' ? (
              <Card>
                <CardContent role="alert" className="flex flex-col gap-3">
                  <p>{t('shiftStart.masterData.errors.loadFailed')}</p>
                  <Button type="button" onClick={handleRetryMasterData}>
                    {t('shiftStart.errors.retry')}
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {masterDataPhase.kind === 'offline-first-use' ? (
              <Card>
                <CardContent role="alert">
                  <p>{t('shiftStart.masterData.offlineFirstUse')}</p>
                </CardContent>
              </Card>
            ) : null}

            {masterDataPhase.kind === 'remote-failed' ? (
              <Card>
                <CardContent role="alert" className="flex flex-col gap-3">
                  <p>{t('shiftStart.masterData.remoteFailed')}</p>
                  <Button type="button" onClick={() => void handleRefreshRemoteMasterData()}>
                    {t('shiftStart.masterData.retryRemote')}
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {masterDataPhase.kind === 'ready' ? (
              <>
                {submissionError ? (
                  <p role="alert" className="text-sm text-red-600">
                    {t(submissionError)}
                  </p>
                ) : null}
                <ShiftRegistrationForm
                  values={formValues}
                  masterData={masterDataPhase.masterData}
                  onValuesChange={setFormValues}
                  onSubmit={handleFormSubmit}
                />
              </>
            ) : null}
          </>
        ) : null}

        {mode === 'review' && registeredShift ? (
          <ShiftRegistrationSummary shift={registeredShift} onEdit={handleEdit} onContinue={handleContinue} />
        ) : null}
      </div>
    </div>
  )
}
