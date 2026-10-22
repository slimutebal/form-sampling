import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router'
import type { AddProductionTransactionParams, ProductionRecordStore, ProductionRecordStoreError } from '@/application/production/production-record-store'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { ok, type Result } from '@/domain/common/result'
import { createManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import type { ProductionRecord } from '@/domain/production/production-record'
import {
  buildFixtureFleetSetup, buildFixtureHaulageTransaction, buildFixtureMasterData,
  buildFixtureProductionRecord, buildFixtureSapPile, buildFixtureShift, FIXTURE_IN_FLEET_TRUCK_ID,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import { ProductionRecordEntry } from './production-record-entry'

function value<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid')
  return result.value as T
}

class Store implements ProductionRecordStore {
  calls: AddProductionTransactionParams[] = []
  updates = 0
  private readonly records: readonly ProductionRecord[]

  constructor(records: readonly ProductionRecord[] = []) {
    this.records = records
  }
  async listProductionRecordsForShiftPile(): Promise<Result<readonly ProductionRecord[], ProductionRecordStoreError>> { return ok(this.records) }
  async addProductionTransaction(params: AddProductionTransactionParams): Promise<Result<void, ProductionRecordStoreError>> { this.calls.push(params); return ok(undefined) }
  async updateActiveFrontFleet(): Promise<Result<void, ProductionRecordStoreError>> { this.updates += 1; return ok(undefined) }
}

function renderEntry(store = new Store(), registrations = [{
  pileId: buildFixtureSapPile('S5_07').id,
  oreCode: buildFixtureSapPile('S5_07').oreCode,
  batch: value(parseBatchNumber(5)),
  rit: value(parseRitNumber(6)),
  status: 'ACTIVE' as const,
}]) {
  const masterData = buildFixtureMasterData()
  const pile = buildFixtureSapPile('S5_07')
  const fleetSetup = buildFixtureFleetSetup(masterData, pile.id)
  return render(<MemoryRouter><ProductionRecordEntry shift={buildFixtureShift('SHIFT-1')} pile={pile} masterData={masterData} fleetSetup={fleetSetup} manpower={[createManpowerAssignment('12345', 'Checker', 'Checker', true)]} pendingBatches={[]} registrations={registrations} store={store} generateTransactionId={() => 'TX-1'} /></MemoryRouter>)
}

describe('ProductionRecordEntry truck-first selection flow', () => {
  it('keeps the selected Pile, auto-selects one Batch, then selects Truck before Fleet', async () => {
    const user = userEvent.setup()
    renderEntry()
    expect(await screen.findByText('S5_07')).toBeInTheDocument()
    expect(screen.getByText('Select Batch')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Search Truck')).not.toBeDisabled())
    expect(screen.getByRole('button', { name: /Batch 05/ })).toHaveClass('bg-emerald-600')
    expect(screen.getByLabelText('Select Fleet')).toBeDisabled()
    await user.type(await screen.findByLabelText('Search Truck'), FIXTURE_IN_FLEET_TRUCK_ID)
    await user.click(screen.getByRole('option', { name: FIXTURE_IN_FLEET_TRUCK_ID }))
    await waitFor(() => expect(screen.getByLabelText('Select Fleet')).toHaveTextContent('F1'))
    expect(screen.getByRole('button', { name: '+ Truck' })).toBeInTheDocument()
  })

  it('uses effective history to advance a registration seed from 005/006 to 005/009', async () => {
    const masterData = buildFixtureMasterData()
    const pile = buildFixtureSapPile('S5_07')
    const fleetSetup = buildFixtureFleetSetup(masterData, pile.id)
    const first = buildFixtureHaulageTransaction({ id: 'TX-7', shiftId: 'SHIFT-1', pile, batch: 5, rit: 7, masterData, fleetSetup })
    const second = buildFixtureHaulageTransaction({ id: 'TX-8', shiftId: 'SHIFT-1', pile, batch: 5, rit: 8, masterData, fleetSetup })
    const store = new Store([buildFixtureProductionRecord({ transaction: first }), buildFixtureProductionRecord({ transaction: second })])
    const registration = { pileId: pile.id, oreCode: pile.oreCode, batch: value(parseBatchNumber(5)), rit: value(parseRitNumber(6)), status: 'ACTIVE' as const }
    render(<MemoryRouter><ProductionRecordEntry shift={buildFixtureShift('SHIFT-1')} pile={pile} masterData={masterData} fleetSetup={fleetSetup} manpower={[createManpowerAssignment('12345', 'Checker', 'Checker', true)]} pendingBatches={[]} registrations={[registration]} store={store} /></MemoryRouter>)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Batch 05/ }))
    expect(screen.getByText('Next:')).toHaveTextContent('Batch 05 · Trip 009')
  })

  it('offers Trucks from active Fleet assignments and keeps Quick Add scoped to the selected Fleet', async () => {
    const user = userEvent.setup()
    renderEntry()
    const truckSearch = await screen.findByLabelText('Search Truck')
    await waitFor(() => expect(truckSearch).not.toBeDisabled())
    await user.type(truckSearch, FIXTURE_IN_FLEET_TRUCK_ID)
    await user.click(await screen.findByRole('option', { name: FIXTURE_IN_FLEET_TRUCK_ID }))
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Truck' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '+ Truck' }))
    const dialog = screen.getByRole('dialog', { name: 'Quick Add Truck' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).queryByText(FIXTURE_IN_FLEET_TRUCK_ID, { selector: 'button' })).not.toBeInTheDocument()
  })

  it('shows INCR=NO with Disposition first and saves ACCEPT without hidden observations', async () => {
    const user = userEvent.setup()
    const store = new Store()
    renderEntry(store)
    const truckSearch = await screen.findByLabelText('Search Truck')
    await waitFor(() => expect(truckSearch).not.toBeDisabled())
    await user.type(truckSearch, FIXTURE_IN_FLEET_TRUCK_ID)
    await user.click(await screen.findByRole('option', { name: FIXTURE_IN_FLEET_TRUCK_ID }))
    expect(await screen.findByText('INCR: NO')).toBeInTheDocument()
    expect(screen.getByText('Disposition').compareDocumentPosition(screen.getByText('Remark')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText('Condition')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Record Production' })).not.toBeDisabled())
    await user.click(screen.getByRole('button', { name: 'Record Production' }))
    await waitFor(() => expect(store.calls).toHaveLength(1))
    expect(store.calls[0]!.productionRecord.effective.physicalCondition).toBeNull()
    expect(store.calls[0]!.productionRecord.effective.contamination).toBeNull()
  })

  it('clears observations when a non-INCR record changes from REJECT back to ACCEPT', async () => {
    const user = userEvent.setup()
    const store = new Store()
    renderEntry(store)
    const truckSearch = await screen.findByLabelText('Search Truck')
    await waitFor(() => expect(truckSearch).not.toBeDisabled())
    await user.type(truckSearch, FIXTURE_IN_FLEET_TRUCK_ID)
    await user.click(screen.getByRole('option', { name: FIXTURE_IN_FLEET_TRUCK_ID }))
    await user.click(screen.getByRole('button', { name: 'REJECT' }))
    await user.click(await screen.findByRole('button', { name: 'DRY' }))
    await user.click(screen.getByRole('button', { name: 'CLN' }))
    await user.click(screen.getByRole('button', { name: 'ACCEPT' }))
    expect(screen.queryByText('Condition')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Record Production' })).not.toBeDisabled())
    await user.click(screen.getByRole('button', { name: 'Record Production' }))
    await waitFor(() => expect(store.calls).toHaveLength(1))
    expect(store.calls[0]!.productionRecord.effective.physicalCondition).toBeNull()
    expect(store.calls[0]!.productionRecord.effective.contamination).toBeNull()
  })
})
