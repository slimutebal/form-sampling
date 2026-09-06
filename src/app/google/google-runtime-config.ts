import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'

/**
 * Browser-visible Apps Script Web App configuration. The endpoint is never
 * hard-coded and no Google credential is read or stored by the PWA.
 */
export interface GoogleRuntimeConfig {
  readonly appsScriptUrl: string
}

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

/** Stable failure when the endpoint is missing/blank. */
export function readGoogleRuntimeConfig(): Result<GoogleRuntimeConfig, DomainError> {
  const appsScriptUrl = nonBlank(import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL)
  if (!appsScriptUrl) {
    return err({
      code: 'GOOGLE_CONFIG_UNAVAILABLE',
      message: 'Google Apps Script Web App URL is not configured for this build',
    })
  }
  return ok({ appsScriptUrl })
}
