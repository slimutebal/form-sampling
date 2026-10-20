import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActiveFleetAddSheet } from './active-fleet-add-sheet'

const mocks = vi.hoisted(() => ({
  persistFleet: vi.fn().mockResolvedValue({ ok: false, error: { code: 'WRITE_FAILED', message: 'test failure' } }),
  appendContinuation: vi.fn(() => ({ ok: true, value: { fleetSetup: {}, newFleet: { fleetId: 'FLEET-NEW' } } })),
  appendBase: vi.fn(() => ({ ok: true, value: { fleetSetup: {}, newFleet: { fleetId: 'FLEET-NEW' } } })),
  productionRecords: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  referenceExca: 'HA1-Exc_0369',
  referenceExcaHistory: [] as { previousExcaCode?: string; excaCode: string; effectiveAt: Date }[],
}))

vi.mock('react-router', () => ({
  useOutletContext: () => ({
    workspace: {
      shiftId: 'SHIFT-1',
      shift: { id: 'SHIFT-1', date: '2026-10-18', shiftCode: 'D', sectorCode: 'BR1' },
      masterData: {
        haulers: [{ code: 'HA1' }, { code: 'HA2' }],
        pileAreas: [
          { pileId: 'S5_01', stockpileCode: 'S5', oreCode: 'SAP', sectorCode: 'BR1' },
          { pileId: 'S6_01', stockpileCode: 'S6', oreCode: 'LIM', sectorCode: 'BR1' },
          { pileId: 'S7_01', stockpileCode: 'S7', oreCode: 'SAP', sectorCode: 'BR1' },
        ],
        trucks: [
          { id: 'T1', haulerCode: 'HA1' }, { id: 'T2', haulerCode: 'HA1' }, { id: 'T3', haulerCode: 'HA1' },
          { id: 'T4', haulerCode: 'HA1' }, { id: 'T5', haulerCode: 'HA1' }, { id: 'T6', haulerCode: 'HA1' }, { id: 'T7', haulerCode: 'HA1' },
          { id: 'T8', haulerCode: 'HA2' },
        ],
      },
      fleetSetup: {
        fronts: [
          { frontId: 'BR1/01', sectorCode: 'BR1', haulerCode: 'HA1', destinationPileId: 'S5_01' },
          { frontId: 'BR1/03', sectorCode: 'BR1', haulerCode: 'HA1', destinationPileId: 'S5_01', excaCode: mocks.referenceExca },
          { frontId: 'BR1/02', sectorCode: 'BR1', haulerCode: 'HA2', destinationPileId: 'S6_01' },
        ],
        fleets: [
          { kind: 'BASE', fleetId: 'FLEET-1', frontId: 'BR1/01', truckIds: [] },
          { kind: 'DERIVED', fleetId: 'FLEET-3', frontId: 'BR1/03', referenceFleetId: 'FLEET-1', addedTruckIds: [], removedTruckIds: [], excaConfigurationHistory: mocks.referenceExcaHistory },
          { kind: 'BASE', fleetId: 'FLEET-2', frontId: 'BR1/02', truckIds: [] },
        ],
      },
      piles: [],
      pileRegistrations: [{ pileId: 'S5_01', status: 'ACTIVE' }, { pileId: 'S6_01', status: 'ACTIVE' }, { pileId: 'S7_01', status: 'ACTIVE' }],
    },
    refreshWorkspace: vi.fn(),
  }),
}))
vi.mock('@/app/local-operational-store', () => ({ localOperationalStore: { appendFrontContinuation: mocks.persistFleet, loadShiftWorkspace: vi.fn(), listProductionRecordsForShift: mocks.productionRecords } }))
vi.mock('@/application/fleet-setup/fleet-id-generator', () => ({ generateFleetId: () => 'FLEET-NEW' }))
vi.mock('@/domain/fleet/front-lineage', () => ({ deriveFrontLineage: () => ({ activeFrontIds: ['BR1/03', 'BR1/02'] }) }))
vi.mock('@/domain/fleet/fleet-resolution', () => ({ resolveEffectiveFleetAgainstMaster: (_master: unknown, _setup: unknown, fleetId: string) => ({ ok: true, value: { truckIds: fleetId === 'FLEET-3' ? ['T1'] : [] } }) }))
vi.mock('@/application/fleet-setup/append-front-continuation', () => ({ appendFrontContinuation: mocks.appendContinuation }))
vi.mock('@/application/fleet-setup/append-new-base-front', () => ({ appendNewBaseFront: mocks.appendBase }))

