import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pwaUpdateStore } from './pwa-update-store'

describe('pwaUpdateStore', () => {
  beforeEach(() => {
    pwaUpdateStore.setUpdater(undefined)
    pwaUpdateStore.setNeedRefresh(false)
    pwaUpdateStore.setOfflineReady(false)
  })

  it('starts with no update/offline-ready state', () => {
    expect(pwaUpdateStore.getSnapshot()).toEqual({ needRefresh: false, offlineReady: false, dismissed: false })
  })

  it('setNeedRefresh(true) sets needRefresh and notifies subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = pwaUpdateStore.subscribe(listener)

    pwaUpdateStore.setNeedRefresh(true)

    expect(pwaUpdateStore.getSnapshot().needRefresh).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('setOfflineReady(true) sets offlineReady', () => {
    pwaUpdateStore.setOfflineReady(true)
    expect(pwaUpdateStore.getSnapshot().offlineReady).toBe(true)
  })

  it('never calls the updater automatically when needRefresh becomes true', async () => {
    const updater = vi.fn().mockResolvedValue(undefined)
    pwaUpdateStore.setUpdater(updater)

    pwaUpdateStore.setNeedRefresh(true)
    await Promise.resolve()

    expect(updater).not.toHaveBeenCalled()
  })

  it('applyUpdate() calls the registered updater exactly once with reloadPage=true', async () => {
    const updater = vi.fn().mockResolvedValue(undefined)
    pwaUpdateStore.setUpdater(updater)

    await pwaUpdateStore.applyUpdate()

    expect(updater).toHaveBeenCalledTimes(1)
    expect(updater).toHaveBeenCalledWith(true)
  })

  it('applyUpdate() is a no-op when no updater was ever registered', async () => {
    await expect(pwaUpdateStore.applyUpdate()).resolves.toBeUndefined()
  })

  it('dismissUpdate() never calls the updater', () => {
    const updater = vi.fn()
    pwaUpdateStore.setUpdater(updater)
    pwaUpdateStore.setNeedRefresh(true)

    pwaUpdateStore.dismissUpdate()

    expect(updater).not.toHaveBeenCalled()
    expect(pwaUpdateStore.getSnapshot()).toMatchObject({ needRefresh: true, dismissed: true })
  })

  it('a fresh needRefresh signal clears a prior dismissal', () => {
    pwaUpdateStore.setNeedRefresh(true)
    pwaUpdateStore.dismissUpdate()
    expect(pwaUpdateStore.getSnapshot().dismissed).toBe(true)

    pwaUpdateStore.setNeedRefresh(false)
    pwaUpdateStore.setNeedRefresh(true)

    expect(pwaUpdateStore.getSnapshot().dismissed).toBe(false)
  })
})
