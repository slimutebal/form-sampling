import { describe, expect, it } from 'vitest'
import { PENDING_STATUSES } from './pending-status'

describe('PendingStatus', () => {
  it('defines exactly CONTINUE and HOLD', () => {
    expect(PENDING_STATUSES).toEqual(['CONTINUE', 'HOLD'])
  })

  it('does not define COMPLETE, since its meaning is NEEDS_CONFIRMATION', () => {
    expect(PENDING_STATUSES as readonly string[]).not.toContain('COMPLETE')
  })
})
