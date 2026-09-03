import { describe, expect, it } from 'vitest'
import type { ShiftWorkspaceReader } from '@/application/ports/shift-workspace-reader'
import { localOperationalStore } from './local-operational-store'

describe('localOperationalStore composition root', () => {
  it('structurally satisfies the application ShiftWorkspaceReader port with no adapter', async () => {
    // Compile-time check: this assignment fails to typecheck the moment
    // LocalOperationalStore stops structurally satisfying the port (e.g.
    // if LocalShiftWorkspace/LocalDatabaseError narrow below what the
    // port requires) — proving no adapter object is needed today.
    const reader: ShiftWorkspaceReader = localOperationalStore
    const result = await reader.loadCurrentShiftWorkspace()
    expect(result.ok).toBe(true)
  })
})
