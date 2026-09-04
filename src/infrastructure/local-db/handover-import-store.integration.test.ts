import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildFixtureFleetSetup,
  buildFixtureHandoverPendingSample,
  buildFixtureLimPile,
  buildFixtureMasterData,
  buildFixturePendingBatchCarryOver,
  buildFixtureSapPile,
  buildFixtureShift,
  fixtureShiftId,
} from './local-db-test-fixtures'
import { LocalOperationalStore } from './local-operational-store'

const createdDatabaseNames: string[] = []

function uniqueDatabaseName(): string {
  const name = `handover-import-store-${Date.now()}-${Math.random().toString(36).slice(2)}`
  createdDatabaseNames.push(name)
  return name
}

afterEach(async () => {
  const names = createdDatabaseNames.splice(0, createdDatabaseNames.length)
  await Promise.all(names.map((name) => Dexie.delete(name)))
})

describe('LocalOperationalStore — handover duplicate-import check (read-only)', () => {
  it('reports no fingerprint as imported before any workspace initialization', async () => {
    const store = new LocalOperationalStore(uniqueDatabaseName())
    const result = await store.hasImportedFingerprint('fp-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toBe(false)
    store.close()
  })
})

describe('LocalOperationalStore — atomic handover import + workspace persistence (Phase 12 critical fix)', () => {
  it('successful atomic persistence records both the fingerprint and the carry-over state together', async () => {
    const store = new LocalOperationalStore(uniqueDatabaseName())
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')
    const pendingBatches = [buildFixturePendingBatchCarryOver(pile, 24, 10, 'CONTINUE')]
    const pendingSamples = [
      buildFixtureHandoverPendingSample({
        pile,
        batch: 24,
        ritFrom: 2,
        ritTo: 10,
        sourceShiftId: 'SHIFT-PREV-1',
      }),
    ]

    const initResult = await store.initializeShiftWorkspace({
      shift,
      piles: [pile],
      masterData,
      fleetSetup,
      pendingBatches,
      pendingSamples,
      handoverImport: {
        fingerprint: 'fp-1',
        sourceShiftId: fixtureShiftId('SHIFT-PREV-1'),
        schemaVersion: 1,
      },
    })
    expect(initResult.ok).toBe(true)

    const fingerprintCheck = await store.hasImportedFingerprint('fp-1')
    expect(fingerprintCheck.ok).toBe(true)
    if (!fingerprintCheck.ok) return
    expect(fingerprintCheck.value).toBe(true)

    const loaded = await store.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.pendingBatches).toHaveLength(1)
    expect(loaded.value?.pendingSamples).toHaveLength(1)

    store.close()
  })

  it('retry after successful persistence returns DUPLICATE_IMPORT, and does not create the retry attempt’s workspace', async () => {
    const store = new LocalOperationalStore(uniqueDatabaseName())
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const handoverImport = {
      fingerprint: 'fp-1',
      sourceShiftId: fixtureShiftId('SHIFT-PREV-1'),
      schemaVersion: 1 as const,
    }

    const first = await store.initializeShiftWorkspace({
      shift: buildFixtureShift('SHIFT-1'),
      piles: [],
      masterData,
      fleetSetup,
      handoverImport,
    })
    expect(first.ok).toBe(true)

    // A second, independent Shift attempts to import the *same* archive file again.
    const retry = await store.initializeShiftWorkspace({
      shift: buildFixtureShift('SHIFT-2'),
      piles: [],
      masterData,
      fleetSetup,
      handoverImport,
    })
    expect(retry.ok).toBe(false)
    if (retry.ok) return
    expect(retry.error.code).toBe('DUPLICATE_IMPORT')

    // The retry's own workspace must not have been created either — the
    // whole attempt is one atomic unit.
    const retryWorkspace = await store.loadShiftWorkspace(fixtureShiftId('SHIFT-2'))
    expect(retryWorkspace.ok).toBe(true)
    if (!retryWorkspace.ok) return
    expect(retryWorkspace.value).toBeUndefined()

    store.close()
  })

  it('a failed workspace persistence does not consume the fingerprint — the same file can be retried', async () => {
    const store = new LocalOperationalStore(uniqueDatabaseName())
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')

    // Pre-create a workspace for SHIFT-1 with no handover import, so a
    // second attempt for the *same* ShiftId is guaranteed to fail
    // (simulating a failure/crash scenario) — this specific attempt also
    // carries a brand-new, never-before-seen fingerprint.
    const preExisting = await store.initializeShiftWorkspace({
      shift,
      piles: [],
      masterData,
      fleetSetup,
    })
    expect(preExisting.ok).toBe(true)

    const failedAttempt = await store.initializeShiftWorkspace({
      shift,
      piles: [],
      masterData,
      fleetSetup,
      handoverImport: {
        fingerprint: 'fp-never-consumed',
        sourceShiftId: fixtureShiftId('SHIFT-PREV-1'),
        schemaVersion: 1,
      },
    })
    expect(failedAttempt.ok).toBe(false)
    if (failedAttempt.ok) return
    expect(failedAttempt.error.code).toBe('SHIFT_WORKSPACE_ALREADY_EXISTS')

    // The invariant under test: a fingerprint must NOT become
    // permanently consumed unless its carry-over state was also
    // durably persisted. Since the workspace write failed, the
    // fingerprint must still be free to retry.
    const check = await store.hasImportedFingerprint('fp-never-consumed')
    expect(check.ok).toBe(true)
    if (!check.ok) return
    expect(check.value).toBe(false)

    // Proving the retry is genuinely possible: a fresh Shift with the
    // same fingerprint now succeeds.
    const retried = await store.initializeShiftWorkspace({
      shift: buildFixtureShift('SHIFT-RETRY'),
      piles: [],
      masterData,
      fleetSetup,
      handoverImport: {
        fingerprint: 'fp-never-consumed',
        sourceShiftId: fixtureShiftId('SHIFT-PREV-1'),
        schemaVersion: 1,
      },
    })
    expect(retried.ok).toBe(true)

    store.close()
  })

  it('import history and carry-over both persist across close/reopen', async () => {
    const databaseName = uniqueDatabaseName()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('PILE-1')

    const firstSession = new LocalOperationalStore(databaseName)
    const initResult = await firstSession.initializeShiftWorkspace({
      shift,
      piles: [pile],
      masterData,
      fleetSetup,
      pendingBatches: [buildFixturePendingBatchCarryOver(pile, 24, 10, 'CONTINUE')],
      handoverImport: {
        fingerprint: 'fp-1',
        sourceShiftId: fixtureShiftId('SHIFT-PREV-1'),
        schemaVersion: 1,
      },
    })
    expect(initResult.ok).toBe(true)
    firstSession.close()

    const secondSession = new LocalOperationalStore(databaseName)
    const fingerprintCheck = await secondSession.hasImportedFingerprint('fp-1')
    expect(fingerprintCheck.ok).toBe(true)
    if (!fingerprintCheck.ok) return
    expect(fingerprintCheck.value).toBe(true)

    const loaded = await secondSession.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.pendingBatches).toHaveLength(1)
    secondSession.close()
  })
})

