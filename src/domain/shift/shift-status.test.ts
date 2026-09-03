import { describe, expect, it } from 'vitest'
import { SHIFT_STATUSES } from './shift-status'

describe('ShiftStatus', () => {
  it('defines exactly the six stable lifecycle codes from ARCHITECTURE.md', () => {
    expect(SHIFT_STATUSES).toEqual(['NEW', 'INITIALIZED', 'ACTIVE', 'READY_TO_CLOSE', 'FINALIZED', 'ARCHIVED'])
  })
})
