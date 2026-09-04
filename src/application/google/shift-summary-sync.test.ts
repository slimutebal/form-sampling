import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/common/clock'
import { err, ok, type DomainError, type Result } from '@/domain/common/result'
import type { ShiftId } from '@/domain/common/identifiers'
import type { ShiftSummaryOutboxStore, ShiftSummaryRemoteWriter, ShiftSummarySyncRecord } from './google-ports'
import type { ShiftSummary } from './shift-summary'
import { queueShiftSummary, retryPendingShiftSummaries, syncShiftSummary } from './shift-summary-sync'

function summary(shiftId: string, overrides: Partial<ShiftSummary> = {}): ShiftSummary {
  return {
    shiftId,
    date: '2026-09-04',
    shiftCode: 'D',
    sectorCode: 'S1',
    samplingHouseCode: 'HOUSE-1',
    ritTotal: 3,
    batchTotal: 1,
    incrementTotal: 3,
    wrongTruckTotal: 1,
    ...overrides,
  } as ShiftSummary
}

const clockValue = new Date('2026-09-04T10:00:00.000Z')
const clock: Clock = { now: () => clockValue }

class FakeShiftSummaryOutboxStore implements ShiftSummaryOutboxStore {
  private readonly recordsByShiftId = new Map<string, ShiftSummarySyncRecord>()
  upsertCallCount = 0

  async upsertShiftSummarySyncRecord(record: ShiftSummarySyncRecord): Promise<Result<void, DomainError>> {
    this.upsertCallCount++
    this.recordsByShiftId.set(record.shiftId as string, record)
    return ok(undefined)
  }

  async getShiftSummarySyncRecord(shiftId: ShiftId): Promise<Result<ShiftSummarySyncRecord | undefined, DomainError>> {
    return ok(this.recordsByShiftId.get(shiftId as string))
  }

  async listPendingShiftSummarySyncRecords(): Promise<Result<readonly ShiftSummarySyncRecord[], DomainError>> {
    return ok([...this.recordsByShiftId.values()].filter((record) => record.status === 'PENDING' || record.status === 'FAILED'))
  }
}

function fakeWriter(result: Result<void, DomainError> | ((summary: ShiftSummary) => Result<void, DomainError>)): ShiftSummaryRemoteWriter {
  return {
    upsertShiftSummary: async (summaryValue) => (typeof result === 'function' ? result(summaryValue) : result),
  }
}

describe('queueShiftSummary', () => {
  it('persists a PENDING record locally with attemptCount 0, without any network dependency', async () => {
    const outbox = new FakeShiftSummaryOutboxStore()
    const result = await queueShiftSummary({ outbox, clock }, summary('SHIFT-1'))
    expect(result.ok).toBe(true)

    const record = await outbox.getShiftSummarySyncRecord('SHIFT-1' as ShiftId)
    expect(record.ok).toBe(true)
    if (!record.ok) return
    expect(record.value).toMatchObject({ shiftId: 'SHIFT-1', status: 'PENDING', attemptCount: 0 })
  })

  it('replaces the queued payload for the same Shift_ID deterministically, without creating a duplicate item', async () => {
    const outbox = new FakeShiftSummaryOutboxStore()
    await queueShiftSummary({ outbox, clock }, summary('SHIFT-1', { ritTotal: 3 }))
    await queueShiftSummary({ outbox, clock }, summary('SHIFT-1', { ritTotal: 9 }))

    const pending = await outbox.listPendingShiftSummarySyncRecords()
    expect(pending.ok).toBe(true)
    if (!pending.ok) return
    expect(pending.value).toHaveLength(1)
    expect(pending.value[0]?.summary.ritTotal).toBe(9)
  })
})

