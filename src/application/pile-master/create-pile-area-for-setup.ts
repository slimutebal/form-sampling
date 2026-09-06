import type { Clock } from '@/application/common/clock'
import type { MasterDataCacheStore, PileAreaRemoteWriter } from '@/application/google/google-ports'
import { createPileAreaFromDraft, type NewPileDraft } from '@/application/pile-master/create-pile-area-from-draft'
import type { SectorCode } from '@/domain/common/codes'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import type { PileAreaReference } from '@/domain/master/references'

export interface CreatePileAreaForSetupDeps {
  readonly remoteWriter: PileAreaRemoteWriter
  readonly clock: Clock
  /** Injected rather than reading `isOnline()` directly, so this pure use case stays testable without a real `navigator`. */
  readonly isOnline: () => boolean
  /**
   * Refreshing the global master-data cache here is best-effort, exactly
   * like `activateNewPile`'s post-activation cache refresh — a future
   * shift's convenience, never a requirement for this call to succeed.
   * Omit it entirely where no cache store is available yet.
   */
  readonly cacheStore?: MasterDataCacheStore
}

export interface CreatePileAreaForSetupParams {
  readonly draft: NewPileDraft
  readonly sectorCode: SectorCode
  readonly masterData: MasterData
}

export interface CreatedSetupPileArea {
  readonly pileArea: PileAreaReference
  /** The caller's MasterData, merged with the newly created `pileArea` — already re-validated via `createMasterData`. */
  readonly masterData: MasterData
}

/**
 * New Pile Master creation for the pre-workspace Fleet Setup step
 * (post-inspection correction §2). Fleet Setup always runs strictly
 * before `initializeShiftWorkspace`, so there is no `ShiftWorkspace` row
 * yet — `activateNewMasterPile`/`activateNewPile` (built around an
 * already-initialized shift) cannot be reused here without a workspace to
 * write into. This use case performs the write and re-validation that
 * *are* possible before a workspace exists — remote write, then a merged,
 * re-validated MasterData snapshot the caller (StartPage/FleetSetupPage)
 * keeps in memory until `initializeShiftWorkspace` runs — and stops
 * short of any workspace-specific write. The final initialized workspace
 * MasterData snapshot is expected to already contain this new pile,
 * because the caller passes this merged MasterData into
 * `initializeShiftWorkspace`, not the original one.
 *
 * Same ordering guarantee as `activateNewPile`: validate the draft →
 * require connectivity (a brand-new Pile_Area mutates the SHARED master)
 * → write to the shared Google master → only on remote success, merge and
 * re-validate the in-memory MasterData → best-effort refresh the global
 * cache. A remote failure or being offline leaves the caller's MasterData
 * completely untouched.
 */
export async function createPileAreaForSetup(
  params: CreatePileAreaForSetupParams,
  deps: CreatePileAreaForSetupDeps,
): Promise<Result<CreatedSetupPileArea, DomainError>> {
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

  const mergedMasterData = createMasterData({
    ...params.masterData,
    pileAreas: [...params.masterData.pileAreas, pileArea],
  })
  if (!mergedMasterData.ok) return mergedMasterData

  if (deps.cacheStore) {
    await deps.cacheStore.replaceMasterDataCache(mergedMasterData.value, deps.clock.now())
  }

  return ok({ pileArea, masterData: mergedMasterData.value })
}