describe('LocalOperationalStore — shift workspace carry-over persistence (Phase 12)', () => {
  it('initializeShiftWorkspace with no pendingBatches/pendingSamples/handoverImport defaults to empty arrays (no pending work)', async () => {
    const store = new LocalOperationalStore(uniqueDatabaseName())
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')

    const initResult = await store.initializeShiftWorkspace({
      shift,
      piles: [],
      masterData,
      fleetSetup,
    })
    expect(initResult.ok).toBe(true)

    const loaded = await store.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.pendingBatches).toEqual([])
    expect(loaded.value?.pendingSamples).toEqual([])
    store.close()
  })

  it('persists reconstructed carry-over state (multiple pending batches, pending samples) and survives reopen', async () => {
    const databaseName = uniqueDatabaseName()
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('SHIFT-1')
    const pile = buildFixtureSapPile('L18_S09')
    const holdPile = buildFixtureSapPile('PILE-HOLD')

    const pendingBatches = [
      buildFixturePendingBatchCarryOver(pile, 24, 10, 'CONTINUE'),
      buildFixturePendingBatchCarryOver(pile, 25, 3, 'CONTINUE'),
      buildFixturePendingBatchCarryOver(pile, 31, 18, 'CONTINUE'),
      buildFixturePendingBatchCarryOver(pile, 32, 14, 'CONTINUE'),
      buildFixturePendingBatchCarryOver(holdPile, 7, 65, 'HOLD'),
    ]
    const pendingSamples = [
      buildFixtureHandoverPendingSample({
        pile,
        batch: 24,
        ritFrom: 2,
        ritTo: 10,
        sourceShiftId: 'SHIFT-PREV-1',
      }),
    ]

    const firstSession = new LocalOperationalStore(databaseName)
    const initResult = await firstSession.initializeShiftWorkspace({
      shift,
      piles: [pile, holdPile],
      masterData,
      fleetSetup,
      pendingBatches,
      pendingSamples,
      handoverImport: {
        fingerprint: 'fp-1',
        sourceShiftId: fixtureShiftId('SHIFT-PREV-1'),
        schemaVersion: 1,
      },
    })
    expect(initResult.ok).toBe(true)
    firstSession.close()

    const secondSession = new LocalOperationalStore(databaseName)
    const loaded = await secondSession.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.pendingBatches.map((row) => Number(row.pendingBatch.batchNumber))).toEqual(
      [24, 25, 31, 32, 7],
    )
    expect(
      loaded.value?.pendingBatches.find((row) => row.pile.id === 'PILE-HOLD')?.pendingBatch.status,
    ).toBe('HOLD')
    expect(loaded.value?.pendingSamples).toHaveLength(1)
    expect(loaded.value?.pendingSamples[0].pileId).toBe('L18_S09')
    secondSession.close()
  })
})