describe('syncShiftSummary', () => {
  it('marks the record SYNCED on a successful remote upsert', async () => {
    const outbox = new FakeShiftSummaryOutboxStore()
    await queueShiftSummary({ outbox, clock }, summary('SHIFT-1'))

    const result = await syncShiftSummary({ outbox, writer: fakeWriter(ok(undefined)), clock }, 'SHIFT-1' as ShiftId)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe('SYNCED')
    expect(result.value.attemptCount).toBe(1)
    expect(result.value.lastErrorCode).toBeUndefined()
  })

  it('retains the exact persisted payload and marks FAILED when the remote upsert fails', async () => {
    const outbox = new FakeShiftSummaryOutboxStore()
    await queueShiftSummary({ outbox, clock }, summary('SHIFT-1', { ritTotal: 42 }))

    const writer = fakeWriter(err({ code: 'GOOGLE_REQUEST_FAILED', message: 'network down' }))
    const result = await syncShiftSummary({ outbox, writer, clock }, 'SHIFT-1' as ShiftId)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('GOOGLE_REQUEST_FAILED')

    const record = await outbox.getShiftSummarySyncRecord('SHIFT-1' as ShiftId)
    expect(record.ok).toBe(true)
    if (!record.ok) return
    expect(record.value?.status).toBe('FAILED')
    expect(record.value?.lastErrorCode).toBe('GOOGLE_REQUEST_FAILED')
    expect(record.value?.summary.ritTotal).toBe(42)
    expect(record.value?.attemptCount).toBe(1)
  })

  it('increments attemptCount deterministically across repeated sync attempts', async () => {
    const outbox = new FakeShiftSummaryOutboxStore()
    await queueShiftSummary({ outbox, clock }, summary('SHIFT-1'))
    const writer = fakeWriter(err({ code: 'GOOGLE_REQUEST_FAILED', message: 'network down' }))

    await syncShiftSummary({ outbox, writer, clock }, 'SHIFT-1' as ShiftId)
    await syncShiftSummary({ outbox, writer, clock }, 'SHIFT-1' as ShiftId)
    const third = await syncShiftSummary({ outbox, writer, clock }, 'SHIFT-1' as ShiftId)

    expect(third.ok).toBe(false)
    if (third.ok) return
    const record = await outbox.getShiftSummarySyncRecord('SHIFT-1' as ShiftId)
    expect(record.ok).toBe(true)
    if (!record.ok) return
    expect(record.value?.attemptCount).toBe(3)
  })

  it('fails with a stable code when no record was ever queued for the ShiftId', async () => {
    const outbox = new FakeShiftSummaryOutboxStore()
    const result = await syncShiftSummary({ outbox, writer: fakeWriter(ok(undefined)), clock }, 'SHIFT-UNKNOWN' as ShiftId)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SHIFT_SUMMARY_SYNC_RECORD_NOT_FOUND')
  })
})

describe('retryPendingShiftSummaries', () => {
  it('retries every FAILED/PENDING record and turns a successful one into SYNCED', async () => {
    const outbox = new FakeShiftSummaryOutboxStore()
    await queueShiftSummary({ outbox, clock }, summary('SHIFT-1'))
    await syncShiftSummary({ outbox, writer: fakeWriter(err({ code: 'GOOGLE_REQUEST_FAILED', message: 'down' })), clock }, 'SHIFT-1' as ShiftId)

    const results = await retryPendingShiftSummaries({ outbox, writer: fakeWriter(ok(undefined)), clock })
    expect(results.ok).toBe(true)
    if (!results.ok) return
    expect(results.value).toHaveLength(1)
    expect(results.value[0]?.status).toBe('SYNCED')

    const record = await outbox.getShiftSummarySyncRecord('SHIFT-1' as ShiftId)
    expect(record.ok).toBe(true)
    if (!record.ok) return
    expect(record.value?.status).toBe('SYNCED')
  })

  it('attempts every eligible record even when one of them fails', async () => {
    const outbox = new FakeShiftSummaryOutboxStore()
    await queueShiftSummary({ outbox, clock }, summary('SHIFT-1'))
    await queueShiftSummary({ outbox, clock }, summary('SHIFT-2'))

    const writer = fakeWriter((value) =>
      value.shiftId === 'SHIFT-1' ? err({ code: 'GOOGLE_REQUEST_FAILED', message: 'down' }) : ok(undefined),
    )
    const results = await retryPendingShiftSummaries({ outbox, writer, clock })
    expect(results.ok).toBe(true)
    if (!results.ok) return

    const shift1 = await outbox.getShiftSummarySyncRecord('SHIFT-1' as ShiftId)
    const shift2 = await outbox.getShiftSummarySyncRecord('SHIFT-2' as ShiftId)
    expect(shift1.ok && shift1.value?.status).toBe('FAILED')
    expect(shift2.ok && shift2.value?.status).toBe('SYNCED')
  })

  it('does not retry an already-SYNCED record', async () => {
    const outbox = new FakeShiftSummaryOutboxStore()
    await queueShiftSummary({ outbox, clock }, summary('SHIFT-1'))
    await syncShiftSummary({ outbox, writer: fakeWriter(ok(undefined)), clock }, 'SHIFT-1' as ShiftId)

    const writer = fakeWriter(err({ code: 'GOOGLE_REQUEST_FAILED', message: 'should not be called' }))
    const results = await retryPendingShiftSummaries({ outbox, writer, clock })
    expect(results.ok).toBe(true)
    if (!results.ok) return
    expect(results.value).toHaveLength(0)
  })
})
