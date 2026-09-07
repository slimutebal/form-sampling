import Dexie, { type Table } from 'dexie'
import type {
  HaulageTransactionId,
  PileId,
  SamplePositionId,
  ShiftId,
} from '../../domain/common/identifiers'
import type { Result } from '../../domain/common/result'
import { err, ok } from '../../domain/common/result'
import type { FleetSetup } from '../../domain/fleet/fleet-setup'
import type { PendingBatchCarryOver } from '../../domain/handover/carry-over-pending-batch'
import type { HandoverPendingSample } from '../../domain/handover/carry-over-pending-sample'
import type { HaulageTransaction } from '../../domain/haulage/haulage-transaction'
import type { ManpowerAssignment } from '../../domain/manpower/manpower-assignment'
import { createMasterData, type MasterData } from '../../domain/master/master-data'
import type { PileAreaReference } from '../../domain/master/references'
import type { FreshPileStartPosition } from '../../domain/pile/fresh-pile-start-position'
import type { Pile } from '../../domain/pile/pile'
import { validateNoSampleOverlap } from '../../domain/sample-handling/sample-overlap'
import type { SamplePosition } from '../../domain/sample-handling/sample-position'
import type { Shift } from '../../domain/shift/shift'
import { DEFAULT_LOCAL_DATABASE_NAME } from './database'
import {
  CURRENT_MASTER_DATA_CACHE_KEY,
  CURRENT_SHIFT_METADATA_KEY,
  type HaulageTransactionRecord,
  type ImportHistoryRecord,
  type MasterDataCacheRecord,
  type MetadataRecord,
  type SamplePositionRecord,
  type ShiftSummarySyncRecord,
  type ShiftWorkspaceRecord,
} from './records'

/**
 * Internal Dexie wrapper for the local operational database. Deliberately
 * not exported from this module (or anywhere else) — `LocalOperationalStore`
 * below is the only production access boundary. No table object, `put`,
 * `delete`, or `db.delete()` is ever reachable from application code
 * (Phase 7 §13).
 */
class LocalOperationalDatabase extends Dexie {
  readonly shiftWorkspaces!: Table<ShiftWorkspaceRecord, string>
  readonly haulageTransactions!: Table<HaulageTransactionRecord, string>
  readonly samplePositions!: Table<SamplePositionRecord, string>
  readonly metadata!: Table<MetadataRecord, string>
  readonly importHistory!: Table<ImportHistoryRecord, string>
  readonly masterDataCache!: Table<MasterDataCacheRecord, string>
  readonly shiftSummarySync!: Table<ShiftSummarySyncRecord, string>

  constructor(databaseName: string) {
    super(databaseName)
    // v1 is preserved verbatim (same tables/indexes) so that a database
    // opened by an older client version, or already containing v1 data,
    // upgrades in place rather than losing existing shiftWorkspaces/
    // haulageTransactions/metadata rows (Phase 11 §21).
    this.version(1).stores({
      shiftWorkspaces: 'shiftId',
      haulageTransactions: 'id, shiftId, pileId, [shiftId+pileId]',
      metadata: 'key',
    })
    // v2 (Phase 11): adds samplePositions only — every v1 table/index is
    // repeated unchanged.
    this.version(2).stores({
      shiftWorkspaces: 'shiftId',
      haulageTransactions: 'id, shiftId, pileId, [shiftId+pileId]',
      metadata: 'key',
      samplePositions: 'id, shiftId, pileId, [shiftId+pileId]',
    })
    // v3 (Phase 12): adds importHistory (fingerprint-keyed handover
    // duplicate-import protection, rule 8) only — every v1/v2 table/index
    // is repeated unchanged, so existing shiftWorkspaces/haulageTransactions/
    // metadata/samplePositions data survives the upgrade untouched (rule
    // 9: "No destructive reset").
    this.version(3).stores({
      shiftWorkspaces: 'shiftId',
      haulageTransactions: 'id, shiftId, pileId, [shiftId+pileId]',
      metadata: 'key',
      samplePositions: 'id, shiftId, pileId, [shiftId+pileId]',
      importHistory: 'fingerprint',
    })
    // v4 (Phase 16): adds masterDataCache (single row keyed 'current') and
    // shiftSummarySync (one outbox row per shiftId) only — every v1/v2/v3
    // table/index is repeated unchanged, so existing shiftWorkspaces/
    // haulageTransactions/samplePositions/importHistory/metadata data
    // survives the upgrade untouched.
    this.version(4).stores({
      shiftWorkspaces: 'shiftId',
      haulageTransactions: 'id, shiftId, pileId, [shiftId+pileId]',
      metadata: 'key',
      samplePositions: 'id, shiftId, pileId, [shiftId+pileId]',
      importHistory: 'fingerprint',
      masterDataCache: 'key',
      shiftSummarySync: 'shiftId',
    })
  }
}

/**
 * Stable persistence-layer failure shape (Phase 7 §33). Not a
 * `DomainError` — this is an infrastructure boundary concern. Messages
 * are not translated here; the UI layer maps `code` to localized text.
 */
export interface LocalDatabaseError {
  readonly code: string
  readonly message: string
}

/**
 * A durable per-shift operational snapshot as returned to application
 * code. Field shape mirrors `ShiftWorkspaceRecord`, kept as a distinct
 * type so callers depend on this module's public contract rather than
 * the internal storage row shape.
 */
