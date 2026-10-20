import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { parseProductionCorrectionId } from '@/domain/common/identifiers'
import { parseFreshPileStartPosition } from '@/domain/pile/fresh-pile-start-position'
import { buildFixtureFleetSetup, buildFixtureHaulageTransaction, buildFixtureMasterData, buildFixtureProductionRecord, buildFixtureSapPile, buildFixtureShift, fixtureEmployeeId, fixturePileId, fixtureShiftId } from './local-db-test-fixtures'
import { LocalOperationalStore, type LocalOperationalStoreOptions } from './local-operational-store'
import { parseWorkspaceBackup, stringifyWorkspaceBackup } from './workspace-backup'

function value<T, E>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E }): T {
  if (!result.ok) throw new Error('Unexpected failed store result')
  return result.value
}

const names: string[] = []
function databaseName(): string {
  const name = `workspace-backup-${Date.now()}-${Math.random().toString(36).slice(2)}`
  names.push(name)
  return name
}
function store(options?: LocalOperationalStoreOptions): LocalOperationalStore {
  return new LocalOperationalStore(databaseName(), options)
}
afterEach(async () => { await Promise.all(names.splice(0).map((name) => Dexie.delete(name))) })

async function seed(target: LocalOperationalStore, shiftId = 'SHIFT-BACKUP') {
  const masterData = buildFixtureMasterData()
  const pile = buildFixtureSapPile('S5_07')
  const fleetSetup = buildFixtureFleetSetup(masterData, pile.id)
  const shift = buildFixtureShift(shiftId)
  expect((await target.initializeShiftWorkspace({ shift, piles: [pile], masterData, fleetSetup })).ok).toBe(true)
  const transaction = buildFixtureHaulageTransaction({ id: `${shiftId}-TX`, shiftId, pile, batch: 1, rit: 1, masterData, fleetSetup })
  expect((await target.addHaulageTransaction(transaction)).ok).toBe(true)
  return shift
}

