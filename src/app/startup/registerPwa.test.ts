import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pwaUpdateStore } from './pwa-update-store'

const registerSWMock = vi.fn()

vi.mock('virtual:pwa-register', () => ({
  registerSW: (...args: unknown[]) => registerSWMock(...args),
}))

const { registerPwa } = await import('./registerPwa')

function setProd(value: boolean) {
  vi.stubEnv('PROD', value)
}

describe('registerPwa', () => {
  beforeEach(() => {
    registerSWMock.mockReset()
    pwaUpdateStore.setUpdater(undefined)
    pwaUpdateStore.setNeedRefresh(false)
    pwaUpdateStore.setOfflineReady(false)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not register a service worker outside production', () => {
    setProd(false)

    registerPwa()

    expect(registerSWMock).not.toHaveBeenCalled()
  })

  it('registers immediately and wires onNeedRefresh into the update store in production', () => {
    setProd(true)
    const updater = vi.fn().mockResolvedValue(undefined)
    registerSWMock.mockImplementation((options: { onNeedRefresh?: () => void; immediate?: boolean }) => {
      expect(options.immediate).toBe(true)
      options.onNeedRefresh?.()
      return updater
    })

    registerPwa()

    expect(pwaUpdateStore.getSnapshot().needRefresh).toBe(true)
    expect(updater).not.toHaveBeenCalled()
  })

  it('wires onOfflineReady into the update store in production', () => {
    setProd(true)
    registerSWMock.mockImplementation((options: { onOfflineReady?: () => void }) => {
      options.onOfflineReady?.()
      return vi.fn()
    })

    registerPwa()

    expect(pwaUpdateStore.getSnapshot().offlineReady).toBe(true)
  })

  it('applying the update calls the registered updater exactly once, only on explicit action', async () => {
    setProd(true)
    const updater = vi.fn().mockResolvedValue(undefined)
    registerSWMock.mockImplementation(() => updater)

    registerPwa()
    expect(updater).not.toHaveBeenCalled()

    await pwaUpdateStore.applyUpdate()

    expect(updater).toHaveBeenCalledTimes(1)
    expect(updater).toHaveBeenCalledWith(true)
  })
})
