import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { pwaUpdateStore } from '@/app/startup/pwa-update-store'
import { usePwaUpdateState } from './usePwaUpdateState'

describe('usePwaUpdateState', () => {
  beforeEach(() => {
    pwaUpdateStore.setUpdater(undefined)
    pwaUpdateStore.setNeedRefresh(false)
    pwaUpdateStore.setOfflineReady(false)
  })

  it('reflects the current store snapshot', () => {
    const { result } = renderHook(() => usePwaUpdateState())
    expect(result.current).toEqual({ needRefresh: false, offlineReady: false, dismissed: false })
  })

  it('re-renders when the store notifies needRefresh', () => {
    const { result } = renderHook(() => usePwaUpdateState())

    act(() => {
      pwaUpdateStore.setNeedRefresh(true)
    })

    expect(result.current.needRefresh).toBe(true)
  })
})