describe('LocalOperationalStore — carry-over integrity invariants (Phase 12 persistence integrity cleanup)', () => {
  it('rejects non-empty pendingBatches without handoverImport metadata', async () => {
    const store = new LocalOperationalStore(uniqueDatabaseName())
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-1')

    const result = await store.initializeShiftWorkspace({
      shift: buildFixtureShift('SHIFT-1'),
      piles: [pile],
      masterData,
      fleetSetup,
      pendingBatches: [buildFixturePendingBatchCarryOver(pile, 24, 10, 'CONTINUE')],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('HANDOVER_IMPORT_METADATA_REQUIRED')

    // Nothing was written — not even the workspace itself.
    const loaded = await store.loadShiftWorkspace(fixtureShiftId('SHIFT-1'))
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value).toBeUndefined()
    store.close()
  })

  it('rejects non-empty pendingSamples without handoverImport metadata', async () => {
    const store = new LocalOperationalStore(uniqueDatabaseName())
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-1')

    const result = await store.initializeShiftWorkspace({
      shift: buildFixtureShift('SHIFT-1'),
      piles: [pile],
      masterData,
      fleetSetup,
      pendingSamples: [
        buildFixtureHandoverPendingSample({
          pile,
          batch: 24,
          ritFrom: 2,
          ritTo: 10,
          sourceShiftId: 'SHIFT-PREV-1',
        }),
      ],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('HANDOVER_IMPORT_METADATA_REQUIRED')
    store.close()
  })

  it('accepts a handoverImport with both carry-over arrays empty (valid previous shift with no pending work)', async () => {
    const store = new LocalOperationalStore(uniqueDatabaseName())
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)

    const result = await store.initializeShiftWorkspace({
      shift: buildFixtureShift('SHIFT-1'),
      piles: [],
      masterData,
      fleetSetup,
      handoverImport: {
        fingerprint: 'fp-empty',
        sourceShiftId: fixtureShiftId('SHIFT-PREV-1'),
        schemaVersion: 1,
      },
    })
    expect(result.ok).toBe(true)

    const loaded = await store.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.pendingBatches).toEqual([])
    expect(loaded.value?.pendingSamples).toEqual([])
    store.close()
  })

  it('rejects a pending sample whose sourceShiftId disagrees with handoverImport.sourceShiftId', async () => {
    const store = new LocalOperationalStore(uniqueDatabaseName())
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-1')

    const result = await store.initializeShiftWorkspace({
      shift: buildFixtureShift('SHIFT-1'),
      piles: [pile],
      masterData,
      fleetSetup,
      pendingSamples: [
        buildFixtureHandoverPendingSample({
          pile,
          batch: 24,
          ritFrom: 2,
          ritTo: 10,
          sourceShiftId: 'SHIFT-PREV-2',
        }),
      ],
      handoverImport: {
        fingerprint: 'fp-1',
        sourceShiftId: fixtureShiftId('SHIFT-PREV-1'),
        schemaVersion: 1,
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('HANDOVER_SOURCE_SHIFT_MISMATCH')
    store.close()
  })

  it('rejects a carry-over pending batch referencing a PileId absent from the workspace Piles', async () => {
    const store = new LocalOperationalStore(uniqueDatabaseName())
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const carriedPile = buildFixtureSapPile('PILE-NOT-IN-WORKSPACE')

    const result = await store.initializeShiftWorkspace({
      shift: buildFixtureShift('SHIFT-1'),
      // Deliberately does not include `carriedPile`.
      piles: [],
      masterData,
      fleetSetup,
      pendingBatches: [buildFixturePendingBatchCarryOver(carriedPile, 24, 10, 'CONTINUE')],
      handoverImport: {
        fingerprint: 'fp-1',
        sourceShiftId: fixtureShiftId('SHIFT-PREV-1'),
        schemaVersion: 1,
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('HANDOVER_PILE_NOT_IN_WORKSPACE')
    store.close()
  })

  it('rejects a carry-over pending sample referencing a PileId absent from the workspace Piles', async () => {
    const store = new LocalOperationalStore(uniqueDatabaseName())
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const carriedPile = buildFixtureSapPile('PILE-NOT-IN-WORKSPACE')

    const result = await store.initializeShiftWorkspace({
      shift: buildFixtureShift('SHIFT-1'),
      piles: [],
      masterData,
      fleetSetup,
      pendingSamples: [
        buildFixtureHandoverPendingSample({
          pile: carriedPile,
          batch: 24,
          ritFrom: 2,
          ritTo: 10,
          sourceShiftId: 'SHIFT-PREV-1',
        }),
      ],
      handoverImport: {
        fingerprint: 'fp-1',
        sourceShiftId: fixtureShiftId('SHIFT-PREV-1'),
        schemaVersion: 1,
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('HANDOVER_PILE_NOT_IN_WORKSPACE')
    store.close()
  })

  it('rejects a carry-over pending batch whose Ore disagrees with the workspace Pile Ore', async () => {
    const store = new LocalOperationalStore(uniqueDatabaseName())
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    // Same PileId, but the workspace Pile is SAP while the carried-over Pile is LIM.
    const workspacePile = buildFixtureSapPile('PILE-1')
    const carriedPile = buildFixtureLimPile('PILE-1')

    const result = await store.initializeShiftWorkspace({
      shift: buildFixtureShift('SHIFT-1'),
      piles: [workspacePile],
      masterData,
      fleetSetup,
      pendingBatches: [buildFixturePendingBatchCarryOver(carriedPile, 24, 10, 'CONTINUE')],
      handoverImport: {
        fingerprint: 'fp-1',
        sourceShiftId: fixtureShiftId('SHIFT-PREV-1'),
        schemaVersion: 1,
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('HANDOVER_PILE_ORE_MISMATCH')
    store.close()
  })

  it('rejects a carry-over pending sample whose Ore disagrees with the workspace Pile Ore', async () => {
    const store = new LocalOperationalStore(uniqueDatabaseName())
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const workspacePile = buildFixtureSapPile('PILE-1')
    const carriedPile = buildFixtureLimPile('PILE-1')

    const result = await store.initializeShiftWorkspace({
      shift: buildFixtureShift('SHIFT-1'),
      piles: [workspacePile],
      masterData,
      fleetSetup,
      pendingSamples: [
        buildFixtureHandoverPendingSample({
          pile: carriedPile,
          batch: 24,
          ritFrom: 2,
          ritTo: 10,
          sourceShiftId: 'SHIFT-PREV-1',
        }),
      ],
      handoverImport: {
        fingerprint: 'fp-1',
        sourceShiftId: fixtureShiftId('SHIFT-PREV-1'),
        schemaVersion: 1,
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('HANDOVER_PILE_ORE_MISMATCH')
    store.close()
  })

  it('rejects a pending batch whose carried Pile.id disagrees with its own PendingBatch.pileId', async () => {
    const store = new LocalOperationalStore(uniqueDatabaseName())
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-1')
    const otherPile = buildFixtureSapPile('PILE-2')
    const normal = buildFixturePendingBatchCarryOver(pile, 24, 10, 'CONTINUE')
    const wiredWrong = { ...normal, pendingBatch: { ...normal.pendingBatch, pileId: otherPile.id } }

    const result = await store.initializeShiftWorkspace({
      shift: buildFixtureShift('SHIFT-1'),
      piles: [pile, otherPile],
      masterData,
      fleetSetup,
      pendingBatches: [wiredWrong],
      handoverImport: {
        fingerprint: 'fp-1',
        sourceShiftId: fixtureShiftId('SHIFT-PREV-1'),
        schemaVersion: 1,
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('HANDOVER_PILE_WIRING_MISMATCH')
    store.close()
  })

  it('a valid atomic handover with non-empty carry-over still persists the fingerprint and carry-over together', async () => {
    const store = new LocalOperationalStore(uniqueDatabaseName())
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const pile = buildFixtureSapPile('PILE-1')

    const result = await store.initializeShiftWorkspace({
      shift: buildFixtureShift('SHIFT-1'),
      piles: [pile],
      masterData,
      fleetSetup,
      pendingBatches: [buildFixturePendingBatchCarryOver(pile, 24, 10, 'CONTINUE')],
      pendingSamples: [
        buildFixtureHandoverPendingSample({
          pile,
          batch: 24,
          ritFrom: 2,
          ritTo: 10,
          sourceShiftId: 'SHIFT-PREV-1',
        }),
      ],
      handoverImport: {
        fingerprint: 'fp-atomic',
        sourceShiftId: fixtureShiftId('SHIFT-PREV-1'),
        schemaVersion: 1,
      },
    })
    expect(result.ok).toBe(true)

    const fingerprintCheck = await store.hasImportedFingerprint('fp-atomic')
    expect(fingerprintCheck.ok).toBe(true)
    if (!fingerprintCheck.ok) return
    expect(fingerprintCheck.value).toBe(true)

    const loaded = await store.loadCurrentShiftWorkspace()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value?.pendingBatches).toHaveLength(1)
    expect(loaded.value?.pendingSamples).toHaveLength(1)
    expect(loaded.value?.pendingBatches[0].pile.id).toBe('PILE-1')
    expect(loaded.value?.pendingSamples[0].pileId).toBe('PILE-1')
    store.close()
  })
})
