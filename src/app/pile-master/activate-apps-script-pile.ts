import { localOperationalStore } from '@/app/local-operational-store'
import { readGoogleRuntimeConfig } from '@/app/google/google-runtime-config'
import { systemClock, type Clock } from '@/application/common/clock'
import type { PileAreaRemoteWriter } from '@/application/google/google-ports'
import {
  activateNewPile,
  type ActivatedPile,
  type ActivateNewPileParams,
  type ActivateNewPileStore,
} from '@/application/pile-master/activate-new-pile'
import type { DomainError, Result } from '@/domain/common/result'
import { isOnline } from '@/infrastructure/device/connectivity'
import { AppsScriptMasterDataRemoteReader } from '@/integrations/google/apps-script-master-data-remote-reader'
import { AppsScriptPileAreaWriter } from '@/integrations/google/apps-script-pile-area-writer'

export interface ActivateAppsScriptPileOverrides {
  /** Test-only escape hatch: skip runtime configuration/HTTP and supply the remote writer directly. */
  readonly remoteWriter: PileAreaRemoteWriter
  readonly store: ActivateNewPileStore
  readonly clock: Clock
  readonly isOnline: () => boolean
}

/**
 * Composition boundary for New Pile Master creation (Phase 18 §6): runtime
 * config → `AppsScriptPileAreaWriter` → existing `activateNewPile` use
 * case, writing into the app-wide `localOperationalStore`. No validation,
 * connectivity-gating, or write-ordering logic is duplicated here.
 *
 * `overrides` exists only for tests; production callers pass only `params`.
 */
export async function activateAppsScriptPile(
  params: ActivateNewPileParams,
  overrides?: Partial<ActivateAppsScriptPileOverrides>,
): Promise<Result<ActivatedPile, DomainError>> {
  const store = overrides?.store ?? localOperationalStore
  const clock = overrides?.clock ?? systemClock
  const isOnlineFn = overrides?.isOnline ?? isOnline

  if (overrides?.remoteWriter) {
    return activateNewPile(params, { store, clock, isOnline: isOnlineFn, remoteWriter: overrides.remoteWriter })
  }

  const configResult = readGoogleRuntimeConfig()
  if (!configResult.ok) {
    return configResult
  }

  const masterDataReader = new AppsScriptMasterDataRemoteReader(configResult.value.appsScriptUrl)
  const remoteWriter = new AppsScriptPileAreaWriter(configResult.value.appsScriptUrl, masterDataReader)
  return activateNewPile(params, { store, clock, isOnline: isOnlineFn, remoteWriter })
}