async function chooseCompanyAndPile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('combobox', { name: 'Company' }))
  await user.click(screen.getByRole('option', { name: 'HA1' }))
  await user.type(screen.getByLabelText('Pile'), 'S7')
  await user.click(await screen.findByRole('option', { name: 'S7_01' }))
}

afterEach(() => {
  mocks.referenceExca = 'HA1-Exc_0369'
  mocks.referenceExcaHistory = []
})

describe('ActiveFleetAddSheet', () => {
  it('shows only Company initially with a disabled Save action', () => {
    render(<ActiveFleetAddSheet onClose={vi.fn()} />)
    expect(screen.getByRole('combobox', { name: 'Company' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Pile')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Fleet' })).toBeDisabled()
  })

  it('shows all companies and maps empty-query Pile eligibility to the selected Company', async () => {
    const user = userEvent.setup()
    render(<ActiveFleetAddSheet onClose={vi.fn()} />)

    await user.click(screen.getByLabelText('Toggle Company options'))
    expect(screen.getByRole('option', { name: 'HA1' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'HA2' })).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'HA1' }))

    await user.click(screen.getByLabelText('Toggle Pile options'))
    expect(screen.getByRole('option', { name: 'S7_01' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'S5_01' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'S6_01' })).not.toBeInTheDocument()
  })

  it('keeps a same-company Pile eligible even when the separate production-record source has history', async () => {
    mocks.productionRecords.mockResolvedValueOnce({ ok: true, value: [{ transaction: { pileId: 'S7_01' } }] })
    const user = userEvent.setup()
    render(<ActiveFleetAddSheet onClose={vi.fn()} />)
    await user.click(screen.getByRole('combobox', { name: 'Company' }))
    await user.click(screen.getByRole('option', { name: 'HA1' }))
    await user.click(screen.getByLabelText('Toggle Pile options'))
    expect(await screen.findByRole('option', { name: 'S5_01' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'S7_01' })).toBeInTheDocument()
  })

  it('reveals paired Company/Pile fields and defaults to New Fleet after a valid Pile', async () => {
    const user = userEvent.setup()
    render(<ActiveFleetAddSheet onClose={vi.fn()} />)
    await chooseCompanyAndPile(user)
    expect(screen.getByRole('button', { name: 'Fleet Reference' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Fleet' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Pile' })).toHaveValue('S7_01')
    expect(screen.getByRole('textbox', { name: 'Fleet No' })).toHaveValue('04')
    expect(screen.getByText('Fleet Id:')).toBeInTheDocument()
    expect(screen.getByLabelText('Pile')).toHaveClass('text-ore-sap-foreground')
  })

  it('keeps Fleet No and Exca at an equal responsive width with compact identity badges', async () => {
    const user = userEvent.setup()
    render(<ActiveFleetAddSheet onClose={vi.fn()} />)
    await chooseCompanyAndPile(user)
    const fleetNo = screen.getByRole('textbox', { name: 'Fleet No' })
    const exca = screen.getByRole('textbox', { name: 'Exca ID' })
    expect(fleetNo.closest('.grid')).toHaveClass('grid-cols-2')
    expect(exca.closest('.grid')).toBe(fleetNo.closest('.grid'))
    expect(screen.getByText('261018D-BR1-F04')).toHaveClass('rounded-sm', 'border', 'font-semibold')
    await user.type(exca, '569')
    expect(screen.getByText('HA1-Exc_0569')).toHaveClass('rounded-sm', 'border', 'font-semibold')
  })

  it('keeps New Fleet left of Fleet Reference and opens a reference inline', async () => {
    const user = userEvent.setup()
    render(<ActiveFleetAddSheet onClose={vi.fn()} />)
    await chooseCompanyAndPile(user)
    const newTab = screen.getByRole('button', { name: 'New Fleet' })
    const activeTab = screen.getByRole('button', { name: 'Fleet Reference' })
    expect(activeTab).toHaveClass('whitespace-nowrap')
    expect(newTab.compareDocumentPosition(activeTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back to Fleet Reference' })).not.toBeInTheDocument()
    await user.click(activeTab)
    await user.click(screen.getByRole('button', { name: /F 03/ }))
    expect(screen.getByRole('button', { name: 'Back to Fleet Reference' })).toBeInTheDocument()
    expect(newTab.compareDocumentPosition(activeTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('opens a reference inline, edits only its draft, and returns to the list', async () => {
    const user = userEvent.setup()
    render(<ActiveFleetAddSheet onClose={vi.fn()} />)
    await chooseCompanyAndPile(user)
    await user.click(screen.getByRole('button', { name: 'Fleet Reference' }))
    await user.click(screen.getByRole('button', { name: /F 03/ }))
    expect(document.querySelector('[data-ui="active-fleet-inline-editor"]')).toBeInTheDocument()
    expect(screen.getByText('T1')).toBeInTheDocument()
    expect(screen.getByLabelText('Exca ID')).toHaveValue('369')
    expect(screen.getByText('HA1-Exc_0369')).toHaveClass('rounded-sm', 'font-semibold')
    expect(screen.getByRole('button', { name: 'Save Fleet' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Remove T1' }))
    expect(screen.getByText('No trucks.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to Fleet Reference' }))
    expect(screen.getByRole('button', { name: /F 03/ })).toBeInTheDocument()
  })

  it('keeps a separate New Fleet draft and can add an eligible Truck', async () => {
    const user = userEvent.setup()
    render(<ActiveFleetAddSheet onClose={vi.fn()} />)
    await chooseCompanyAndPile(user)
    await user.click(screen.getByRole('button', { name: 'New Fleet' }))
    expect(document.querySelector('[data-ui="active-fleet-inline-editor"]')).toBeInTheDocument()
    expect(screen.queryByText('Available')).not.toBeInTheDocument()
    expect(screen.queryByText('Removed')).not.toBeInTheDocument()
    const selectedTruckList = document.querySelector('[data-ui="active-fleet-selected-grid"] ul')
    expect(selectedTruckList).toHaveClass('grid-cols-2', 'gap-px', 'bg-border')
    await user.type(screen.getByLabelText('Add Truck'), 'T7')
    await user.click(screen.getByRole('option', { name: 'T7' }))
    await user.type(screen.getByLabelText('Add Truck'), 'T2')
    await user.click(screen.getByRole('option', { name: 'T2' }))
    const truck2 = screen.getByText('T2')
    const truck7 = screen.getByText('T7')
    expect(truck2.compareDocumentPosition(truck7) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('2 Trucks')).toHaveClass('rounded-full', 'border-focus-accent/60')
    expect(screen.getByRole('button', { name: 'Save Fleet' })).toBeDisabled()
    await user.type(screen.getByLabelText('Exca ID'), '12')
    expect(screen.getByRole('button', { name: 'Save Fleet' })).toHaveClass('bg-focus-accent', 'text-focus-accent-foreground')
    expect(screen.getByRole('button', { name: 'Save Fleet' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Fleet Reference' }))
    expect(screen.getByRole('button', { name: /F 03/ })).toBeInTheDocument()
  })

  it('uses inline search results: Plus preserves the query while a result row adds and closes it', async () => {
    const user = userEvent.setup()
    render(<ActiveFleetAddSheet onClose={vi.fn()} />)
    await chooseCompanyAndPile(user)
    await user.click(screen.getByRole('button', { name: 'Fleet Reference' }))
    await user.click(screen.getByRole('button', { name: /F 03/ }))
    const truckSearch = screen.getByLabelText('Add Truck')
    await user.type(truckSearch, 'T')
    const menu = await screen.findByRole('listbox', { name: 'Truck search results' })
    expect(menu.closest('[data-ui="active-fleet-truck-results"]')).toHaveClass('rounded-md')
    expect(menu).toHaveClass('h-[min(220px,35dvh)]', 'overflow-y-auto', 'scrollbar-none')
    expect(menu.closest('[data-ui="active-fleet-truck-menu"]')).not.toBeInTheDocument()
    expect(document.querySelector('[data-ui="active-fleet-truck-search-columns"]')).toBeInTheDocument()
    expect(screen.queryByText('Removed')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add T2 and keep searching' }))
    expect(truckSearch).toHaveValue('T')
    expect(screen.getByRole('listbox', { name: 'Truck search results' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'T2' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close Search Results' }))
    expect(truckSearch).toHaveValue('T')
    expect(screen.queryByRole('listbox', { name: 'Truck search results' })).not.toBeInTheDocument()
    expect(screen.getByText('Removed')).toBeInTheDocument()
    await user.click(truckSearch)
    expect(screen.getByRole('listbox', { name: 'Truck search results' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add T3 and keep searching' }))
    expect(screen.queryAllByText('T2')).toHaveLength(1)
    await user.click(screen.getByRole('option', { name: 'T4' }))
    expect(truckSearch).toHaveValue('')
    expect(screen.queryByRole('listbox', { name: 'Truck search results' })).not.toBeInTheDocument()
    expect(screen.getByText('Removed')).toBeInTheDocument()
  })

  it('keeps Add Fleet to one selected Pile', async () => {
    const user = userEvent.setup()
    render(<ActiveFleetAddSheet onClose={vi.fn()} />)
    await user.click(screen.getByRole('combobox', { name: 'Company' }))
    await user.click(screen.getByRole('option', { name: 'HA1' }))
    const destination = screen.getByLabelText('Pile')
    await user.type(destination, 'S7')
    await user.click(await screen.findByRole('option', { name: 'S7_01' }))
    await user.clear(destination)
    await user.type(destination, 'S5')
    await user.click(await screen.findByRole('option', { name: 'S5_01' }))
    expect(destination).toHaveValue('S5_01')
    expect(destination).not.toHaveValue('S7_01')
  })

  it('keeps Fleet No empty or zero stable and disables Save until it is valid again', async () => {
    const user = userEvent.setup()
    render(<ActiveFleetAddSheet onClose={vi.fn()} />)
    await chooseCompanyAndPile(user)
    const fleetNo = screen.getByRole('textbox', { name: 'Fleet No' })
    await user.clear(fleetNo)
    await user.tab()
    expect(fleetNo).toHaveValue('')
    const required = screen.getByRole('alert')
    expect(required).toHaveTextContent('Required')
    expect(required.closest('label')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Fleet' })).toBeDisabled()
    await user.type(fleetNo, '0')
    await user.tab()
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('Enter 1–25'))).toBe(true)
    expect(screen.getByText('Enter 1–25').closest('label')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Fleet' })).toBeDisabled()
    await user.clear(fleetNo)
    await user.type(fleetNo, '4')
    expect(screen.getByText('261018D-BR1-F04')).toHaveClass('rounded-sm', 'font-semibold')
  })

  it('shows duplicate Fleet No in the field label and clears it after a valid replacement', async () => {
    const user = userEvent.setup()
    render(<ActiveFleetAddSheet onClose={vi.fn()} />)
    await chooseCompanyAndPile(user)
    const fleetNo = screen.getByRole('textbox', { name: 'Fleet No' })
    await user.clear(fleetNo)
    await user.type(fleetNo, '3')
    await user.tab()
    expect(screen.getByText('Duplicate Number')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Fleet' })).toBeDisabled()
    await user.clear(fleetNo)
    await user.type(fleetNo, '4')
    expect(screen.queryByText('Duplicate Number')).not.toBeInTheDocument()
  })

  it('shows persisted Fleet Reference details without inventing Exca history', async () => {
    const user = userEvent.setup()
    render(<ActiveFleetAddSheet onClose={vi.fn()} />)
    await chooseCompanyAndPile(user)
    await user.click(screen.getByRole('button', { name: 'Fleet Reference' }))
    const reference = screen.getByRole('button', { name: /F 03/ })
    expect(reference).toHaveClass('grid', 'grid-cols-[minmax(0,1fr)_auto]', 'py-1.5')
    expect(reference).toHaveTextContent('Exc_0369')
    expect(reference).toHaveTextContent('1 Truck')
    expect(reference).toHaveTextContent('S5_01')
  })

  it('shows only the most recent Exca assignment transition in the compact reference row', async () => {
    mocks.referenceExca = 'HA1-Exc_0564'
    mocks.referenceExcaHistory = [
      { previousExcaCode: 'HA1-Exc_0123', excaCode: 'HA1-Exc_0354', effectiveAt: new Date('2026-10-18T01:00:00Z') },
      { previousExcaCode: 'HA1-Exc_0354', excaCode: 'HA1-Exc_0564', effectiveAt: new Date('2026-10-18T02:00:00Z') },
    ]
    const user = userEvent.setup()
    render(<ActiveFleetAddSheet onClose={vi.fn()} />)
    await chooseCompanyAndPile(user)
    await user.click(screen.getByRole('button', { name: 'Fleet Reference' }))
    const reference = screen.getByRole('button', { name: /F 03/ })
    expect(reference).toHaveTextContent('Exc: 0354 → 0564')
    expect(reference).not.toHaveTextContent('0123')
  })

  it('uses a red soft count only for Removed trucks and preserves the green Selected count', async () => {
    const user = userEvent.setup()
    render(<ActiveFleetAddSheet onClose={vi.fn()} />)
    await chooseCompanyAndPile(user)
    await user.click(screen.getByRole('button', { name: 'Fleet Reference' }))
    await user.click(screen.getByRole('button', { name: /F 03/ }))
    await user.click(screen.getByRole('button', { name: 'Remove T1' }))
    const removed = screen.getByText('Removed').closest('h3')
    const selected = screen.getByText('Selected Trucks').closest('h3')
    expect(within(removed!).getByText('1 Truck')).toHaveClass('text-danger', 'bg-danger/10')
    expect(within(selected!).getByText('0 Trucks')).toHaveClass('text-focus-accent', 'bg-focus-accent-soft')
    expect(removed?.parentElement).not.toHaveClass('border')
    expect(removed?.parentElement?.querySelector('[data-ui="active-fleet-truck-list-frame"]')).toHaveClass('border')
  })

  it('does not close from backdrop or Escape, but the explicit X closes it', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ActiveFleetAddSheet onClose={onClose} />)
    await user.click(document.querySelector('[data-ui="add-fleet-backdrop"]')!)
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Close Add Fleet' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('hands a valid selected-truck draft to the existing persistence command and stays open on failure', async () => {
    const user = userEvent.setup()
    render(<ActiveFleetAddSheet onClose={vi.fn()} />)
    await chooseCompanyAndPile(user)
    await user.click(screen.getByRole('button', { name: 'Fleet Reference' }))
    await user.click(screen.getByRole('button', { name: /F 03/ }))
    await user.click(screen.getByRole('button', { name: 'Save Fleet' }))
    await waitFor(() => expect(mocks.persistFleet).toHaveBeenCalledOnce())
    expect(screen.getByRole('dialog', { name: 'Add Fleet' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('WRITE_FAILED')
  })
})
