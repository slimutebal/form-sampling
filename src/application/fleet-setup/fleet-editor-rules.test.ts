import { describe, expect, it } from 'vitest'
import { eligiblePileIds, eligibleTruckIds, fleetNumberSuggestion, resetFleetSelectionForCompany } from './fleet-editor-rules'

describe('fleet editor rules', () => {
  it('allows same-company Pile reuse and excludes another-company assignment', () => {
    const result = eligiblePileIds([{ pileId: 'P1' }, { pileId: 'P2' }], [
      { company: 'A', pileId: 'P1', truckIds: [], active: true },
      { company: 'B', pileId: 'P2', truckIds: [], active: true },
    ], 'A')
    expect(result.map((pile) => pile.pileId)).toEqual(['P1'])
  })

  it('filters trucks by company without treating another same-company Fleet membership as unavailable', () => {
    expect(eligibleTruckIds([{ truckId: 'T1', company: 'A' }, { truckId: 'T2', company: 'B' }], 'A').map((truck) => truck.truckId)).toEqual(['T1'])
  })

  it('suggests the smallest unused sequence and flags a manual skipped number', () => {
    expect(fleetNumberSuggestion('BR1', [1, 2, 4, 5])).toMatchObject({ suggested: 'BR1/03', duplicate: false, requiresSkipConfirmation: false })
    expect(fleetNumberSuggestion('BR1', [1, 3], 3)).toMatchObject({ duplicate: true })
    expect(fleetNumberSuggestion('BR1', [1, 3], 5)).toMatchObject({ requiresSkipConfirmation: true })
    expect(fleetNumberSuggestion('BR1', Array.from({ length: 25 }, (_, index) => index + 1))).toMatchObject({ suggested: '', exhausted: true })
  })

  it('clears all company-dependent values', () => {
    expect(resetFleetSelectionForCompany({ company: 'A', fleetReferenceId: 'F1', fleetNumber: 'BR1/01', pileId: 'P1', truckIds: ['T1'] }, 'B', 'BR1/02')).toEqual({ company: 'B', fleetReferenceId: '', fleetNumber: 'BR1/02', pileId: '', truckIds: [] })
  })
})
