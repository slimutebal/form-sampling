import { describe, expect, it } from 'vitest'
import { deriveSyncPresentation, type SyncStatusRecord } from './sync-presentation'

function records(...statuses: SyncStatusRecord['status'][]): SyncStatusRecord[] {
  return statuses.map((status) => ({ status }))
}

describe('deriveSyncPresentation', () => {
  it('reports ALL_SYNCED when there are no outbox rows', () => {
    expect(deriveSyncPresentation([])).toEqual({
      status: 'ALL_SYNCED',
      pendingCount: 0,
      failedCount: 0,
      syncingCount: 0,
    })
  })

  it('reports ALL_SYNCED when every row is SYNCED', () => {
    expect(deriveSyncPresentation(records('SYNCED', 'SYNCED')).status).toBe('ALL_SYNCED')
  })

  it('reports SYNC_PENDING when a PENDING row exists and nothing has failed', () => {
    const result = deriveSyncPresentation(records('SYNCED', 'PENDING'))
    expect(result.status).toBe('SYNC_PENDING')
    expect(result.pendingCount).toBe(1)
  })

  it('reports SYNCING when a SYNCING row exists and nothing is pending/failed', () => {
    const result = deriveSyncPresentation(records('SYNCED', 'SYNCING'))
    expect(result.status).toBe('SYNCING')
    expect(result.syncingCount).toBe(1)
  })

  it('reports SYNC_FAILED when a FAILED row exists', () => {
    const result = deriveSyncPresentation(records('SYNCED', 'FAILED'))
    expect(result.status).toBe('SYNC_FAILED')
    expect(result.failedCount).toBe(1)
  })

  it('gives FAILED the highest visual priority over PENDING and SYNCING', () => {
    const result = deriveSyncPresentation(records('PENDING', 'SYNCING', 'FAILED', 'SYNCED'))
    expect(result.status).toBe('SYNC_FAILED')
    expect(result).toEqual({ status: 'SYNC_FAILED', pendingCount: 1, failedCount: 1, syncingCount: 1 })
  })

  it('counts multiple rows of the same status deterministically', () => {
    const result = deriveSyncPresentation(records('FAILED', 'FAILED', 'FAILED'))
    expect(result.failedCount).toBe(3)
  })
})
