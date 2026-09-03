export type FleetSetupDraftKind = 'BASE' | 'DERIVED'

export interface FleetSetupDraftEntry {
  readonly fleetId: string
  readonly frontId: string
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
    frontId: '',
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
