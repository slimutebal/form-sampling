import type { Clock } from '@/application/common/clock'
import type { PileAreaRemoteWriter } from '@/application/google/google-ports'
import { createPileAreaFromDraft, type NewPileDraft } from '@/application/pile-master/create-pile-area-from-draft'
import type { SectorCode } from '@/domain/common/codes'
import type { ShiftId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import type { PileAreaReference } from '@/domain/master/references'
import { createPile, type Pile } from '@/domain/pile/pile'

/** The smallest write shape this use case needs from `LocalOperationalStore`. */
export interface ActivateNewPileStore {
  activateNewMasterPile(
    shiftId: ShiftId,
    pile: Pile,
    pileArea: PileAreaReference,
  ): Promise<Result<void, DomainError>>
  replaceMasterDataCache(masterData: MasterData, fetchedAt: Date): Promise<Result<void, DomainError>>
}

export interface ActivateNewPileDeps {
  readonly store: ActivateNewPileStore
  readonly remoteWriter: PileAreaRemoteWriter
  readonly clock: Clock
  /** Injected rather than reading `isOnline()` directly, so this pure use case stays testable without a real `navigator`. */
  readonly isOnline: () => boolean
}

export interface ActivateNewPileParams {
  readonly draft: NewPileDraft
  readonly shiftId: ShiftId
  readonly sectorCode: SectorCode
  readonly masterData: MasterData
}

export interface ActivatedPile {
  readonly pile: Pile
  readonly pileArea: PileAreaReference
}

/**
 * Orchestrates New Pile Master creation (Phase 18 §6), in this exact
 * order: validate the draft → require connectivity (a brand-new Pile_Area
 * mutates the SHARED master, so this is online-only) → write to the
 * shared Google master → only on remote success, activate the Pile in
 * this shift's own workspace snapshot → best-effort refresh the global
 * master-data cache so a future shift also sees it. A remote failure or
 * being offline means NOTHING local is ever written — the local
 * activation is never attempted before the remote write succeeds.
 */
export async function activateNewPile(
  params: ActivateNewPileParams,
  deps: ActivateNewPileDeps,
): Promise<Result<ActivatedPile, DomainError>> {
  const pileAreaResult = createPileAreaFromDraft(params.draft, params.sectorCode, params.masterData)
  if (!pileAreaResult.ok) return pileAreaResult
  const pileArea = pileAreaResult.value

  if (!deps.isOnline()) {
    return err({
      code: 'PILE_MASTER_CREATION_REQUIRES_CONNECTION',
      message: 'Creating a new master Pile requires an internet connection',
    })
  }

  const remoteResult = await deps.remoteWriter.addPileArea(pileArea)
  if (!remoteResult.ok) return remoteResult

  const pile = createPile(pileArea.pileId, pileArea.oreCode)
  const localResult = await deps.store.activateNewMasterPile(params.shiftId, pile, pileArea)
  if (!localResult.ok) return localResult

  // Best-effort: the global cache is a convenience for a FUTURE shift's
  // setup, distinct from this shift's own already-activated snapshot
  // above — a failure here does not undo the activation that already
  // succeeded.
  const mergedMasterData = createMasterData({
    ...params.masterData,
    pileAreas: [...params.masterData.pileAreas, pileArea],
  })
  if (mergedMasterData.ok) {
    await deps.store.replaceMasterDataCache(mergedMasterData.value, deps.clock.now())
  }

  return ok({ pile, pileArea })
}
