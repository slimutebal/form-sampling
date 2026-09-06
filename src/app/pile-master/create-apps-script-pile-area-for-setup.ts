import { localOperationalStore } from '@/app/local-operational-store'
import { readGoogleRuntimeConfig } from '@/app/google/google-runtime-config'
import { systemClock, type Clock } from '@/application/common/clock'
import type { MasterDataCacheStore, PileAreaRemoteWriter } from '@/application/google/google-ports'
import {
  createPileAreaForSetup,
  type CreatedSetupPileArea,
  type CreatePileAreaForSetupParams,
} from '@/application/pile-master/create-pile-area-for-setup'
import type { DomainError, Result } from '@/domain/common/result'
import { isOnline } from '@/infrastructure/device/connectivity'
import { AppsScriptMasterDataRemoteReader } from '@/integrations/google/apps-script-master-data-remote-reader'
import { AppsScriptPileAreaWriter } from '@/integrations/google/apps-script-pile-area-writer'

export interface CreateAppsScriptPileAreaForSetupOverrides {
  /** Test-only escape hatch: skip runtime configuration/HTTP and supply the remote writer directly. */
  readonly remoteWriter: PileAreaRemoteWriter
  readonly clock: Clock
  readonly isOnline: () => boolean
  readonly cacheStore: MasterDataCacheStore
}

/**
 * Composition boundary for New Pile Master creation from the pre-workspace
 * Fleet Setup step (post-inspection correction §2): runtime config →
 * `AppsScriptMasterDataRemoteReader` (write verification) +
 * `AppsScriptPileAreaWriter` → `createPileAreaForSetup`. Distinct from
 * `activateAppsScriptPile` (`@/app/pile-master/activate-apps-script-pile`)
 * which requires an already-initialized `ShiftWorkspace`; this one only
 * ever produces an updated in-memory `MasterData`, never a workspace
 * write, because Fleet Setup runs before `initializeShiftWorkspace`.
 *
 * `overrides` exists only for tests; production callers pass only `params`.
 */
export async function createAppsScriptPileAreaForSetup(
  params: CreatePileAreaForSetupParams,
  overrides?: Partial<CreateAppsScriptPileAreaForSetupOverrides>,
): Promise<Result<CreatedSetupPileArea, DomainError>> {
  const clock = overrides?.clock ?? systemClock
  const isOnlineFn = overrides?.isOnline ?? isOnline
  const cacheStore = overrides?.cacheStore ?? localOperationalStore

  if (overrides?.remoteWriter) {
    return createPileAreaForSetup(params, { clock, isOnline: isOnlineFn, cacheStore, remoteWriter: overrides.remoteWriter })
  }

  const configResult = readGoogleRuntimeConfig()
  if (!configResult.ok) {
    return configResult
  }

  const masterDataReader = new AppsScriptMasterDataRemoteReader(configResult.value.appsScriptUrl)
  const remoteWriter = new AppsScriptPileAreaWriter(configResult.value.appsScriptUrl, masterDataReader)
  return createPileAreaForSetup(params, { clock, isOnline: isOnlineFn, cacheStore, remoteWriter })
}
