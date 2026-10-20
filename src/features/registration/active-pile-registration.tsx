import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { hasDuplicateRegistration } from '@/application/pile-registration/registration-context'
import type {
  PileRegistrationDraft,
  PileRegistrationStatus,
} from '@/application/pile-registration/pile-registration-draft'
import {
  deriveSampleBatchLimits,
  deriveSampleBatchProgress,
  isTripWithinSampleBatch,
} from '@/application/sample-handling/sample-batch-progress'
import { parseBatchNumber, type BatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber, type RitNumber } from '@/domain/batch/rit-number'
import type { PileId } from '@/domain/common/identifiers'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'
import { SampleProgressSummary } from '@/features/registration/sample-progress-summary'

interface ActivePileRegistrationFormProps {
  readonly onSaved?: () => void
  /** Lets the floating modal associate its footer action with this form. */
  readonly formId: string
  /** Supplying a row turns the same active-shift form into its local edit flow. */
  readonly initialRegistration?: PileRegistrationDraft
  /** Lets the modal disable its external Save action while a hard rule fails. */
  readonly onCanSubmitChange?: (canSubmit: boolean) => void
}

type PileOptionsPlacement = Readonly<{
  direction: 'above' | 'below'
  maxHeight: number
}>

const preferredPileOptionsHeight = 176

