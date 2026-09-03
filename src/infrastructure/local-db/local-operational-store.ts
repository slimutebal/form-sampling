import Dexie, { type Table } from 'dexie'
import type { HaulageTransactionId, PileId, ShiftId } from '../../domain/common/identifiers'
import type { Result } from '../../domain/common/result'
import { err, ok } from '../../domain/common/result'
import type { FleetSetup } from '../../domain/fleet/fleet-setup'
import type { HaulageTransaction } from '../../domain/haulage/haulage-transaction'
import type { MasterData } from '../../domain/master/master-data'
import type { Pile } from '../../domain/pile/pile'
import type { Shift } from '../../domain/shift/shift'
import { DEFAULT_LOCAL_DATABASE_NAME, LOCAL_DATABASE_SCHEMA_VERSION } from './database'
import {
  CURRENT_SHIFT_METADATA_KEY,
  type HaulageTransactionRecord,
  type MetadataRecord,
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
  readonly metadata!: Table<MetadataRecord, string>

  constructor(databaseName: string) {
    super(databaseName)
    this.version(LOCAL_DATABASE_SCHEMA_VERSION).stores({
      shiftWorkspaces: 'shiftId',
      haulageTransactions: 'id, shiftId, pileId, [shiftId+pileId]',
      metadata: 'key',
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
}

export interface InitializeShiftWorkspaceParams {
  readonly shift: Shift
  readonly piles: readonly Pile[]
  readonly masterData: MasterData
  readonly fleetSetup: FleetSetup
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
  }
}

/**
 * Public persistence boundary for the local offline operational
 * database (Phase 7). Encapsulates Dexie entirely — no table object,
 * `put`, `delete`, or `db.delete()` is ever exposed to callers. Every
 * operation here is intentional: create-only workspace initialization,
 * add-only haulage transactions, and scoped reads. Only validated
 * domain objects (Shift, Pile, MasterData, FleetSetup,
 * HaulageTransaction — all Phase 2–6 output) may enter through this
 * API; there is no raw/untrusted-object write path.
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
   */
  async initializeShiftWorkspace(params: InitializeShiftWorkspaceParams): Promise<StoreResult<void>> {
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

    try {
      await this.db.transaction('rw', this.db.shiftWorkspaces, this.db.metadata, async () => {
        const existing = await this.db.shiftWorkspaces.get(shiftId)
        if (existing) {
          raiseExpectedError('SHIFT_WORKSPACE_ALREADY_EXISTS', `Shift workspace already exists for ShiftId ${shiftId}`)
        }

        const record: ShiftWorkspaceRecord = {
          shiftId,
          shift: shiftSnapshot,
          piles: pilesSnapshot,
          masterData: masterDataSnapshot,
          fleetSetup: fleetSetupSnapshot,
        }
        await this.db.shiftWorkspaces.add(record)
        await this.db.metadata.put({ key: CURRENT_SHIFT_METADATA_KEY, value: shiftId })
      })
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
  async loadShiftWorkspace(shiftId: ShiftId): Promise<StoreResult<LocalShiftWorkspace | undefined>> {
    try {
      const record = await this.db.shiftWorkspaces.get(shiftId)
      return ok(record ? toWorkspace(record) : undefined)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
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
      await this.db.transaction('rw', this.db.shiftWorkspaces, this.db.haulageTransactions, async () => {
        const workspace = await this.db.shiftWorkspaces.get(shiftId)
        if (!workspace) {
          raiseExpectedError('SHIFT_WORKSPACE_NOT_FOUND', `No shift workspace exists for ShiftId ${shiftId}`)
        }

        const pileExists = workspace.piles.some((pile) => pile.id === pileId)
        if (!pileExists) {
          raiseExpectedError('PILE_NOT_IN_SHIFT_WORKSPACE', `PileId ${pileId} is not part of shift workspace ${shiftId}`)
        }

        const existingTransaction = await this.db.haulageTransactions.get(id)
        if (existingTransaction) {
          raiseExpectedError('DUPLICATE_HAULAGE_TRANSACTION_ID', `Duplicate HaulageTransactionId: ${id}`)
        }

        await this.db.haulageTransactions.add({ id, shiftId, pileId, transaction: transactionSnapshot })
      })
      return ok(undefined)
    } catch (caught) {
      return err(mapCaughtError(caught))
    }
  }

  /** Reads one stored HaulageTransaction by id. `undefined` if not found. */
  async getHaulageTransaction(id: HaulageTransactionId): Promise<StoreResult<HaulageTransaction | undefined>> {
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
  async listHaulageTransactionsForShift(shiftId: ShiftId): Promise<StoreResult<readonly HaulageTransaction[]>> {
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
}
