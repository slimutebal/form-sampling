import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FleetRecordActionDialog } from './fleet-record-action-dialog'

const mocks = vi.hoisted(() => ({
  productionRecords: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  loadShiftWorkspace: vi.fn(),
  updateActiveFrontFleetWithProductionGuard: vi.fn(),
  refreshWorkspace: vi.fn(),
  workspace: {
    shiftId: 'SHIFT-1',
    shift: { sectorCode: 'BR1' },
    masterData: {
      haulers: [{ code: 'HA1', name: 'Sinar Terang Mandiri' }],
      pileAreas: [
        { pileId: 'S1_F', oreCode: 'SAP', sectorCode: 'BR1' },
        { pileId: 'S3_59', oreCode: 'SAP', sectorCode: 'BR1' },
        { pileId: 'S5_39', oreCode: 'SAP', sectorCode: 'BR1' },
        { pileId: 'S7_01', oreCode: 'LIM', sectorCode: 'BR1' },
      ],
      trucks: [{ id: 'T1', haulerCode: 'HA1' }, { id: 'T2', haulerCode: 'HA1' }, { id: 'T3', haulerCode: 'HA1' }],
    },
    fleetSetup: {
      fronts: [{ frontId: 'BR1/08', haulerCode: 'HA1', sectorCode: 'BR1', destinationPileId: 'S1_F', destinationPileIds: ['S1_F', 'S3_59', 'S5_39'], excaCode: 'HA1-Exc_0321' }],
      fleets: [{ kind: 'BASE', fleetId: 'FLEET-8', frontId: 'BR1/08', truckIds: ['T1', 'T2'], assignmentIdentity: { fleetCode: '261009D-BR1-F08' }, excaConfigurationHistory: [{ revisionId: 'R-1', fleetAssignmentId: 'FLEET-8', previousExcaCode: 'HA1-Exc_0698', excaCode: 'HA1-Exc_0321', effectiveAt: new Date('2026-10-09T01:00:00Z'), recordedAt: new Date('2026-10-09T01:01:00Z'), actorId: 'CHECKER' }] }],
    },
    pileRegistrations: [{ pileId: 'S1_F', status: 'ACTIVE' }, { pileId: 'S3_59', status: 'ACTIVE' }, { pileId: 'S5_39', status: 'ACTIVE' }, { pileId: 'S7_01', status: 'ACTIVE' }],
  },
}))

vi.mock('react-router', () => ({
  useOutletContext: () => ({
    workspace: mocks.workspace,
    refreshWorkspace: mocks.refreshWorkspace,
  }),
}))
vi.mock('@/app/local-operational-store', () => ({ localOperationalStore: { listProductionRecordsForShift: mocks.productionRecords, loadShiftWorkspace: mocks.loadShiftWorkspace, updateActiveFrontFleetWithProductionGuard: mocks.updateActiveFrontFleetWithProductionGuard } }))
vi.mock('@/domain/fleet/front-lineage', () => ({ deriveFrontLineage: () => ({ activeFrontIds: ['BR1/08'] }) }))
vi.mock('@/domain/fleet/fleet-resolution', () => ({ resolveEffectiveFleetAgainstMaster: (_masterData: unknown, fleetSetup: { fleets: readonly { fleetId: string; truckIds?: readonly string[] }[] }, fleetId: string) => ({ ok: true, value: { truckIds: fleetSetup.fleets.find((fleet) => fleet.fleetId === fleetId)?.truckIds ?? [] } }) }))
vi.mock('@/application/fleet-setup/reconfigure-active-front-fleet', () => ({ reconfigureActiveFrontFleet: ({ fleetSetup, frontId, truckIds }: { fleetSetup: { fleets: readonly { frontId: string }[] }; frontId: string; truckIds: readonly string[] }) => ({ ok: true, value: { fleetSetup: { ...fleetSetup, fleets: fleetSetup.fleets.map((fleet) => fleet.frontId === frontId ? { ...fleet, truckIds } : fleet) } } }) }))

