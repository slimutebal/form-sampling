import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ShiftWorkspaceReader, CurrentShiftWorkspace } from '@/application/ports/shift-workspace-reader'
import type { Shift } from '@/domain/shift/shift'
import { useActiveShiftPresence } from './useActiveShiftPresence'

function fakeReader(
  outcome: { ok: true; value: CurrentShiftWorkspace | undefined } | { ok: false },
): ShiftWorkspaceReader {
  return {
    loadCurrentShiftWorkspace: async () =>
      outcome.ok ? { ok: true, value: outcome.value } : { ok: false, error: { code: 'LOCAL_DATABASE_OPERATION_FAILED' } },
  }
}

describe('useActiveShiftPresence', () => {
  it('defaults to true (cautious) before the read resolves', async () => {
    const reader = fakeReader({ ok: true, value: undefined })
    const { result } = renderHook(() => useActiveShiftPresence(reader))
    expect(result.current).toBe(true)
    await act(async () => {
      await Promise.resolve()
    })
  })

  it('resolves to false once the store reports no current shift', async () => {
    const reader = fakeReader({ ok: true, value: undefined })
    const { result } = renderHook(() => useActiveShiftPresence(reader))
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('resolves to true once the store reports a current shift', async () => {
    const reader = fakeReader({ ok: true, value: { shift: { id: 'SHIFT-1' } as unknown as Shift } })
    const { result } = renderHook(() => useActiveShiftPresence(reader))
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('stays true (cautious) when the read fails', async () => {
    const reader = fakeReader({ ok: false })
    const { result } = renderHook(() => useActiveShiftPresence(reader))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current).toBe(true)
  })
})
