export type FleetSetupDraftKind = 'BASE' | 'DERIVED'

export interface FleetSetupDraftEntry {
  readonly fleetId: string
  /** Raw form value "01".."25" (Phase 18 §5) — the operator never types a combined FrontId directly. */
  readonly frontNumber: string
  /** Blank Pile_ID means "no destination configured" (Phase 18 §5). */
  readonly destinationPileId: string
  readonly haulerCode: string
  readonly kind: FleetSetupDraftKind
  readonly referenceFleetId: string
  readonly truckIds: readonly string[]
  readonly addedTruckIds: readonly string[]
  readonly removedTruckIds: readonly string[]
}

export function createEmptyFleetSetupDraftEntry(fleetId: string): FleetSetupDraftEntry {
  return {
    fleetId,
    frontNumber: '',
    destinationPileId: '',
    haulerCode: '',
    kind: 'BASE',
    referenceFleetId: '',
    truckIds: [],
    addedTruckIds: [],
    removedTruckIds: [],
  }
}

export function cloneFleetSetupDraftEntry(entry: FleetSetupDraftEntry): FleetSetupDraftEntry {
  return {
    ...entry,
    truckIds: [...entry.truckIds],
    addedTruckIds: [...entry.addedTruckIds],
    removedTruckIds: [...entry.removedTruckIds],
  }
}

/** Display-only FrontId, e.g. `formatFrontId('BR1', '01') === 'BR1/01'` — mirrors `createFrontId`'s format without re-validating (used only where an already-valid `frontNumber` is being rendered, never submitted). */
export function formatFrontId(sectorCode: string, frontNumber: string): string {
  return `${sectorCode}/${frontNumber}`
}