/** Active-shift Sample Setup with config-driven Trip and bag constraints. */
export function ActivePileRegistrationForm({
  onSaved,
  formId,
  initialRegistration,
  onCanSubmitChange,
}: ActivePileRegistrationFormProps) {
  const { workspace, refreshWorkspace } = useOutletContext<ActiveWorkspaceContext>()
  const [query, setQuery] = useState('')
  const [selectedPileId, setSelectedPileId] = useState<PileId | undefined>(
    initialRegistration?.pileId,
  )
  const [batch, setBatch] = useState(initialRegistration ? String(initialRegistration.batch) : '')
  const [trip, setTrip] = useState(initialRegistration ? String(initialRegistration.rit) : '')
  const [status, setStatus] = useState<PileRegistrationStatus>(
    initialRegistration?.status ?? 'ACTIVE',
  )
  const [sampleInHouse, setSampleInHouse] = useState(
    initialRegistration?.sampleInHouse === undefined
      ? ''
      : String(initialRegistration.sampleInHouse),
  )
  const [error, setError] = useState('')
  const [samplePositions, setSamplePositions] = useState<readonly SamplePosition[]>([])
  const [operationalHistoryResult, setOperationalHistoryResult] = useState(false)
  const pileFieldRef = useRef<HTMLDivElement>(null)
  const [pileOptionsPlacement, setPileOptionsPlacement] = useState<PileOptionsPlacement>({
    direction: 'below',
    maxHeight: preferredPileOptionsHeight,
  })

  useEffect(() => {
    let cancelled = false
    void localOperationalStore.listSamplePositionsForShift(workspace.shiftId).then((result) => {
      if (!cancelled && result.ok) setSamplePositions(result.value)
    })
    return () => {
      cancelled = true
    }
  }, [workspace.shiftId])

  useEffect(() => {
    if (!initialRegistration) return
    let cancelled = false
    void Promise.all([
      localOperationalStore.listHaulageTransactionsForShiftPile(
        workspace.shiftId,
        initialRegistration.pileId,
      ),
      localOperationalStore.listProductionRecordsForShiftPile(
        workspace.shiftId,
        initialRegistration.pileId,
      ),
      localOperationalStore.listSamplePositionsForShiftPile(
        workspace.shiftId,
        initialRegistration.pileId,
      ),
    ]).then(([haulage, production, samples]) => {
      if (cancelled || !haulage.ok || !production.ok || !samples.ok) return
      const originalBatch = Number(initialRegistration.batch)
      setOperationalHistoryResult(
        haulage.value.some((item) => Number(item.batchPosition.batchNumber) === originalBatch) ||
          production.value.some(
            (item) =>
              Number(item.transaction.batchPosition.batchNumber) === originalBatch ||
              Number(item.effective.batchPosition.batchNumber) === originalBatch,
          ) ||
          samples.value.some((item) => Number(item.batchNumber) === originalBatch),
      )
    })
    return () => {
      cancelled = true
    }
  }, [initialRegistration, workspace.shiftId])

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle
      ? workspace.masterData.pileAreas.filter(
          (area) =>
            area.sectorCode === workspace.shift.sectorCode &&
            ((area.pileId as string).toLowerCase().includes(needle) ||
              (area.stockpileCode as string).toLowerCase().includes(needle)),
        )
      : []
  }, [query, workspace.masterData.pileAreas, workspace.shift.sectorCode])

  useLayoutEffect(() => {
    if (!query.trim()) return

    const field = pileFieldRef.current
    const dialogBody = field?.closest<HTMLElement>('[data-ui="sample-dialog-body"]')
    if (!field || !dialogBody) return

    let frame = 0
    const updatePlacement = () => {
      const fieldBounds = field.getBoundingClientRect()
      const bodyBounds = dialogBody.getBoundingClientRect()
      // jsdom has no layout. Preserve the safe, normal downward default for
      // tests while browsers calculate against the scrollable modal body.
      if (bodyBounds.height <= 0) return

      const gap = 4
      const above = Math.max(0, fieldBounds.top - bodyBounds.top - gap)
      const below = Math.max(0, bodyBounds.bottom - fieldBounds.bottom - gap)
      // Upward placement is allowed only when the complete preferred list fits
      // inside the form body. Otherwise the list stays below the field and is
      // capped to the body space rather than crossing the title or footer.
      const direction = above >= preferredPileOptionsHeight ? 'above' : 'below'
      const available = direction === 'above' ? above : below
      setPileOptionsPlacement({
        direction,
        maxHeight: Math.floor(Math.min(preferredPileOptionsHeight, available)),
      })
    }
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updatePlacement)
    }

    scheduleUpdate()
    dialogBody.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    window.visualViewport?.addEventListener('resize', scheduleUpdate)
    window.visualViewport?.addEventListener('scroll', scheduleUpdate)
    return () => {
      cancelAnimationFrame(frame)
      dialogBody.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      window.visualViewport?.removeEventListener('resize', scheduleUpdate)
      window.visualViewport?.removeEventListener('scroll', scheduleUpdate)
    }
  }, [query])
  const selectedPile = selectedPileId
    ? workspace.masterData.pileAreas.find((area) => area.pileId === selectedPileId)
    : undefined
  const limits = selectedPile
    ? deriveSampleBatchLimits(workspace.masterData, selectedPile.oreCode)
    : undefined

  const parsedBatch = batch.trim() === '' ? undefined : parseBatchNumber(Number(batch))
  const parsedTrip = trip.trim() === '' ? undefined : parseRitNumber(Number(trip))
  const batchValue = parsedBatch?.ok ? parsedBatch.value : undefined
  const tripValue = parsedTrip?.ok ? parsedTrip.value : undefined
  const numericTrip = trip.trim() === '' ? undefined : Number(trip)
  const tripError =
    numericTrip === undefined || !Number.isFinite(numericTrip) || !Number.isInteger(numericTrip)
      ? undefined
      : limits && numericTrip > limits.batchCapacity
        ? `Trip cannot exceed ${limits.batchCapacity} for ${selectedPile?.oreCode}.`
        : limits && !isTripWithinSampleBatch(limits, numericTrip)
          ? 'Trip must be a whole number of at least 1.'
          : undefined

  const progress = useMemo(() => {
    if (!selectedPile) return undefined
    return deriveSampleBatchProgress(
      {
        pileId: selectedPile.pileId,
        oreCode: selectedPile.oreCode,
        batch: batchValue ?? (1 as BatchNumber),
        rit: tripValue ?? (1 as RitNumber),
      },
      workspace.masterData,
      batchValue ? samplePositions : [],
      tripValue ? Number(tripValue) : 0,
    )
  }, [batchValue, samplePositions, selectedPile, tripValue, workspace.masterData])

  const physicalInHouse = sampleInHouse.trim() === '' ? undefined : Number(sampleInHouse)
  const physicalInputError =
    physicalInHouse === undefined ||
    (Number.isFinite(physicalInHouse) && Number.isInteger(physicalInHouse) && physicalInHouse >= 0)
      ? undefined
      : 'Sample In House must be a whole number of zero or more.'
  const physicalRangeError =
    physicalInputError || physicalInHouse === undefined || !progress
      ? undefined
      : physicalInHouse > progress.maximumPhysicalInHouseBags
        ? `Maximum possible In House is ${progress.maximumPhysicalInHouseBags} bags.`
        : undefined
  const physicalError = physicalInputError ?? physicalRangeError
  const physicalWarning =
    !physicalError &&
    physicalInHouse !== undefined &&
    progress &&
    progress.deliveredIncrementCount > 0 &&
    physicalInHouse < progress.maximumPhysicalInHouseBags
      ? 'Physical count is lower than recorded sample balance.'
      : undefined
  const validPhysicalInHouse = physicalError ? undefined : physicalInHouse
  const hasDependencies =
    (Boolean(initialRegistration) && operationalHistoryResult) ||
    Boolean(
      initialRegistration &&
      samplePositions.some(
        (position) =>
          position.pileId === initialRegistration.pileId &&
          Number(position.batchNumber) === Number(initialRegistration.batch),
      ),
    )
  const canSubmit = Boolean(selectedPile && batchValue && tripValue && !tripError && !physicalError)

  useEffect(() => {
    onCanSubmitChange?.(canSubmit)
  }, [canSubmit, onCanSubmitChange])

  function keepFocusedFieldVisible(event: React.FocusEvent<HTMLInputElement>) {
    event.currentTarget.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }

  async function add() {
    if (!selectedPile || !batchValue || !tripValue) {
      setError('Select a valid Pile, Batch, and Trip.')
      return
    }
    if (tripError) {
      setError(tripError)
      return
    }
    if (physicalError) {
      setError(physicalError)
      return
    }
    const isSameOriginal = (row: PileRegistrationDraft) =>
      initialRegistration &&
      row.pileId === initialRegistration.pileId &&
      Number(row.batch) === Number(initialRegistration.batch)
    const duplicate = workspace.pileRegistrations.some(
      (row) =>
        !isSameOriginal(row) &&
        hasDuplicateRegistration([row], selectedPile.pileId, Number(batchValue)),
    )
    if (duplicate) {
      setError('This Pile ID and Batch are already registered.')
      return
    }
    const next = {
      pileId: selectedPile.pileId,
      oreCode: selectedPile.oreCode,
      batch: batchValue,
      rit: tripValue,
      status,
      sampleInHouse: validPhysicalInHouse,
    }
    const registrations = initialRegistration
      ? workspace.pileRegistrations.map((row) => (isSameOriginal(row) ? next : row))
      : [...workspace.pileRegistrations, next]
    const result = await localOperationalStore.updatePileRegistrations(
      workspace.shiftId,
      registrations,
    )
    if (!result.ok) {
      setError('Unable to save Sample Setup.')
      return
    }
    refreshWorkspace()
    onSaved?.()
  }

  return (
    <form
      id={formId}
      data-ui="active-sample-form"
      data-mode={initialRegistration ? 'edit' : 'add'}
      noValidate
      className="active-sample-form flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void add()
      }}
    >
      <div data-ui="sample-dialog-progress" data-material={selectedPile?.oreCode}>
        <SampleProgressSummary
          progress={progress}
          countFormat="of"
          physicalInHouse={validPhysicalInHouse}
          showDerivedInHouse={false}
        />
      </div>
      <div ref={pileFieldRef} data-ui="sample-dialog-pile" className="relative">
        <label className="type-field-label mb-1 block text-foreground" htmlFor="active-pile-search">
          Pile_Id
        </label>
        {selectedPile ? (
          <div
            data-ui="sample-dialog-pile-selected"
            data-material={selectedPile.oreCode}
            className="flex h-12 items-center justify-between gap-2 rounded-[var(--radius-control)] border px-3 text-sm"
          >
            <span className="min-w-0 truncate font-medium">
              {selectedPile.pileId}{' '}
              <span aria-hidden="true" className="text-muted-foreground">
                &middot;
              </span>{' '}
              <span
                data-ui="sample-dialog-material"
                data-material={selectedPile.oreCode}
                className="font-semibold"
              >
                {selectedPile.oreCode}
              </span>
            </span>
            {!hasDependencies ? (
              <button
                type="button"
                className="shrink-0 font-semibold text-primary"
                onClick={() => {
                  setSelectedPileId(undefined)
                  setQuery('')
                  setError('')
                }}
              >
                Change
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <input
              id="active-pile-search"
              aria-label="Pile_Id"
              value={query}
              onFocus={keepFocusedFieldVisible}
              onChange={(event) => {
                setQuery(event.target.value)
                setError('')
              }}
              placeholder="Search Pile_Id..."
              className="active-sample-dialog-field h-12 w-full rounded-[var(--radius-control)] border px-3 text-foreground"
            />
            {query.trim() ? (
              <div
                data-ui="sample-dialog-pile-options"
                data-placement={pileOptionsPlacement.direction}
                style={{ maxHeight: `${pileOptionsPlacement.maxHeight}px` }}
                className={`scrollbar-none absolute left-0 z-[60] w-full overflow-y-auto rounded-[var(--radius-control)] border border-border bg-surface-elevated shadow-xl ${
                  pileOptionsPlacement.direction === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
                }`}
              >
                {candidates.map((area) => (
                  <button
                    key={area.pileId}
                    type="button"
                    aria-label={`Select ${area.pileId} ${area.oreCode}`}
                    data-ui="sample-dialog-pile-option"
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setSelectedPileId(area.pileId)
                      setQuery('')
                      setError('')
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      <span className="truncate text-muted-foreground">{area.stockpileCode}</span>
                      <span aria-hidden="true" className="text-muted-foreground">
                        &middot;
                      </span>
                      <span className="truncate font-semibold text-foreground">{area.pileId}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden="true" className="text-muted-foreground">
                        &middot;
                      </span>
                      <span
                        data-ui="sample-dialog-material"
                        data-material={area.oreCode}
                        className="font-semibold"
                      >
                        {area.oreCode}
                      </span>
                    </span>
                  </button>
                ))}
                {candidates.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">No Pile found.</p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
      <div data-ui="sample-dialog-batch-trip" className="grid grid-cols-2 gap-3">
        <label className="type-field-label text-foreground">
          Batch
          <input
            aria-label="Batch"
            disabled={hasDependencies}
            value={batch}
            onFocus={keepFocusedFieldVisible}
            onChange={(event) => {
              setBatch(event.target.value)
              setError('')
            }}
            placeholder="Batch"
            inputMode="numeric"
            className="active-sample-dialog-field mt-1 h-12 w-full rounded-[var(--radius-control)] border px-3 font-normal disabled:bg-muted"
          />
        </label>
        <label className="type-field-label text-foreground">
          Trip
          <input
            aria-label="Trip"
            disabled={hasDependencies}
            value={trip}
            onFocus={keepFocusedFieldVisible}
            onChange={(event) => {
              setTrip(event.target.value)
              setError('')
            }}
            placeholder="Trip"
            inputMode="numeric"
            aria-invalid={Boolean(tripError)}
            className={`active-sample-dialog-field mt-1 h-12 w-full rounded-[var(--radius-control)] border px-3 font-normal disabled:bg-muted ${tripError ? 'border-danger' : ''}`}
          />
          {tripError ? <span className="type-field-error mt-1 block text-danger">{tripError}</span> : null}
        </label>
      </div>
      <div data-ui="sample-dialog-house-status" className="grid grid-cols-2 gap-3">
        <label className="type-field-label text-foreground">
          <span className="flex items-center justify-between gap-2">
            <span>Sample In House</span>
            {progress ? <span data-ui="sample-dialog-max-bags" className="type-field-helper whitespace-nowrap text-warning">Max {progress.maximumPhysicalInHouseBags} Bags</span> : null}
          </span>
          <input
            aria-label="Sample In House"
            value={sampleInHouse}
            onFocus={keepFocusedFieldVisible}
            onChange={(event) => {
              setSampleInHouse(event.target.value)
              setError('')
            }}
            placeholder="Physical bags"
            inputMode="numeric"
            aria-invalid={Boolean(physicalError)}
            className={`active-sample-dialog-field mt-1 h-12 w-full rounded-[var(--radius-control)] border px-3 font-normal ${physicalError ? 'border-danger' : ''}`}
          />
          {physicalError ? (
            <span className="type-field-error mt-1 block text-danger">{physicalError}</span>
          ) : null}
          {physicalWarning ? (
            <span className="type-field-error mt-1 block text-warning">{physicalWarning}</span>
          ) : null}
        </label>
        <label className="type-field-label text-foreground">
          Status
          <select
            aria-label="Status"
            data-ui="sample-dialog-status"
            data-status={status}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as PileRegistrationStatus)
              setError('')
            }}
            className="active-sample-dialog-field mt-1 h-12 w-full rounded-[var(--radius-control)] border px-3 font-medium"
          >
            <option value="ACTIVE">Planned</option>
            <option value="INACTIVE">Unplanned</option>
          </select>
        </label>
      </div>
      {error ? (
        <p role="alert" className="type-field-error text-danger">
          {error}
        </p>
      ) : null}
    </form>
  )
}
