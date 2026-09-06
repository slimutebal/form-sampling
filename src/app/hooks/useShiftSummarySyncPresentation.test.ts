import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ShiftSummarySyncStatusReader, SyncStatusRecord } from '@/application/pwa/sync-presentation'
import { useShiftSummarySyncPresentation } from './useShiftSummarySyncPresentation'

function fakeReader(
  outcome: { ok: true; value: readonly SyncStatusRecord[] } | { ok: false },
): ShiftSummarySyncStatusReader {
  return {
    listShiftSummarySyncRecords: async () =>
      outcome.ok ? { ok: true, value: outcome.value } : { ok: false, error: { code: 'LOCAL_DATABASE_OPERATION_FAILED', message: 'boom' } },
  }
}

describe('useShiftSummarySyncPresentation', () => {
  it('defaults to ALL_SYNCED before the read resolves', async () => {
    const reader = fakeReader({ ok: true, value: [] })
    const { result } = renderHook(() => useShiftSummarySyncPresentation(reader))
    expect(result.current.status).toBe('ALL_SYNCED')
    await act(async () => {
      await Promise.resolve()
    })
  })

  it('resolves to SYNC_FAILED when a FAILED row exists', async () => {
    const reader = fakeReader({ ok: true, value: [{ status: 'FAILED' }, { status: 'PENDING' }] })
    const { result } = renderHook(() => useShiftSummarySyncPresentation(reader))
    await waitFor(() => expect(result.current.status).toBe('SYNC_FAILED'))
    expect(result.current.failedCount).toBe(1)
    expect(result.current.pendingCount).toBe(1)
  })

  it('falls back to ALL_SYNCED (never a raw error) when the read fails', async () => {
    const reader = fakeReader({ ok: false })
    const { result } = renderHook(() => useShiftSummarySyncPresentation(reader))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current.status).toBe('ALL_SYNCED')
  })
})