describe('Local workspace backup', () => {
  it('rejects invalid JSON, unsupported versions, and a missing explicit outbox field before any write', async () => {
    expect(() => parseWorkspaceBackup('{')).toThrow('Backup file is not valid JSON')
    const source = store()
    const shift = await seed(source)
    const exported = value(await source.exportLocalWorkspaceBackup(shift.id))
    const unsupported = JSON.parse(stringifyWorkspaceBackup(exported)) as { formatVersion: number }
    unsupported.formatVersion = 99
    expect(() => parseWorkspaceBackup(JSON.stringify(unsupported))).toThrow('Unsupported backup format version')
    const missingOutbox = JSON.parse(stringifyWorkspaceBackup(exported)) as { data: Record<string, unknown> }
    delete missingOutbox.data.shiftSummarySync
    expect(() => parseWorkspaceBackup(JSON.stringify(missingOutbox))).toThrow('must explicitly contain shiftSummarySync')
  })

  it('exports one workspace without mixing another shift and leaves source state unchanged', async () => {
    const source = store()
    const shift = await seed(source)
    await seed(source, 'SHIFT-OTHER')
    const exported = await source.exportLocalWorkspaceBackup(shift.id)
    expect(exported.ok).toBe(true)
    if (!exported.ok) return
    expect(exported.value.data.haulageTransactions).toHaveLength(1)
    expect(exported.value.data.haulageTransactions[0]?.shiftId).toBe(shift.id)
    expect(value(await source.loadCurrentShiftWorkspace())?.shiftId).toBe('SHIFT-OTHER')
  })

  it('omits only an absent legacy fresh-pile position and preserves an explicit position', async () => {
    const source = store()
    const shift = await seed(source)
    const start = value(parseFreshPileStartPosition(3, 4))
    expect((await source.confirmFreshPileStartPosition(shift.id, fixturePileId('S5_07'), start)).ok).toBe(true)
    const backup = value(await source.exportLocalWorkspaceBackup(shift.id))
    const parsed = parseWorkspaceBackup(stringifyWorkspaceBackup(backup))
    expect(parsed.data.workspace.piles[0]?.freshPileStartPosition).toEqual(start)
  })

  it('round-trips a validated backup into an empty database without activating it', async () => {
    const source = store()
    const shift = await seed(source)
    const exported = await source.exportLocalWorkspaceBackup(shift.id)
    expect(exported.ok).toBe(true)
    if (!exported.ok) return
    const portable = parseWorkspaceBackup(stringifyWorkspaceBackup(exported.value))
    const destination = store()
    expect((await destination.previewLocalWorkspaceBackup(portable)).ok).toBe(true)
    expect((await destination.restoreLocalWorkspaceBackup(portable)).ok).toBe(true)
    expect(value(await destination.loadCurrentShiftWorkspace())).toBeUndefined()
    expect(value(await destination.listHaulageTransactionsForShift(fixtureShiftId('SHIFT-BACKUP')))).toHaveLength(1)
  })

  it('keeps a restored workspace after closing and reopening its isolated database', async () => {
    const source = store()
    const shift = await seed(source)
    const backup = value(await source.exportLocalWorkspaceBackup(shift.id))
    const name = databaseName()
    const destination = new LocalOperationalStore(name)
    expect((await destination.restoreLocalWorkspaceBackup(backup)).ok).toBe(true)
    destination.close()
    const reopened = new LocalOperationalStore(name)
    expect(value(await reopened.loadShiftWorkspace(shift.id))?.shiftId).toBe(shift.id)
    expect(value(await reopened.listHaulageTransactionsForShift(shift.id))).toHaveLength(1)
    reopened.close()
  })

  it('has an explicit empty outbox and preview performs no writes', async () => {
    const source = store()
    const shift = await seed(source)
    const exported = value(await source.exportLocalWorkspaceBackup(shift.id))
    expect(exported.data.shiftSummarySync).toBeNull()
    const destination = store()
    expect(value(await destination.previewLocalWorkspaceBackup(exported)).workspaceId).toBe(shift.id)
    expect(value(await destination.loadShiftWorkspace(shift.id))).toBeUndefined()
    expect(value(await destination.listHaulageTransactionsForShift(shift.id))).toEqual([])
  })

  it('preserves a shift-owned summary outbox row through export and restore', async () => {
    const source = store()
    const shift = await seed(source)
    expect((await source.upsertShiftSummarySyncRecord({
      shiftId: shift.id,
      summary: { shiftId: shift.id, date: shift.date, shiftCode: shift.shiftCode, sectorCode: shift.sectorCode, samplingHouseCode: shift.samplingHouseCode, ritTotal: 1, batchTotal: 1, incrementTotal: 0, wrongTruckTotal: 0 },
      status: 'PENDING', attemptCount: 0, updatedAt: new Date('2026-10-13T00:00:00.000Z'),
    })).ok).toBe(true)
    const exported = value(await source.exportLocalWorkspaceBackup(shift.id))
    expect(exported.data.shiftSummarySync?.shiftId).toBe(shift.id)
    const destination = store()
    expect((await destination.restoreLocalWorkspaceBackup(exported)).ok).toBe(true)
    expect(value(await destination.getShiftSummarySyncRecord(shift.id))?.summary.ritTotal).toBe(1)
  })

  it('preserves production correction audit history without rebuilding it', async () => {
    const source = store()
    const masterData = buildFixtureMasterData()
    const pile = buildFixtureSapPile('S5_07')
    const fleetSetup = buildFixtureFleetSetup(masterData, pile.id)
    const shift = buildFixtureShift('SHIFT-AUDIT')
    expect((await source.initializeShiftWorkspace({ shift, piles: [pile], masterData, fleetSetup })).ok).toBe(true)
    const transaction = buildFixtureHaulageTransaction({ id: 'SHIFT-AUDIT-TX', shiftId: 'SHIFT-AUDIT', pile, batch: 1, rit: 1, masterData, fleetSetup })
    expect((await source.addHaulageTransaction(transaction)).ok).toBe(true)
    const base = buildFixtureProductionRecord({ transaction })
    const correctionId = value(parseProductionCorrectionId('CORR-1'))
    const corrected: typeof base = {
      ...base,
      audit: {
        ...base.audit,
        corrections: [{ id: correctionId, type: 'EDIT_FIELDS', reason: 'Correction retained', before: base.effective, after: base.effective, correctedAt: new Date('2026-10-13T00:00:00.000Z'), correctedBy: fixtureEmployeeId('12345') }],
      },
    }
    expect((await source.addProductionRecord(corrected)).ok).toBe(true)
    const exported = value(await source.exportLocalWorkspaceBackup(shift.id))
    expect(exported.data.productionRecords[0]?.productionRecord.audit.corrections).toHaveLength(1)
    const destination = store()
    expect((await destination.restoreLocalWorkspaceBackup(exported)).ok).toBe(true)
    expect(value(await destination.listProductionRecordsForShift(shift.id))[0]?.audit.corrections[0]?.id).toBe('CORR-1')
  })

  it('rejects duplicate IDs and broken ownership before restore', async () => {
    const source = store()
    const shift = await seed(source)
    const exported = value(await source.exportLocalWorkspaceBackup(shift.id))
    const duplicate = JSON.parse(stringifyWorkspaceBackup(exported)) as { data: { haulageTransactions: unknown[] } }
    duplicate.data.haulageTransactions.push(duplicate.data.haulageTransactions[0]!)
    expect(() => parseWorkspaceBackup(JSON.stringify(duplicate))).toThrow('duplicate id')
    const broken = JSON.parse(stringifyWorkspaceBackup(exported)) as { data: { haulageTransactions: Array<Record<string, unknown>> } }
    broken.data.haulageTransactions[0] = { ...broken.data.haulageTransactions[0]!, shiftId: 'SHIFT-OTHER' }
    expect(() => parseWorkspaceBackup(JSON.stringify(broken))).toThrow('does not belong to this workspace')
  })

  it('leaves an empty target empty when validation rejects a broken restore', async () => {
    const source = store()
    const shift = await seed(source)
    const broken = JSON.parse(stringifyWorkspaceBackup(value(await source.exportLocalWorkspaceBackup(shift.id)))) as { data: { productionRecords: unknown[] } }
    broken.data.productionRecords.push({ id: 'ORPHAN', shiftId: String(shift.id), pileId: 'S5_07', productionRecord: {} })
    const destination = store()
    expect(() => parseWorkspaceBackup(JSON.stringify(broken))).toThrow('does not reference a workspace haulage transaction')
    expect(value(await destination.loadShiftWorkspace(shift.id))).toBeUndefined()
  })

  it('rolls back every inserted row if a write fails after workspace insertion', async () => {
    const source = store()
    const shift = await seed(source)
    const backup = value(await source.exportLocalWorkspaceBackup(shift.id))
    const destination = store({ onRestoreWorkspaceInserted: () => { throw new Error('injected restore failure') } })
    const result = await destination.restoreLocalWorkspaceBackup(backup)
    expect(result.ok).toBe(false)
    expect(value(await destination.loadShiftWorkspace(shift.id))).toBeUndefined()
    expect(value(await destination.listHaulageTransactionsForShift(shift.id))).toEqual([])
  })

  it('rejects an existing workspace collision without writing over it', async () => {
    const target = store()
    const shift = await seed(target)
    const exported = await target.exportLocalWorkspaceBackup(shift.id)
    expect(exported.ok).toBe(true)
    if (!exported.ok) return
    const result = await target.restoreLocalWorkspaceBackup(exported.value)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('BACKUP_CONFLICT_SHIFT_WORKSPACE')
    expect(value(await target.listHaulageTransactionsForShift(shift.id))).toHaveLength(1)
  })

  it('rechecks a collision after a successful preview before committing restore', async () => {
    const source = store()
    const shift = await seed(source)
    const backup = value(await source.exportLocalWorkspaceBackup(shift.id))
    const destination = store()
    expect((await destination.previewLocalWorkspaceBackup(backup)).ok).toBe(true)
    await seed(destination, String(shift.id))
    const restored = await destination.restoreLocalWorkspaceBackup(backup)
    expect(restored.ok).toBe(false)
    if (!restored.ok) expect(restored.error.code).toBe('BACKUP_CONFLICT_SHIFT_WORKSPACE')
  })
})
