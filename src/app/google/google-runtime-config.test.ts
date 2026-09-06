import { afterEach, describe, expect, it, vi } from 'vitest'
import { readGoogleRuntimeConfig } from './google-runtime-config'

describe('readGoogleRuntimeConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the configured Apps Script endpoint', () => {
    vi.stubEnv('VITE_GOOGLE_APPS_SCRIPT_URL', 'https://script.google.com/macros/s/example/exec')

    const result = readGoogleRuntimeConfig()

    expect(result).toEqual({ ok: true, value: { appsScriptUrl: 'https://script.google.com/macros/s/example/exec' } })
  })

  it('returns a stable GOOGLE_CONFIG_UNAVAILABLE error when the endpoint is missing', () => {
    vi.stubEnv('VITE_GOOGLE_APPS_SCRIPT_URL', '')

    const result = readGoogleRuntimeConfig()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_CONFIG_UNAVAILABLE')
  })

  it('returns a stable GOOGLE_CONFIG_UNAVAILABLE error when the endpoint is blank', () => {
    vi.stubEnv('VITE_GOOGLE_APPS_SCRIPT_URL', '   ')

    const result = readGoogleRuntimeConfig()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_CONFIG_UNAVAILABLE')
  })

  it('never falls back to a hardcoded production endpoint', () => {
    vi.stubEnv('VITE_GOOGLE_APPS_SCRIPT_URL', undefined)

    const result = readGoogleRuntimeConfig()

    expect(result.ok).toBe(false)
  })
})
