import { isEffectiveProductionRecord, selectEffectiveProductionRecords } from '@/application/production/effective-production'
import type { PileRegistrationDraft } from '@/application/pile-registration/pile-registration-draft'
import { deriveEffectiveSamplingRequirement } from '@/application/production/production-sample-impact'
import { nextBatchPosition } from '@/domain/batch/batch-engine'
import { createBatchPosition, createInitialBatchPosition, type BatchPosition } from '@/domain/batch/batch-position'
import { err, ok, type DomainError, type Result } from '@/domain/common/result'
import type { PileId } from '@/domain/common/identifiers'
import { findOreSamplingConfig, type MasterData } from '@/domain/master/master-data'
import type { Pile } from '@/domain/pile/pile'
import type { ProductionRecord } from '@/domain/production/production-record'

/**
 * Read-only production presentation derived from the persisted record
 * stream. Trip No is a per-Pile effective-record sequence; it is neither
 * a Batch position nor a sampling increment and is never persisted alone.
 */
export interface ProductionRecordDisplayRow {
  readonly record: ProductionRecord
  readonly tripNo: number
  readonly batchNumber: number
  readonly tripWithinBatch: number
}

/** Presentation formats deliberately differ: the record sequence is not a Batch Trip. */
export function formatProductionTripNo(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatBatchCode(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatTripWithinBatch(value: number): string {
  return String(value).padStart(3, '0')
}

export function formatBatchPosition(batchNumber: number, tripWithinBatch: number): string {
  return `${formatBatchCode(batchNumber)}/${formatTripWithinBatch(tripWithinBatch)}`
}

/**
 * A highlight means a physical increment is currently due for this effective
 * record. It intentionally does not trust the immutable transaction snapshot:
 * a correction may have changed the effective Batch position or disposition.
 */
export function isEffectiveIncrementProductionRecord(
  record: ProductionRecord,
  pile: Pile,
  masterData: MasterData,
): boolean {
  if (!isEffectiveProductionRecord(record)) return false
  const requirement = deriveEffectiveSamplingRequirement(pile, masterData, record.effective.batchPosition)
  return requirement.ok && requirement.value.sampleRequired
}

/** Compact, current-state counters for one Pile's Production dashboard. */
export interface ProductionOperationalCounters {
  /** ACCEPT + ACTIVE records only; correction audit events never inflate this. */
  readonly tripCount: number
  /** The same effective increment predicate used for history row highlighting. */
  readonly incrementCount: number
  /** ACTIVE records whose current disposition is REJECT. */
  readonly rejectCount: number
  /** ACTIVE records whose current truck validation is WRONG_TRUCK. */
  readonly wrongTruckCount: number
}

export function deriveProductionOperationalCounters(
  records: readonly ProductionRecord[],
  pile: Pile,
  masterData: MasterData,
): ProductionOperationalCounters {
  const pileRecords = records.filter((record) => record.transaction.pileId === pile.id)
  const effectiveRecords = pileRecords.filter(isEffectiveProductionRecord)
  return {
    tripCount: effectiveRecords.length,
    incrementCount: effectiveRecords.filter((record) => isEffectiveIncrementProductionRecord(record, pile, masterData)).length,
    rejectCount: pileRecords.filter((record) => record.effective.status === 'ACTIVE' && record.effective.disposition === 'REJECT').length,
    wrongTruckCount: pileRecords.filter((record) => record.effective.status === 'ACTIVE' && record.effective.truckValidation.status === 'WRONG_TRUCK').length,
  }
}

export interface DashboardBatchSummary {
  readonly batchNumber: number
  readonly isActive: boolean
  readonly currentTripWithinBatch: number
  /** Compact actual Front identifiers, never available Fleet candidates. */
  readonly frontCodes: readonly string[]
}

export type OperationalBatchStatus = 'DIRECT_ACTIVE' | 'NEEDS_CONTINUATION' | 'HISTORICAL_COMPLETE' | 'INACTIVE'

/** Current, non-persisted operational state for one registered Pile + Batch. */
export interface OperationalBatchState {
  readonly registration: PileRegistrationDraft
  readonly batchNumber: number
  readonly currentTripWithinBatch: number
  readonly batchSize: number
  readonly operationalStatus: OperationalBatchStatus
}

/**
 * A completed registration stays selectable only until its explicitly linked
 * successor has an effective production record. The link is deliberately
 * persisted on the successor registration: batch numbers are operator chosen,
 * so numeric adjacency cannot identify a chain safely.
 */
export function deriveOperationalBatchStates(
  masterData: MasterData,
  pile: Pile,
  records: readonly ProductionRecord[],
  registrations: readonly PileRegistrationDraft[],
): Result<readonly OperationalBatchState[], DomainError> {
  const config = findOreSamplingConfig(masterData, pile.oreCode)
  if (!config) return err({ code: 'ORE_SAMPLING_CONFIG_NOT_FOUND', message: 'Ore sampling config not found' })
  const pileRegistrations = registrations.filter((registration) => registration.pileId === pile.id)
  const operationalRegistrations = [
    ...pileRegistrations,
    ...recoverUnregisteredContinuationBatches(records, pile, pileRegistrations, Number(config.batchSize)),
  ]
  return ok(
    operationalRegistrations
      .map((registration) => {
        const current = currentPositionForRegistration(records, registration)
        const successorHasStarted = operationalRegistrations.some((candidate) =>
          candidate.pileId === registration.pileId &&
          Number(candidate.continuationFromBatch) === Number(registration.batch) &&
          hasEffectiveProductionForRegistration(records, candidate),
        )
        const operationalStatus: OperationalBatchStatus = registration.status === 'INACTIVE'
          ? 'INACTIVE'
          : current.trip < Number(config.batchSize)
            ? 'DIRECT_ACTIVE'
            : successorHasStarted ? 'HISTORICAL_COMPLETE' : 'NEEDS_CONTINUATION'
        return {
          registration,
          batchNumber: Number(registration.batch),
          currentTripWithinBatch: current.trip,
          batchSize: Number(config.batchSize),
          operationalStatus,
        }
      })
      .sort((left, right) => left.batchNumber - right.batchNumber),
  )
}

/**
 * Older workspaces can contain a recorded continuation before the matching
 * registration row began being persisted. Recover only that narrow shape:
 * an otherwise unregistered Batch whose first effective record is Trip 001,
 * immediately following a configured-capacity registered Batch in effective
 * record chronology. This never assumes the successor's numeric Batch code.
 */
function recoverUnregisteredContinuationBatches(
  records: readonly ProductionRecord[],
  pile: Pile,
  registrations: readonly PileRegistrationDraft[],
  batchSize: number,
): readonly PileRegistrationDraft[] {
  const registeredBatches = new Set(registrations.map((registration) => Number(registration.batch)))
  const registrationsByBatch = new Map(registrations.map((registration) => [Number(registration.batch), registration]))
  const chronological = selectEffectiveProductionRecords(records)
    .map((record, sourceIndex) => ({ record, sourceIndex }))
    .filter(({ record }) => record.transaction.pileId === pile.id)
    .sort((left, right) => {
      const leftTime = left.record.audit.createdAt?.getTime()
      const rightTime = right.record.audit.createdAt?.getTime()
      if (leftTime !== undefined && rightTime !== undefined && leftTime !== rightTime) return leftTime - rightTime
      if (leftTime !== undefined && rightTime === undefined) return -1
      if (leftTime === undefined && rightTime !== undefined) return 1
      return left.sourceIndex - right.sourceIndex
    })
  const recovered: PileRegistrationDraft[] = []
  let latestCompletedRegistration: PileRegistrationDraft | undefined
  for (const { record } of chronological) {
    const batchNumber = Number(record.effective.batchPosition.batchNumber)
    const trip = Number(record.effective.batchPosition.ritNumber)
    let registered = registrationsByBatch.get(batchNumber)
    if (!registered && !registeredBatches.has(batchNumber) && trip === 1) {
      registered = {
        pileId: pile.id,
        oreCode: pile.oreCode,
        batch: record.effective.batchPosition.batchNumber,
        rit: record.effective.batchPosition.ritNumber,
        status: 'ACTIVE',
        ...(latestCompletedRegistration ? { continuationFromBatch: latestCompletedRegistration.batch } : {}),
      }
      recovered.push(registered)
      registeredBatches.add(batchNumber)
      registrationsByBatch.set(batchNumber, registered)
    }
    if (registered?.status === 'ACTIVE' && trip >= batchSize) {
      latestCompletedRegistration = registered
    }
  }
  // Legacy imports may not retain a stable creation timestamp. When there is
  // exactly one completed registered Batch and one recovered Trip-001 Batch,
  // the relationship is unambiguous without ever relying on N + 1.
  if (recovered.length === 1 && recovered[0]!.continuationFromBatch === undefined) {
    const completed = registrations.filter(
      (registration) => registration.status === 'ACTIVE' && currentPositionForRegistration(records, registration).trip >= batchSize,
    )
    if (completed.length === 1) {
      return [{ ...recovered[0]!, continuationFromBatch: completed[0]!.batch }]
    }
  }
  return recovered
}

function compactFrontCode(frontId: string): string {
  const parts = frontId.split('/')
  const suffix = parts[parts.length - 1]
  return suffix ? (suffix.startsWith('F') ? suffix : `F${suffix}`) : frontId
}

/**
 * Dashboard Batch cards combine current ACTIVE registrations with accepted
 * production history. This preserves inactive historical Batches without
 * presenting an un-used Fleet Front as operational history.
 */
export function deriveDashboardBatchSummaries(
  records: readonly ProductionRecord[],
  pile: Pile,
  operationalBatches: readonly OperationalBatchState[],
): readonly DashboardBatchSummary[] {
  const activeBatches = new Set(operationalBatches
    .filter((batch) => batch.operationalStatus === 'DIRECT_ACTIVE')
    .map((batch) => batch.batchNumber))
  const frontsByBatch = new Map<number, Set<string>>()
  for (const record of selectEffectiveProductionRecords(records)) {
    if (record.transaction.pileId !== pile.id) continue
    const batch = Number(record.effective.batchPosition.batchNumber)
    const fronts = frontsByBatch.get(batch) ?? new Set<string>()
    fronts.add(compactFrontCode(record.effective.frontId as string))
    frontsByBatch.set(batch, fronts)
  }
  const batchNumbers = new Set([...operationalBatches.map((batch) => batch.batchNumber), ...frontsByBatch.keys()])
  return [...batchNumbers]
    .map((batchNumber) => ({
      batchNumber,
      isActive: activeBatches.has(batchNumber),
      currentTripWithinBatch: operationalBatches.find((batch) => batch.batchNumber === batchNumber)?.currentTripWithinBatch ?? 0,
      frontCodes: [...(frontsByBatch.get(batchNumber) ?? [])].sort(),
    }))
    .sort((left, right) => Number(right.isActive) - Number(left.isActive) || right.currentTripWithinBatch - left.currentTripWithinBatch || left.batchNumber - right.batchNumber)
}

export type ProductionHistorySortKey = 'rec' | 'batch'
export type ProductionHistorySortDirection = 'asc' | 'desc'

/** Sorts display rows without renumbering their pile-wide Production Trip No. */
export function sortProductionHistoryRows(
  rows: readonly ProductionRecordDisplayRow[],
  key: ProductionHistorySortKey,
  direction: ProductionHistorySortDirection,
): readonly ProductionRecordDisplayRow[] {
  const factor = direction === 'asc' ? 1 : -1
  return [...rows].sort((left, right) => {
    if (key === 'batch') {
      const batch = left.batchNumber - right.batchNumber
      if (batch !== 0) return batch * factor
      const trip = left.tripWithinBatch - right.tripWithinBatch
      if (trip !== 0) return trip * factor
    } else {
      const leftTime = left.record.audit.createdAt?.getTime() ?? Number.MIN_SAFE_INTEGER
      const rightTime = right.record.audit.createdAt?.getTime() ?? Number.MIN_SAFE_INTEGER
      const time = leftTime - rightTime
      if (time !== 0) return time * factor
    }
    return (left.tripNo - right.tripNo) * factor
  })
}

export function effectiveProductionRowsForPile(
  records: readonly ProductionRecord[],
  pileId: PileId,
): readonly ProductionRecordDisplayRow[] {
  return selectEffectiveProductionRecords(records)
    .filter((record) => record.transaction.pileId === pileId)
    .map((record, sourceIndex) => ({ record, sourceIndex }))
    // The store index has no ordering contract. Operator-created records
    // have an audit timestamp; legacy timestamp-less rows retain their
    // supplied order as the conservative fallback.
    .sort((left, right) => {
      const leftTime = left.record.audit.createdAt?.getTime()
      const rightTime = right.record.audit.createdAt?.getTime()
      if (leftTime !== undefined && rightTime !== undefined && leftTime !== rightTime) return leftTime - rightTime
      if (leftTime !== undefined && rightTime === undefined) return -1
      if (leftTime === undefined && rightTime !== undefined) return 1
      return left.sourceIndex - right.sourceIndex
    })
    .map(({ record }, index) => ({
      record,
      tripNo: index + 1,
      batchNumber: Number(record.effective.batchPosition.batchNumber),
      tripWithinBatch: Number(record.effective.batchPosition.ritNumber),
    }))
}

/**
 * A registration is a starting seed only. Once effective production exists
 * for this Pile/Batch, its furthest effective Batch position is current.
 */
export function currentPositionForRegistration(
  records: readonly ProductionRecord[],
  registration: PileRegistrationDraft,
): { readonly batch: number; readonly trip: number } {
  const latest = selectEffectiveProductionRecords(records)
    .filter(
      (record) =>
        record.transaction.pileId === registration.pileId &&
        Number(record.effective.batchPosition.batchNumber) === Number(registration.batch),
    )
    .reduce<number | undefined>((highest, record) => {
      const trip = Number(record.effective.batchPosition.ritNumber)
      return highest === undefined || trip > highest ? trip : highest
    }, undefined)

  // A continuation created from Production carries a positive registration
  // value (RitNumber cannot be zero), but has no production position until
  // its first saved record. Treat that state as the logical position zero so
  // its first record is correctly Batch N / Trip 001.
  return {
    batch: Number(registration.batch),
    trip: latest ?? (registration.continuationFromBatch !== undefined ? 0 : Number(registration.rit)),
  }
}

export function hasEffectiveProductionForRegistration(
  records: readonly ProductionRecord[],
  registration: PileRegistrationDraft,
): boolean {
  return selectEffectiveProductionRecords(records).some(
    (record) =>
      record.transaction.pileId === registration.pileId &&
      Number(record.effective.batchPosition.batchNumber) === Number(registration.batch),
  )
}

/**
 * The single Add Production position derivation for a selected
 * Pile+Batch registration. A saved effective position for that exact
 * Batch wins; otherwise the registration Trip is the confirmed seed.
 */
export function nextPositionForRegistration(
  masterData: MasterData,
  pile: Pile,
  records: readonly ProductionRecord[],
  registration: PileRegistrationDraft,
): Result<BatchPosition, DomainError> {
  const config = findOreSamplingConfig(masterData, pile.oreCode)
  if (!config) {
    return err({ code: 'ORE_SAMPLING_CONFIG_NOT_FOUND', message: 'Ore sampling config not found' })
  }
  const current = currentPositionForRegistration(records, registration)
  if (current.trip === 0) return ok(createInitialBatchPosition(registration.batch))
  return nextBatchPosition(
    createBatchPosition(registration.batch, current.trip as typeof registration.rit),
    config.batchSize,
  )
}
