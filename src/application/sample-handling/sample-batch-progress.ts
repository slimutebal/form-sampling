import type { PileRegistrationDraft } from '@/application/pile-registration/pile-registration-draft'
import { selectEffectiveProductionRecords } from '@/application/production/effective-production'
import type { BatchNumber } from '@/domain/batch/batch-number'
import type { OreCode } from '@/domain/common/codes'
import type { PileId } from '@/domain/common/identifiers'
import { findOreSamplingConfig, type MasterData } from '@/domain/master/master-data'
import type { ProductionRecord } from '@/domain/production/production-record'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'

export interface SampleBatchProgress {
  readonly currentTrip: number
  readonly batchCapacity: number
  readonly producedIncrementCount: number
  readonly totalIncrementCount: number
  /** Configured sampling increments represented by one physical bag. */
  readonly incrementsPerBag: number
  readonly totalBagEquivalentCapacity: number
  readonly producedBagEquivalent: number
  readonly deliveredBagEquivalent: number
  readonly remainingBagEquivalent: number
  readonly deliveredIncrementCount: number
  readonly inHouseIncrementCount: number
  /** Maximum whole bags that can still physically be in house. */
  readonly maximumPhysicalInHouseBags: number
  readonly inHouseBagCount: number
}

export interface SampleBatchLimits {
  readonly batchCapacity: number
  readonly samplingInterval: number
  readonly totalIncrementCount: number
  readonly incrementsPerBag: number
  readonly totalBagEquivalentCapacity: number
}

export interface SampleProgressBarSegments {
  readonly greenPercent: number
  readonly redPercent: number
  readonly grayPercent: number
}

/** Config-backed Trip rule for Sample Setup; no material-specific limits. */
export function isTripWithinSampleBatch(
  limits: SampleBatchLimits | undefined,
  trip: number,
): boolean {
  return limits !== undefined && Number.isInteger(trip) && trip >= 1 && trip <= limits.batchCapacity
}

/**
 * Resolves all setup limits from the canonical Ore Sampling Config. The
 * packing/interval interpretation is shared with the existing sample bag
 * derivation; callers must not substitute material-specific React formulas.
 */
export function deriveSampleBatchLimits(
  masterData: MasterData,
  oreCode: OreCode,
): SampleBatchLimits | undefined {
  const config = findOreSamplingConfig(masterData, oreCode)
  if (!config) return undefined

  const interval = Number(config.interval)
  const batchCapacity = Number(config.batchSize)
  const totalIncrementCount = Math.floor(batchCapacity / interval)
  const incrementsPerBag = Number(config.packing) / interval

  return {
    batchCapacity,
    samplingInterval: interval,
    totalIncrementCount,
    incrementsPerBag,
    totalBagEquivalentCapacity: totalIncrementCount / incrementsPerBag,
  }
}

/**
 * Converts manual physical bags into the three bar segments. When the final
 * produced bag is partial, that partial bag occupies one physical container;
 * consequently N physical bags represent N - 1 + partial bag-equivalents.
 * This makes LIM Trip 45 with two bags render 30% green, 15% red, 55% gray.
 */
export function deriveSampleProgressBarSegments(
  progress: SampleBatchProgress,
  physicalInHouse?: number,
): SampleProgressBarSegments {
  const total = progress.totalBagEquivalentCapacity
  if (total <= 0) return { greenPercent: 0, redPercent: 0, grayPercent: 100 }

  const produced = progress.producedBagEquivalent
  const wholePhysicalBags =
    physicalInHouse === undefined ? 0 : Math.max(0, Math.floor(physicalInHouse))
  const partialBagEquivalent = produced - Math.floor(produced)
  const inHouseBagEquivalent =
    wholePhysicalBags === 0
      ? 0
      : Math.min(
          produced,
          wholePhysicalBags - (partialBagEquivalent > 0 ? 1 - partialBagEquivalent : 0),
        )
  const greenBagEquivalent = Math.max(0, produced - inHouseBagEquivalent)
  const grayBagEquivalent = Math.max(0, total - produced)
  const percentage = (value: number) => Math.round((value / total) * 100_000_000) / 1_000_000

  return {
    greenPercent: percentage(greenBagEquivalent),
    redPercent: percentage(inHouseBagEquivalent),
    grayPercent: percentage(grayBagEquivalent),
  }
}