describe('FleetRecordActionDialog', () => {
  it('renders persisted Exca history and the compact Edit Fleet layout', async () => {
    const user = userEvent.setup()
    render(<FleetRecordActionDialog fleetId="FLEET-8" mode="edit" onClose={vi.fn()} />)

    const identity = document.querySelector('[data-ui="fleet-edit-identity"]')
    expect(identity).toHaveTextContent('Sinar Terang Mandiri')
    expect(identity).toHaveTextContent('261009D-BR1-F08')
    expect(screen.queryByText('Fleet ID')).not.toBeInTheDocument()
    expect(document.querySelector('[data-ui="fleet-edit-exca-history"]')).toHaveTextContent('Exc: 0698 → 0321')
    expect(document.querySelector('[data-ui="fleet-edit-selected-pile-count"]')).toHaveTextContent('3 Selected Piles')

    const pileFrame = document.querySelector('[data-ui="fleet-edit-pile-list-frame"]')
    expect(within(pileFrame as HTMLElement).getByRole('list')).toHaveClass('grid-cols-3')
    expect(within(pileFrame as HTMLElement).getByText('S1_F').closest('li')).toHaveAttribute('data-material', 'SAP')
    expect(within(pileFrame as HTMLElement).getByText('S1_F').closest('li')).toHaveClass('fleet-edit-pile-chip')
    expect(screen.getByLabelText('Exca ID').compareDocumentPosition(pileFrame as Node) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()

    const selected = document.querySelector('[data-ui="fleet-edit-selected-trucks"]') as HTMLElement
    const removed = document.querySelector('[data-ui="fleet-edit-removed-trucks"]') as HTMLElement
    expect(within(selected).getByText('T1')).toBeInTheDocument()
    expect(within(selected).getByText('T2')).toBeInTheDocument()
    expect(within(selected).queryByText('T3')).not.toBeInTheDocument()
    expect(within(removed).getByText('No trucks.')).toBeInTheDocument()
    expect(document.querySelector('[data-ui="fleet-edit-truck-results"]')).not.toBeInTheDocument()
    expect(document.querySelector('[data-ui="fleet-edit-selected-truck-count"]')).toHaveTextContent('2 Trucks')

    await user.type(screen.getByLabelText('Search Truck ID'), 't3')
    const searchingSelected = document.querySelector('[data-ui="fleet-edit-selected-trucks"]') as HTMLElement
    const results = document.querySelector('[data-ui="fleet-edit-truck-results"]') as HTMLElement
    expect(within(results).getByRole('option', { name: 'T3' })).toBeInTheDocument()
    expect(within(searchingSelected).queryByRole('option', { name: 'T3' })).not.toBeInTheDocument()
    await user.click(within(results).getByRole('option', { name: 'T3' }))
    expect(within(searchingSelected).getByText('T3')).toBeInTheDocument()
    expect(document.querySelector('[data-ui="fleet-edit-selected-truck-count"]')).toHaveTextContent('3 Trucks')
    expect(within(results).queryByRole('option', { name: 'T3' })).not.toBeInTheDocument()

    await user.click(within(searchingSelected).getByRole('button', { name: 'Remove T3' }))
    expect(within(searchingSelected).queryByText('T3')).not.toBeInTheDocument()
    expect(within(results).getByRole('option', { name: 'T3' })).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Search Truck ID'))
    expect(document.querySelector('[data-ui="fleet-edit-truck-results"]')).not.toBeInTheDocument()
    expect(within(document.querySelector('[data-ui="fleet-edit-selected-trucks"]') as HTMLElement).getByText('T1')).toBeInTheDocument()
    await user.click(within(document.querySelector('[data-ui="fleet-edit-selected-trucks"]') as HTMLElement).getByRole('button', { name: 'Remove T2' }))
    expect(within(document.querySelector('[data-ui="fleet-edit-removed-trucks"]') as HTMLElement).getByText('T2')).toBeInTheDocument()
  })

  it('keeps a Production Pile protected while allowing another Pile to be removed', async () => {
    mocks.productionRecords.mockResolvedValueOnce({ ok: true, value: [{ transaction: { fleetId: 'FLEET-8', pileId: 'S1_F' }, effective: { fleetId: 'FLEET-8' } }] })
    const user = userEvent.setup()
    render(<FleetRecordActionDialog fleetId="FLEET-8" mode="edit" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Pile S1_F' })).toBeDisabled())
    await user.click(screen.getByRole('button', { name: 'Remove Pile S3_59' }))
    expect(screen.queryByText('S3_59')).not.toBeInTheDocument()
  })

  it('uses the same idle and search Truck Pool states for New Fleet reactivation', async () => {
    const user = userEvent.setup()
    render(<FleetRecordActionDialog fleetId="FLEET-8" mode="reactivate" onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Reactivate Fleet BR1/08' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'New Fleet' })).toHaveAttribute('aria-selected', 'true')
    expect(document.querySelector('[data-ui="fleet-edit-removed-trucks"]')).toBeInTheDocument()
    expect(document.querySelector('[data-ui="fleet-edit-truck-results"]')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Search Truck ID'), 't3')
    expect(document.querySelector('[data-ui="fleet-edit-removed-trucks"]')).not.toBeInTheDocument()
    expect(document.querySelector('[data-ui="fleet-edit-truck-results"]')).toBeInTheDocument()
  })

  it('persists the selected Truck draft only on Save and verifies it after reload', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mocks.loadShiftWorkspace.mockImplementation(async () => ({ ok: true, value: mocks.workspace }))
    mocks.updateActiveFrontFleetWithProductionGuard.mockImplementation(async (_shiftId, _fleetId, fleetSetup) => {
      mocks.workspace = { ...mocks.workspace, fleetSetup }
      return { ok: true, value: undefined }
    })
    render(<FleetRecordActionDialog fleetId="FLEET-8" mode="edit" onClose={onClose} />)

    await user.type(screen.getByLabelText('Search Truck ID'), 'T3')
    await user.click(within(document.querySelector('[data-ui="fleet-edit-truck-results"]') as HTMLElement).getByRole('option', { name: 'T3' }))
    expect(within(document.querySelector('[data-ui="fleet-edit-selected-trucks"]') as HTMLElement).getByText('T3')).toBeInTheDocument()
    expect(mocks.updateActiveFrontFleetWithProductionGuard).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(mocks.updateActiveFrontFleetWithProductionGuard).toHaveBeenCalledTimes(1)
    expect(mocks.loadShiftWorkspace).toHaveBeenCalledTimes(2)
    expect(mocks.workspace.fleetSetup.fleets[0]?.truckIds).toEqual(['T1', 'T2', 'T3'])
    expect(mocks.refreshWorkspace).toHaveBeenCalledTimes(1)
  })
})
