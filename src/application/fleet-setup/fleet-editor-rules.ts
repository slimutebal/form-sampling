/** Pure rules shared by pre-shift and active Fleet editors. */
export interface FleetEditorAssignment {
  readonly company: string
  readonly pileId?: string
  readonly truckIds: readonly string[]
  readonly active: boolean
}

export function eligiblePileIds<T extends { readonly pileId: string }>(
  piles: readonly T[], assignments: readonly FleetEditorAssignment[], company: string,
): readonly T[] {
  return piles.filter((pile) => {
    const assignedCompanies = new Set(assignments
      .filter((assignment) => assignment.active && assignment.pileId === pile.pileId)
      .map((assignment) => assignment.company))
    return assignedCompanies.size === 0 || [...assignedCompanies].every((assigned) => assigned === company)
  })
}

export function eligibleTruckIds<T extends { readonly truckId: string; readonly company: string }>(
  trucks: readonly T[], company: string, selectedTruckIds: readonly string[] = [],
): readonly T[] {
  const selected = new Set(selectedTruckIds)
  return trucks.filter((truck) => truck.company === company && !selected.has(truck.truckId))
}

export function eligibleFleetReferences<T extends { readonly fleetId: string; readonly company: string; readonly active: boolean }>(
  fleets: readonly T[], company: string,
): readonly T[] {
  return fleets.filter((fleet) => fleet.active && fleet.company === company)
}

export interface FleetNumberSuggestion {
  readonly suggested: string
  readonly duplicate: boolean
  readonly requiresSkipConfirmation: boolean
  readonly exhausted: boolean
}

export function formatFleetNumber(prefix: string, number: number, width = 2): string {
  return `${prefix}/${String(number).padStart(width, '0')}`
}

export function fleetNumberSuggestion(prefix: string, existingNumbers: readonly number[], requested?: number, maximum = 25): FleetNumberSuggestion {
  const valid = [...new Set(existingNumbers.filter((value) => Number.isInteger(value) && value > 0 && value <= maximum))]
  const smallestAvailable = Array.from({ length: maximum }, (_, index) => index + 1)
    .find((value) => !valid.includes(value))
  const selected = requested ?? smallestAvailable
  return {
    suggested: selected === undefined ? '' : formatFleetNumber(prefix, selected),
    duplicate: selected !== undefined && valid.includes(selected),
    requiresSkipConfirmation: selected !== undefined && smallestAvailable !== undefined && !valid.includes(selected) && selected > smallestAvailable,
    exhausted: smallestAvailable === undefined,
  }
}

export interface FleetEditorSelection {
  readonly company: string
  readonly fleetReferenceId: string
  readonly fleetNumber: string
  readonly pileId: string
  readonly truckIds: readonly string[]
}

export function resetFleetSelectionForCompany(selection: FleetEditorSelection, company: string, fleetNumber: string): FleetEditorSelection {
  return { ...selection, company, fleetReferenceId: '', fleetNumber, pileId: '', truckIds: [] }
}