export interface LocalShiftWorkspace {
  readonly shiftId: ShiftId
  readonly shift: Shift
  readonly piles: readonly Pile[]
  readonly masterData: MasterData
  readonly fleetSetup: FleetSetup
  /** Carry-over pending batches from a handover import (Phase 12) — `[]` when none was imported. Always a concrete array, never `undefined`, regardless of whether the underlying row predates this field. */
  readonly pendingBatches: readonly PendingBatchCarryOver[]
  /** Carry-over pending samples from a handover import (Phase 12) — `[]` when none was imported. */
  readonly pendingSamples: readonly HandoverPendingSample[]
  /** Manpower assigned to this shift (Phase 18 §4) — `[]` for a row written before this field existed. Always a concrete array, never `undefined`. */
  readonly manpower: readonly ManpowerAssignment[]
}

/** A cached master-data snapshot as returned to application code (Phase 16 §6/§7), distinct from any `LocalShiftWorkspace.masterData`. */
export interface LocalMasterDataCacheEntry {
  readonly masterData: MasterData
  readonly fetchedAt: Date
}

export interface InitializeShiftWorkspaceParams {
  readonly shift: Shift
  readonly piles: readonly Pile[]
  readonly masterData: MasterData
  readonly fleetSetup: FleetSetup
  /** Optional so every existing Phase 7-11 call site (no handover carry-over) keeps compiling unchanged — defaults to `[]`. */
  readonly pendingBatches?: readonly PendingBatchCarryOver[]
  readonly pendingSamples?: readonly HandoverPendingSample[]
  /** Manpower assigned to this shift (Phase 18 §4). Optional so every existing pre-Phase-18 call site keeps compiling unchanged — defaults to `[]`. */
  readonly manpower?: readonly ManpowerAssignment[]
  /**
   * When this Shift is being created from a confirmed handover import
   * (Phase 12 critical fix), pass the import-history record to commit
   * here. It is written to `importHistory` in the *same* Dexie
   * transaction as the Shift workspace itself — so a fingerprint is
   * never durably consumed unless its carry-over state was also
   * durably persisted, and never partially written if this call fails
   * or the app crashes mid-way. Omit for a Shift started without a
   * previous-shift import ("Start Without Previous Shift").
   */
  readonly handoverImport?: ImportHistoryRecord
}

type StoreResult<T> = Result<T, LocalDatabaseError>

/**
 * Thrown from inside a Dexie transaction callback to abort it with a
 * specific expected `LocalDatabaseError`. Caught and unwrapped at the
 * public method boundary — never leaks past this module.
 */
class ExpectedLocalDatabaseError extends Error {
  readonly localError: LocalDatabaseError

  constructor(localError: LocalDatabaseError) {
    super(localError.message)
    this.localError = localError
  }
}

function raiseExpectedError(code: string, message: string): never {
  throw new ExpectedLocalDatabaseError({ code, message })
}

/**
 * Maps any error caught at a public method boundary to a
 * `LocalDatabaseError`. An `ExpectedLocalDatabaseError` unwraps to the
 * specific code it carries; anything else (a genuine unexpected
 * IndexedDB/Dexie failure) maps to a single catch-all code while
 * retaining the original message for diagnostics — it is never hidden
 * as a successful `undefined` result (Phase 7 §34).
 */
function mapCaughtError(caught: unknown): LocalDatabaseError {
  if (caught instanceof ExpectedLocalDatabaseError) {
    return caught.localError
  }
  return {
    code: 'LOCAL_DATABASE_OPERATION_FAILED',
    message: caught instanceof Error ? caught.message : 'Unexpected local database failure',
  }
}

function toWorkspace(record: ShiftWorkspaceRecord): LocalShiftWorkspace {
  return {
    shiftId: record.shiftId,
    shift: record.shift,
    piles: record.piles,
    masterData: record.masterData,
    fleetSetup: record.fleetSetup,
    // `?? []`: an existing v1/v2 row genuinely has no such fields on disk.
    pendingBatches: record.pendingBatches ?? [],
    pendingSamples: record.pendingSamples ?? [],
    manpower: record.manpower ?? [],
  }
}

/**
 * Public persistence boundary for the local offline operational
 * database (Phase 7). Encapsulates Dexie entirely — no table object,
 * `put`, `delete`, or `db.delete()` is ever exposed to callers. Every
 * operation here is intentional: create-only workspace initialization,
 * add-only haulage transactions, add-only sample positions, and scoped
 * reads. Only validated domain objects (Shift, Pile, MasterData,
 * FleetSetup, HaulageTransaction, SamplePosition — all Phase 2–11
 * output) may enter through this API; there is no raw/untrusted-object
 * write path.
 */
export class LocalOperationalStore {
  private readonly db: LocalOperationalDatabase

  constructor(databaseName: string = DEFAULT_LOCAL_DATABASE_NAME) {
    this.db = new LocalOperationalDatabase(databaseName)
  }

  /** Closes the underlying IndexedDB connection (does not delete data). */
  close(): void {
    this.db.close()
  }