/**
 * Resolves the current operational Trip from the same effective-production
 * projection used by production and pending-sample derivations. Raw haulage
 * snapshots, VOIDED records, REJECT records, and a corrected record's old
 * Batch/Rit are intentionally excluded.
 */
export function deriveConfirmedSampleBatchTrip(
  productionRecords: readonly ProductionRecord[],
  pileId: PileId,
  batchNumber: BatchNumber,
): number | undefined {
  const currentTrips = selectEffectiveProductionRecords(productionRecords)
    .filter(
      (record) =>
        record.transaction.pileId === pileId &&
        Number(record.effective.batchPosition.batchNumber) === Number(batchNumber),
    )
    .map((record) => Number(record.effective.batchPosition.ritNumber))

  return currentTrips.length > 0 ? Math.max(...currentTrips) : undefined
}

/**
 * One UI-facing batch summary for both Sample Setup surfaces. Sampling
 * positions are counted by their actual delivery state; unhandled produced
 * increments remain physically in house. `packing / interval` is the number
 * of configured sampling increments represented by one physical bag.
 */
export function deriveSampleBatchProgress(
  registration: Pick<PileRegistrationDraft, 'pileId' | 'oreCode' | 'batch' | 'rit'>,
  masterData: MasterData,
  samplePositions: readonly SamplePosition[] = [],
  currentTrip = Number(registration.rit),
): SampleBatchProgress | undefined {
  const limits = deriveSampleBatchLimits(masterData, registration.oreCode)
  if (!limits) return undefined

  const {
    batchCapacity,
    samplingInterval,
    totalIncrementCount,
    incrementsPerBag,
    totalBagEquivalentCapacity,
  } = limits
  const boundedTrip = Number.isFinite(currentTrip)
    ? Math.max(0, Math.min(currentTrip, batchCapacity))
    : 0
  const producedIncrementCount = Math.min(
    totalIncrementCount,
    Math.floor(boundedTrip / samplingInterval),
  )
  const deliveredPositions = new Set<number>()

  for (const position of samplePositions) {
    if (
      position.pileId !== registration.pileId ||
      Number(position.batchNumber) !== Number(registration.batch) ||
      position.delivery.status !== 'DELIVERED'
    )
      continue
    for (const rit of position.sampledRitNumbers) {
      if (Number(rit) <= boundedTrip) deliveredPositions.add(Number(rit))
    }
  }

  const deliveredIncrementCount = Math.min(producedIncrementCount, deliveredPositions.size)
  const inHouseIncrementCount = producedIncrementCount - deliveredIncrementCount
  const producedBagEquivalent = producedIncrementCount / incrementsPerBag
  const deliveredBagEquivalent = deliveredIncrementCount / incrementsPerBag
  const remainingBagEquivalent = inHouseIncrementCount / incrementsPerBag
  const inHouseBagCount =
    inHouseIncrementCount === 0 ? 0 : Math.ceil(inHouseIncrementCount / incrementsPerBag)

  return {
    currentTrip: boundedTrip,
    batchCapacity,
    producedIncrementCount,
    totalIncrementCount,
    incrementsPerBag,
    totalBagEquivalentCapacity,
    producedBagEquivalent,
    deliveredBagEquivalent,
    remainingBagEquivalent,
    deliveredIncrementCount,
    inHouseIncrementCount,
    maximumPhysicalInHouseBags: inHouseBagCount,
    inHouseBagCount,
  }
}
