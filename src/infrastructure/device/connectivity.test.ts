import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOnline, subscribeToConnectivity } from './connectivity'

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

describe('isOnline', () => {
  afterEach(() => {
    setNavigatorOnLine(true)
  })

  it('reflects navigator.onLine when true', () => {
    setNavigatorOnLine(true)
    expect(isOnline()).toBe(true)
  })

  it('reflects navigator.onLine when false', () => {
    setNavigatorOnLine(false)
    expect(isOnline()).toBe(false)
  })
})

describe('subscribeToConnectivity', () => {
  afterEach(() => {
    setNavigatorOnLine(true)
  })

  it('notifies the listener with true on a window online event', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToConnectivity(listener)
    window.dispatchEvent(new Event('online'))
    expect(listener).toHaveBeenCalledWith(true)
    unsubscribe()
  })

  it('notifies the listener with false on a window offline event', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToConnectivity(listener)
    window.dispatchEvent(new Event('offline'))
    expect(listener).toHaveBeenCalledWith(false)
    unsubscribe()
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToConnectivity(listener)
    unsubscribe()
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('offline'))
    expect(listener).not.toHaveBeenCalled()
  })
})
