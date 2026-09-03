import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
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
import type { Shift } from '@/domain/shift/shift'
import { ResumeShiftCard } from '@/features/shift-registration/resume-shift-card'
import { ShiftRegistrationForm } from '@/features/shift-registration/shift-registration-form'
import { ShiftRegistrationSummary } from '@/features/shift-registration/shift-registration-summary'
import { workspaceErrorTranslationKey } from '@/features/shift-registration/workspace-error-messages'

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: ShiftWorkspaceReadError }
  | { readonly kind: 'loaded'; readonly currentWorkspace: CurrentShiftWorkspace | undefined }

type Mode = 'resume' | 'form' | 'review'

interface ShiftStartPageProps {
  /** Production callers pass the app-wide LocalOperationalStore singleton (it structurally satisfies this port); tests pass a lightweight fake. */
  store: ShiftWorkspaceReader
  /** Injectable so tests can supply a fixed or deliberately-invalid ShiftId instead of a random UUID. */
  generateShiftId?: () => string
  /** Clean handoff boundary for Phase 9 (Fleet Setup) to consume once it exists. Unused today. */
  onRegistrationReady?: (shift: Shift) => void
}

/**
 * The Shift Start / Resume screen (Phase 8). Detects whether a Shift
 * workspace already exists locally and either offers to resume it, or
 * walks the operator through a new Shift registration. Registration only
 * produces a validated domain Shift in status NEW — it deliberately does
 * not call `initializeShiftWorkspace`, because Piles/MasterData/FleetSetup
 * for a brand-new shift are not yet legitimately available in this phase
 * (docs/ROADMAP.md Phase 9+).
 */
export function ShiftStartPage({
  store,
  generateShiftId = defaultGenerateShiftId,
  onRegistrationReady,
}: ShiftStartPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)
  const [mode, setMode] = useState<Mode>('form')
  const [formValues, setFormValues] = useState<ShiftRegistrationFormValues>(EMPTY_SHIFT_REGISTRATION_FORM_VALUES)
  const [registeredShift, setRegisteredShift] = useState<Shift | undefined>(undefined)
  const [submissionError, setSubmissionError] = useState<string | undefined>(undefined)

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

  const handleRetry = useCallback(() => {
    setPhase({ kind: 'loading' })
    setReloadToken((token) => token + 1)
  }, [])

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
      setFormValues(values)
      const result = createShiftRegistration({ shiftId: generateShiftId(), ...values })
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
    [generateShiftId, onRegistrationReady],
  )

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
            {submissionError ? (
              <p role="alert" className="text-sm text-red-600">
                {t(submissionError)}
              </p>
            ) : null}
            <ShiftRegistrationForm values={formValues} onValuesChange={setFormValues} onSubmit={handleFormSubmit} />
          </>
        ) : null}

        {mode === 'review' && registeredShift ? (
          <ShiftRegistrationSummary shift={registeredShift} onEdit={handleEdit} />
        ) : null}
      </div>
    </div>
  )
}