  /**
   * Creates a new Shift workspace and marks it the current local shift,
   * atomically (Phase 7 §14, §31). This is creation, not upsert: if a
   * workspace already exists for `params.shift.id`, the whole write is
   * rejected with `SHIFT_WORKSPACE_ALREADY_EXISTS` and nothing changes
   * (§15) — including the current-shift pointer, which is only updated
   * inside the same transaction as the insert. A previously stored
   * workspace for a different Shift is never deleted (§18, §36).
   *
   * When `params.handoverImport` is given (Phase 12 critical fix), its
   * fingerprint is checked and written to `importHistory` inside this
   * *same* transaction as the Shift workspace write — `DUPLICATE_IMPORT`
   * if that fingerprint was already recorded. This is the sole place a
   * handover fingerprint is ever durably consumed: there is no
   * standalone "record the import" write path, so a fingerprint can
   * never become permanently consumed without its carry-over state also
   * being durably persisted in the same atomic operation. If the app
   * crashes or this call fails for any reason before the transaction
   * commits, nothing is written — including the fingerprint — and the
   * same archive can be retried from scratch.
   *
   * Carry-over invariants (Phase 12 persistence integrity), validated
   * synchronously before the transaction opens — never silently dropped
   * or rewritten:
   *  - non-empty `pendingBatches`/`pendingSamples` requires
   *    `handoverImport` to be present (`HANDOVER_IMPORT_METADATA_REQUIRED`)
   *    — a `handoverImport` with both arrays empty remains valid (a
   *    previous shift with no pending work);
   *  - every `pendingSamples[].sourceShiftId` must equal
   *    `handoverImport.sourceShiftId` (`HANDOVER_SOURCE_SHIFT_MISMATCH`);
   *  - every pending batch/sample's PileId must resolve to a Pile in
   *    `params.piles` (`HANDOVER_PILE_NOT_IN_WORKSPACE`) with a matching
   *    Ore (`HANDOVER_PILE_ORE_MISMATCH`), and a pending batch's carried
   *    `pile.id` must equal its own `pendingBatch.pileId`
   *    (`HANDOVER_PILE_WIRING_MISMATCH`).
   */
  async initializeShiftWorkspace(
    params: InitializeShiftWorkspaceParams,
  ): Promise<StoreResult<void>> {
    const shiftId = params.shift.id

    const seenPileIds = new Set<PileId>()
    for (const pile of params.piles) {
      if (seenPileIds.has(pile.id)) {
        return err({
          code: 'DUPLICATE_PILE_ID_IN_SHIFT_WORKSPACE',
          message: `Duplicate PileId in shift workspace: ${pile.id}`,
        })
      }
      seenPileIds.add(pile.id)
    }

    // Snapshot every write input synchronously, before the first `await`
    // below (Phase 7 §29). IndexedDB structured clone only protects from
    // the moment `.add()`/`.put()` is actually invoked — a caller could
    // otherwise mutate `params.shift`/`params.piles`/`params.masterData`/
    // `params.fleetSetup` while the asynchronous existence check and
    // transaction are still pending, and that mutation would leak into
    // what gets persisted. `structuredClone` is a generic passthrough
    // (`<T>(value: T): T`), and every Brand marker here is a type-only
    // annotation with no runtime field, so the clone needs no assertion
    // back to the branded type — TypeScript already infers it.
    const shiftSnapshot: Shift = structuredClone(params.shift)
    const pilesSnapshot: readonly Pile[] = structuredClone(params.piles)
    const masterDataSnapshot: MasterData = structuredClone(params.masterData)
    const fleetSetupSnapshot: FleetSetup = structuredClone(params.fleetSetup)
    const pendingBatchesSnapshot: readonly PendingBatchCarryOver[] = structuredClone(
      params.pendingBatches ?? [],
    )
    const pendingSamplesSnapshot: readonly HandoverPendingSample[] = structuredClone(
      params.pendingSamples ?? [],
    )
    const manpowerSnapshot: readonly ManpowerAssignment[] = structuredClone(params.manpower ?? [])
    const handoverImportSnapshot: ImportHistoryRecord | undefined = params.handoverImport
      ? structuredClone(params.handoverImport)
      : undefined

    // Carry-over integrity (Phase 12 critical fix): validated synchronously
    // against the snapshot, before the transaction opens, so an invalid
    // wiring is rejected outright with a stable code rather than silently
    // dropped or rewritten (mirrors the `seenPileIds` check above).
    if (pendingBatchesSnapshot.length > 0 || pendingSamplesSnapshot.length > 0) {
      if (!handoverImportSnapshot) {
        return err({
          code: 'HANDOVER_IMPORT_METADATA_REQUIRED',
          message: 'Non-empty pendingBatches/pendingSamples requires handoverImport metadata',
        })
      }
    }

    if (handoverImportSnapshot) {
      const sourceShiftId = handoverImportSnapshot.sourceShiftId
      const mismatchedSample = pendingSamplesSnapshot.find(
        (sample) => sample.sourceShiftId !== sourceShiftId,
      )
      if (mismatchedSample) {
        return err({
          code: 'HANDOVER_SOURCE_SHIFT_MISMATCH',
          message: `Pending sample for PileId ${mismatchedSample.pileId} has sourceShiftId ${mismatchedSample.sourceShiftId}, expected handoverImport.sourceShiftId ${sourceShiftId}`,
        })
      }
    }

    const pileByPileId = new Map<PileId, Pile>(pilesSnapshot.map((pile) => [pile.id, pile]))

    for (const row of pendingBatchesSnapshot) {
      if (row.pile.id !== row.pendingBatch.pileId) {
        return err({
          code: 'HANDOVER_PILE_WIRING_MISMATCH',
          message: `Pending batch's PendingBatch.pileId (${row.pendingBatch.pileId}) does not match its carried Pile.id (${row.pile.id})`,
        })
      }
      const workspacePile = pileByPileId.get(row.pile.id)
      if (!workspacePile) {
        return err({
          code: 'HANDOVER_PILE_NOT_IN_WORKSPACE',
          message: `Pending batch references PileId ${row.pile.id}, which is not part of this shift workspace`,
        })
      }
      if (workspacePile.oreCode !== row.pile.oreCode) {
        return err({
          code: 'HANDOVER_PILE_ORE_MISMATCH',
          message: `Pending batch Ore ${row.pile.oreCode} for PileId ${row.pile.id} does not match workspace Pile Ore ${workspacePile.oreCode}`,
        })
      }
    }

    for (const sample of pendingSamplesSnapshot) {
      const workspacePile = pileByPileId.get(sample.pileId)
      if (!workspacePile) {
        return err({
          code: 'HANDOVER_PILE_NOT_IN_WORKSPACE',
          message: `Pending sample references PileId ${sample.pileId}, which is not part of this shift workspace`,
        })
      }
      if (workspacePile.oreCode !== sample.oreCode) {
        return err({
          code: 'HANDOVER_PILE_ORE_MISMATCH',
          message: `Pending sample Ore ${sample.oreCode} for PileId ${sample.pileId} does not match workspace Pile Ore ${workspacePile.oreCode}`,
        })
      }
    }

    try {
      await this.db.transaction(
        'rw',
        this.db.shiftWorkspaces,
        this.db.metadata,
        this.db.importHistory,
        async () => {
          const existing = await this.db.shiftWorkspaces.get(shiftId)
          if (existing) {
            raiseExpectedError(
              'SHIFT_WORKSPACE_ALREADY_EXISTS',
              `Shift workspace already exists for ShiftId ${shiftId}`,
            )
          }

          if (handoverImportSnapshot) {
            const existingImport = await this.db.importHistory.get(
              handoverImportSnapshot.fingerprint,
            )
            if (existingImport) {
              raiseExpectedError(
                'DUPLICATE_IMPORT',
                `Fingerprint ${handoverImportSnapshot.fingerprint} was already imported`,
              )
            }
          }

          const record: ShiftWorkspaceRecord = {
            shiftId,
            shift: shiftSnapshot,
            piles: pilesSnapshot,
            masterData: masterDataSnapshot,
            fleetSetup: fleetSetupSnapshot,
            pendingBatches: pendingBatchesSnapshot,
            pendingSamples: pendingSamplesSnapshot,
            manpower: manpowerSnapshot,
          }
          await this.db.shiftWorkspaces.add(record)
          await this.db.metadata.put({ key: CURRENT_SHIFT_METADATA_KEY, value: shiftId })
          if (handoverImportSnapshot) {
            await this.db.importHistory.add(handoverImportSnapshot)
          }
        },
      )
      return ok(undefined)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Loads the workspace for the local current-shift pointer (Phase 7
   * §16, §17). Three distinct outcomes:
   *  - `ok(undefined)` — no current shift marker exists (normal state);
   *  - `ok(workspace)` — the marker exists and its workspace was found;
   *  - `err(CURRENT_SHIFT_WORKSPACE_NOT_FOUND)` — the marker exists but
   *    no matching workspace does, an inconsistent/corrupt local state
   *    that must never be silently reported as "no active shift".
   */
  async loadCurrentShiftWorkspace(): Promise<StoreResult<LocalShiftWorkspace | undefined>> {
    try {
      return await this.db.transaction('r', this.db.shiftWorkspaces, this.db.metadata, async () => {
        const marker = await this.db.metadata.get(CURRENT_SHIFT_METADATA_KEY)
        if (!marker) {
          return ok(undefined)
        }
        const shiftId = marker.value as ShiftId
        const record = await this.db.shiftWorkspaces.get(shiftId)
        if (!record) {
          return err({
            code: 'CURRENT_SHIFT_WORKSPACE_NOT_FOUND',
            message: `Current shift pointer references ShiftId ${shiftId}, but no workspace exists for it`,
          })
        }
        return ok(toWorkspace(record))
      })
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Loads a specific Shift's workspace by ShiftId, independent of the
   * current-shift pointer (Phase 7 §18 — multiple shifts may be stored
   * locally at once). Returns `ok(undefined)` when no workspace exists
   * for that ShiftId.
   */
  async loadShiftWorkspace(
    shiftId: ShiftId,
  ): Promise<StoreResult<LocalShiftWorkspace | undefined>> {
    try {
      const record = await this.db.shiftWorkspaces.get(shiftId)
      return ok(record ? toWorkspace(record) : undefined)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Adds one Pile to an already-initialized Shift workspace's `piles`
   * list (Phase 18 "Add Pile" wiring correction). A fresh workspace
   * legitimately starts with only its handover carry-over piles (or none
   * at all) — `masterData.pileAreas` is a selection catalog, not an
   * active-pile list — so this is the one write path that activates a
   * new production Pile once the operator explicitly picks it. Create-
   * only: a PileId already present in the workspace fails with
   * `DUPLICATE_PILE_ID_IN_SHIFT_WORKSPACE` (the same code
   * `initializeShiftWorkspace` uses for the same kind of collision)
   * rather than being silently ignored or overwriting the existing
   * entry. `SHIFT_WORKSPACE_NOT_FOUND` if no workspace exists for
   * `shiftId`. No schema change: `piles` is an existing field on the
   * stored record, and every other field is carried through unchanged.
   */
  async addPileToWorkspace(shiftId: ShiftId, pile: Pile): Promise<StoreResult<void>> {
    // Snapshot before the first `await`, mirroring every other write
    // method on this store (Phase 7 §29).
    const pileSnapshot: Pile = structuredClone(pile)

    try {
      await this.db.transaction('rw', this.db.shiftWorkspaces, async () => {
        const existing = await this.db.shiftWorkspaces.get(shiftId)
        if (!existing) {
          raiseExpectedError(
            'SHIFT_WORKSPACE_NOT_FOUND',
            `No shift workspace exists for ShiftId ${shiftId}`,
          )
        }

        if (existing.piles.some((candidate) => candidate.id === pileSnapshot.id)) {
          raiseExpectedError(
            'DUPLICATE_PILE_ID_IN_SHIFT_WORKSPACE',
            `Duplicate PileId in shift workspace: ${pileSnapshot.id}`,
          )
        }

        await this.db.shiftWorkspaces.put({
          ...existing,
          piles: [...existing.piles, pileSnapshot],
        })
      })
      return ok(undefined)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Sets or replaces the confirmed fresh-pile starting Batch/Rit
   * (`Pile.freshPileStartPosition`, post-inspection correction §6) on one
   * Pile within an already-initialized Shift workspace. `PILE_NOT_FOUND_
   * IN_SHIFT_WORKSPACE` if the Pile is not in this workspace's `piles`
   * list; `SHIFT_WORKSPACE_NOT_FOUND` if no workspace exists for
   * `shiftId`. Whether this is allowed at all (i.e. no haulage has been
   * recorded yet for this Pile) is an application-layer decision
   * (`@/application/pile-workspace/confirm-fresh-pile-start-position`) —
   * this store method only ever performs the write once told to. No
   * schema change: `freshPileStartPosition` is a plain optional field on
   * the existing `Pile` shape already stored inside `piles`.
   */
  async confirmFreshPileStartPosition(
    shiftId: ShiftId,
    pileId: PileId,
    startPosition: FreshPileStartPosition,
  ): Promise<StoreResult<void>> {
    // Snapshot before the first `await`, mirroring every other write
    // method on this store (Phase 7 §29).
    const startPositionSnapshot: FreshPileStartPosition = structuredClone(startPosition)

    try {
      await this.db.transaction('rw', this.db.shiftWorkspaces, async () => {
        const existing = await this.db.shiftWorkspaces.get(shiftId)
        if (!existing) {
          raiseExpectedError(
            'SHIFT_WORKSPACE_NOT_FOUND',
            `No shift workspace exists for ShiftId ${shiftId}`,
          )
        }

        const pileIndex = existing.piles.findIndex((candidate) => candidate.id === pileId)
        if (pileIndex < 0) {
          raiseExpectedError(
            'PILE_NOT_FOUND_IN_SHIFT_WORKSPACE',
            `No Pile ${pileId} exists in shift workspace ${shiftId}`,
          )
        }

        const updatedPiles = existing.piles.map((candidate, index) =>
          index === pileIndex ? { ...candidate, freshPileStartPosition: startPositionSnapshot } : candidate,
        )

        await this.db.shiftWorkspaces.put({
          ...existing,
          piles: updatedPiles,
        })
      })
      return ok(undefined)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Appends one newly created master Pile_Area to an already-initialized
   * Shift workspace's OWN `masterData.pileAreas` snapshot, and activates
   * its Pile in the same transaction (Phase 18 §6). This is the one other
   * deliberate exception to the normally-frozen `masterData` snapshot
   * (mirrors `addPileToWorkspace`'s own exception for `piles`) — needed
   * because a brand-new Pile_Area does not exist in any snapshot yet, and
   * this shift's own Report (Haulage Detail's Stockpile column) reads
   * `workspace.masterData.pileAreas`. The caller is responsible for
   * writing the same row to the shared Google master and to the global
   * `masterDataCache` (via `replaceMasterDataCache`) BEFORE calling this —
   * see `@/application/pile-master/activate-new-pile`. `masterData` is
   * rebuilt through `createMasterData` (re-validated, re-branded) rather
   * than hand-cast, so a genuinely inconsistent merge is rejected instead
   * of silently accepted. Create-only: a PileId already present in the
   * workspace fails with `DUPLICATE_PILE_ID_IN_SHIFT_WORKSPACE` (the same
   * code `addPileToWorkspace` uses).
   */
  async activateNewMasterPile(
    shiftId: ShiftId,
    pile: Pile,
    pileArea: PileAreaReference,
  ): Promise<StoreResult<void>> {
    // Snapshot before the first `await`, mirroring every other write
    // method on this store (Phase 7 §29).
    const pileSnapshot: Pile = structuredClone(pile)
    const pileAreaSnapshot: PileAreaReference = structuredClone(pileArea)

    try {
      await this.db.transaction('rw', this.db.shiftWorkspaces, async () => {
        const existing = await this.db.shiftWorkspaces.get(shiftId)
        if (!existing) {
          raiseExpectedError(
            'SHIFT_WORKSPACE_NOT_FOUND',
            `No shift workspace exists for ShiftId ${shiftId}`,
          )
        }

        if (existing.piles.some((candidate) => candidate.id === pileSnapshot.id)) {
          raiseExpectedError(
            'DUPLICATE_PILE_ID_IN_SHIFT_WORKSPACE',
            `Duplicate PileId in shift workspace: ${pileSnapshot.id}`,
          )
        }

        const mergedMasterData = createMasterData({
          ...existing.masterData,
          pileAreas: [...existing.masterData.pileAreas, pileAreaSnapshot],
        })
        if (!mergedMasterData.ok) {
          raiseExpectedError(mergedMasterData.error.code, mergedMasterData.error.message)
        }

        await this.db.shiftWorkspaces.put({
          ...existing,
          piles: [...existing.piles, pileSnapshot],
          masterData: mergedMasterData.value,
        })
      })
      return ok(undefined)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Persists a Front continuation (active-shift Fleet management): an
   * already fully-validated `fleetSetup` snapshot (built by
   * `@/application/fleet-setup/append-front-continuation`, which already
   * unions the existing Fronts/Fleets with the new continuation Front and
   * re-validates the whole graph) replaces the stored one, and — only
   * when the new Front's destination Pile is not yet part of this
   * workspace's `piles` list — `activatePile` is appended to it in the
   * same atomic write. Never touches `haulageTransactions`: existing
   * transactions keep whatever `frontId`/`fleetId` they were recorded
   * with, unaffected by a later continuation (historical transactions are
   * never revalidated). No schema change: `fleetSetup`/`piles` are
   * existing fields on the stored record.
   */
  async appendFrontContinuation(
    shiftId: ShiftId,
    params: { readonly fleetSetup: FleetSetup; readonly activatePile?: Pile },
  ): Promise<StoreResult<void>> {
    // Snapshot before the first `await`, mirroring every other write
    // method on this store (Phase 7 §29).
    const fleetSetupSnapshot: FleetSetup = structuredClone(params.fleetSetup)
    const activatePileSnapshot: Pile | undefined = params.activatePile
      ? structuredClone(params.activatePile)
      : undefined

    try {
      await this.db.transaction('rw', this.db.shiftWorkspaces, async () => {
        const existing = await this.db.shiftWorkspaces.get(shiftId)
        if (!existing) {
          raiseExpectedError(
            'SHIFT_WORKSPACE_NOT_FOUND',
            `No shift workspace exists for ShiftId ${shiftId}`,
          )
        }

        const piles =
          activatePileSnapshot && !existing.piles.some((candidate) => candidate.id === activatePileSnapshot.id)
            ? [...existing.piles, activatePileSnapshot]
            : existing.piles

        await this.db.shiftWorkspaces.put({
          ...existing,
          fleetSetup: fleetSetupSnapshot,
          piles,
        })
      })
      return ok(undefined)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Replaces the current shift's Manpower roster (Field Finding 1 — mid-
   * shift crew/staff changes). Unlike `initializeShiftWorkspace`'s
   * write-once `manpower`, this is a deliberate whole-array replace: the
   * caller (`@/application/manpower/create-manpower-from-draft`, reused
   * unchanged for both initial setup and this edit) has already re-
   * validated the full incoming roster against MasterData, so this store
   * method only ever persists an already-validated array — it never
   * merges or diffs against the previously stored one. Every other field
   * on the workspace record — shift, piles, masterData, fleetSetup,
   * pendingBatches/pendingSamples — is carried through unchanged, so this
   * can never reset fleet/pile/sample-handling state. Existing
   * `haulageTransactions` are a separate table entirely and are never
   * touched here — historical haulage keeps whatever manpower roster was
   * in effect when it was recorded (there is no per-transaction manpower
   * snapshot to rewrite). `SHIFT_WORKSPACE_NOT_FOUND` if no workspace
   * exists for `shiftId`. No schema change: `manpower` is an existing
   * field on the stored record.
   */
  async updateShiftManpower(
    shiftId: ShiftId,
    manpower: readonly ManpowerAssignment[],
  ): Promise<StoreResult<void>> {
    // Snapshot before the first `await`, mirroring every other write
    // method on this store (Phase 7 §29).
    const manpowerSnapshot: readonly ManpowerAssignment[] = structuredClone(manpower)

    try {
      await this.db.transaction('rw', this.db.shiftWorkspaces, async () => {
        const existing = await this.db.shiftWorkspaces.get(shiftId)
        if (!existing) {
          raiseExpectedError(
            'SHIFT_WORKSPACE_NOT_FOUND',
            `No shift workspace exists for ShiftId ${shiftId}`,
          )
        }

        await this.db.shiftWorkspaces.put({
          ...existing,
          manpower: manpowerSnapshot,
        })
      })
      return ok(undefined)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Persists a persistent effective-fleet (unit) adjustment for an
   * ACTIVE Front (Field Finding 2 — mid-shift crew replacement/addition
   * of trucks, distinct from Pile's ad-hoc "wrong truck" recording).
   * `fleetSetup` is an already fully-validated snapshot built by
   * `@/application/fleet-setup/adjust-front-fleet`, which rebuilds only
   * the target Front's own FleetDefinition (same FrontId — BASE
   * `truckIds` replaced outright, or DERIVED add/remove delta
   * recomputed against its unchanged `referenceFleetId` so lineage is
   * preserved) and re-validates the whole Front/Fleet graph. Delegates
   * to `appendFrontContinuation`'s identical atomic replace-and-persist
   * behavior — a persistent truck adjustment never activates a new
   * destination Pile, so `activatePile` is never passed.
   */
  async updateActiveFrontFleet(shiftId: ShiftId, fleetSetup: FleetSetup): Promise<StoreResult<void>> {
    return this.appendFrontContinuation(shiftId, { fleetSetup })
  }

  /**
   * Appends one validated HaulageTransaction (Phase 7 §20–§25). Add-only:
   * a repeated `transaction.id` fails with
   * `DUPLICATE_HAULAGE_TRANSACTION_ID` rather than overwriting the
   * original. Verifies referential integrity against the stored Shift
   * workspace and its Pile list before writing, atomically with the
   * insert (§24, §32): `SHIFT_WORKSPACE_NOT_FOUND` /
   * `PILE_NOT_IN_SHIFT_WORKSPACE`. Never recomputes sampling or Wrong
   * Truck classification — `transaction` is stored exactly as given.
   */
  async addHaulageTransaction(transaction: HaulageTransaction): Promise<StoreResult<void>> {
    // Snapshot the entire validated transaction synchronously, before the
    // first `await` below (Phase 7 §29) — including its BatchPosition,
    // SamplingEvaluation, and Wrong Truck reasons array. Without this, a
    // caller mutation could race the asynchronous workspace/pile/duplicate
    // checks below and leak into what gets persisted, even though
    // IndexedDB's own structured clone still protects everything from the
    // moment `.add()` is actually invoked. `structuredClone` is a generic
    // passthrough (`<T>(value: T): T`); the Brand marker on
    // HaulageTransaction is a type-only annotation with no runtime field,
    // so no assertion is needed to keep the clone typed as
    // HaulageTransaction.
    const transactionSnapshot: HaulageTransaction = structuredClone(transaction)
    const shiftId = transactionSnapshot.shiftId
    const pileId = transactionSnapshot.pileId
    const id = transactionSnapshot.id

    try {
      await this.db.transaction(
        'rw',
        this.db.shiftWorkspaces,
        this.db.haulageTransactions,
        async () => {
          const workspace = await this.db.shiftWorkspaces.get(shiftId)
          if (!workspace) {
            raiseExpectedError(
              'SHIFT_WORKSPACE_NOT_FOUND',
              `No shift workspace exists for ShiftId ${shiftId}`,
            )
          }

          const pileExists = workspace.piles.some((pile) => pile.id === pileId)
          if (!pileExists) {
            raiseExpectedError(
              'PILE_NOT_IN_SHIFT_WORKSPACE',
              `PileId ${pileId} is not part of shift workspace ${shiftId}`,
            )
          }

          const existingTransaction = await this.db.haulageTransactions.get(id)
          if (existingTransaction) {
            raiseExpectedError(
              'DUPLICATE_HAULAGE_TRANSACTION_ID',
              `Duplicate HaulageTransactionId: ${id}`,
            )
          }

          await this.db.haulageTransactions.add({
            id,
            shiftId,
            pileId,
            transaction: transactionSnapshot,
          })
        },
      )
      return ok(undefined)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /** Reads one stored HaulageTransaction by id. `undefined` if not found. */
  async getHaulageTransaction(
    id: HaulageTransactionId,
  ): Promise<StoreResult<HaulageTransaction | undefined>> {
    try {
      const record = await this.db.haulageTransactions.get(id)
      return ok(record?.transaction)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Lists every stored HaulageTransaction for a Shift, via the `shiftId`
   * index. Array order reflects no confirmed operational sequence (Phase
   * 7 §27) — callers must not treat it as haulage order.
   */
  async listHaulageTransactionsForShift(
    shiftId: ShiftId,
  ): Promise<StoreResult<readonly HaulageTransaction[]>> {
    try {
      const records = await this.db.haulageTransactions.where('shiftId').equals(shiftId).toArray()
      return ok(records.map((record) => record.transaction))
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Lists every stored HaulageTransaction for a Shift/Pile, via the
   * compound `[shiftId+pileId]` index. Array order reflects no confirmed
   * operational sequence (Phase 7 §27).
   */
  async listHaulageTransactionsForShiftPile(
    shiftId: ShiftId,
    pileId: PileId,
  ): Promise<StoreResult<readonly HaulageTransaction[]>> {
    try {
      const records = await this.db.haulageTransactions
        .where('[shiftId+pileId]')
        .equals([shiftId, pileId])
        .toArray()
      return ok(records.map((record) => record.transaction))
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Appends one validated SamplePosition (Phase 11 §21-23). Create-only:
   * a repeated `samplePosition.id` fails with
   * `DUPLICATE_SAMPLE_POSITION_ID` rather than overwriting the original.
   * Verifies referential integrity against the stored Shift workspace and
   * its Pile list, and checks overlap against every existing
   * SamplePosition for the same Shift/Pile via `validateNoSampleOverlap`
   * (BR-SP-004) — all inside the same atomic Dexie transaction as the
   * insert, so a concurrent write cannot slip an overlapping position
   * past the check. Never recomputes the sample range or Total Bag —
   * `samplePosition` is stored exactly as given.
   */
  async addSamplePosition(samplePosition: SamplePosition): Promise<StoreResult<void>> {
    // Snapshot the entire validated position synchronously, before the
    // first `await` below (Phase 7 §29 pattern) — protects against a
    // caller mutation racing the asynchronous workspace/pile/overlap
    // checks below.
    const samplePositionSnapshot: SamplePosition = structuredClone(samplePosition)
    const shiftId = samplePositionSnapshot.shiftId
    const pileId = samplePositionSnapshot.pileId
    const id = samplePositionSnapshot.id

    try {
      await this.db.transaction(
        'rw',
        this.db.shiftWorkspaces,
        this.db.samplePositions,
        async () => {
          const workspace = await this.db.shiftWorkspaces.get(shiftId)
          if (!workspace) {
            raiseExpectedError(
              'SHIFT_WORKSPACE_NOT_FOUND',
              `No shift workspace exists for ShiftId ${shiftId}`,
            )
          }

          const pileExists = workspace.piles.some((pile) => pile.id === pileId)
          if (!pileExists) {
            raiseExpectedError(
              'PILE_NOT_IN_SHIFT_WORKSPACE',
              `PileId ${pileId} is not part of shift workspace ${shiftId}`,
            )
          }

          const existingById = await this.db.samplePositions.get(id)
          if (existingById) {
            raiseExpectedError('DUPLICATE_SAMPLE_POSITION_ID', `Duplicate SamplePositionId: ${id}`)
          }

          const existingRecords = await this.db.samplePositions
            .where('[shiftId+pileId]')
            .equals([shiftId, pileId])
            .toArray()
          const existingPositions = existingRecords.map((record) => record.samplePosition)
          const overlapCheck = validateNoSampleOverlap(samplePositionSnapshot, existingPositions)
          if (!overlapCheck.ok) {
            raiseExpectedError(overlapCheck.error.code, overlapCheck.error.message)
          }

          await this.db.samplePositions.add({
            id,
            shiftId,
            pileId,
            samplePosition: samplePositionSnapshot,
          })
        },
      )
      return ok(undefined)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /** Reads one stored SamplePosition by id. `undefined` if not found. */
  async getSamplePosition(id: SamplePositionId): Promise<StoreResult<SamplePosition | undefined>> {
    try {
      const record = await this.db.samplePositions.get(id)
      return ok(record?.samplePosition)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Lists every stored SamplePosition for a Shift, via the `shiftId`
   * index. Array order reflects no confirmed operational sequence
   * (mirrors `listHaulageTransactionsForShift`) — callers must not treat
   * it as creation order.
   */
  async listSamplePositionsForShift(
    shiftId: ShiftId,
  ): Promise<StoreResult<readonly SamplePosition[]>> {
    try {
      const records = await this.db.samplePositions.where('shiftId').equals(shiftId).toArray()
      return ok(records.map((record) => record.samplePosition))
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Lists every stored SamplePosition for a Shift/Pile, via the compound
   * `[shiftId+pileId]` index.
   */
  async listSamplePositionsForShiftPile(
    shiftId: ShiftId,
    pileId: PileId,
  ): Promise<StoreResult<readonly SamplePosition[]>> {
    try {
      const records = await this.db.samplePositions
        .where('[shiftId+pileId]')
        .equals([shiftId, pileId])
        .toArray()
      return ok(records.map((record) => record.samplePosition))
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Preview-time, read-only duplicate-import check (Phase 12 rule 8).
   * Deliberately best-effort, not the authoritative guard: there is no
   * corresponding standalone write method on this store. The sole
   * authoritative, atomic check-and-write happens inside
   * `initializeShiftWorkspace`'s `handoverImport` parameter, together
   * with the Shift workspace/carry-over persistence it protects — see
   * that method's doc comment for why a separate `recordImport` write
   * path does not exist.
   */
  async hasImportedFingerprint(fingerprint: string): Promise<StoreResult<boolean>> {
    try {
      const existing = await this.db.importHistory.get(fingerprint)
      return ok(existing !== undefined)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Reads the latest cached Google master-data snapshot (Phase 16 §6/§7),
   * for offline startup / a future shift's setup. `undefined` when no
   * refresh has ever succeeded. Never reads from `shiftWorkspaces` — this
   * is a distinct cache, independent of any active shift's own
   * `masterData` snapshot.
   */
  async readCachedMasterData(): Promise<StoreResult<LocalMasterDataCacheEntry | undefined>> {
    try {
      const record = await this.db.masterDataCache.get(CURRENT_MASTER_DATA_CACHE_KEY)
      return ok(record ? { masterData: record.masterData, fetchedAt: record.fetchedAt } : undefined)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Atomically replaces the single cached master-data snapshot (Phase 16
   * §6/§7) with `masterData`/`fetchedAt`. The caller (`refreshMasterData`)
   * is responsible for only calling this once the full remote catalog is
   * already validated — this method never touches `shiftWorkspaces`, so
   * an active shift's own `masterData` snapshot can never be changed by
   * a refresh.
   */
  async replaceMasterDataCache(masterData: MasterData, fetchedAt: Date): Promise<StoreResult<void>> {
    // Snapshot before the first `await`, mirroring every other write
    // method on this store (Phase 7 §29).
    const masterDataSnapshot: MasterData = structuredClone(masterData)
    const fetchedAtSnapshot = new Date(fetchedAt.getTime())
    try {
      await this.db.masterDataCache.put({
        key: CURRENT_MASTER_DATA_CACHE_KEY,
        masterData: masterDataSnapshot,
        fetchedAt: fetchedAtSnapshot,
      })
      return ok(undefined)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Upserts the one outbox row for `record.shiftId` (Phase 16 §10/§12).
   * Deliberately a `put`, not an add-only write: a newer summary for the
   * same Shift_ID always replaces the older queued payload in place, so
   * there is never more than one logical outbox entry per shift.
   */
  async upsertShiftSummarySyncRecord(record: ShiftSummarySyncRecord): Promise<StoreResult<void>> {
    const recordSnapshot: ShiftSummarySyncRecord = structuredClone(record)
    try {
      await this.db.shiftSummarySync.put(recordSnapshot)
      return ok(undefined)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /** Reads the one outbox row for a Shift_ID. `undefined` if nothing has ever been queued for it. */
  async getShiftSummarySyncRecord(shiftId: ShiftId): Promise<StoreResult<ShiftSummarySyncRecord | undefined>> {
    try {
      const record = await this.db.shiftSummarySync.get(shiftId)
      return ok(record)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /** Lists every outbox row eligible for a retry attempt (Phase 16 §13) — status PENDING or FAILED. */
  async listPendingShiftSummarySyncRecords(): Promise<StoreResult<readonly ShiftSummarySyncRecord[]>> {
    try {
      const records = await this.db.shiftSummarySync
        .filter((record) => record.status === 'PENDING' || record.status === 'FAILED')
        .toArray()
      return ok(records)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /**
   * Lists every outbox row regardless of status (Phase 18 §10/§11) — for
   * UI-facing sync-state presentation (which must also recognize SYNCED/
   * SYNCING), distinct from `listPendingShiftSummarySyncRecords`' PENDING/
   * FAILED retry-eligible subset.
   */
  async listShiftSummarySyncRecords(): Promise<StoreResult<readonly ShiftSummarySyncRecord[]>> {
    try {
      const records = await this.db.shiftSummarySync.toArray()
      return ok(records)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }
}
