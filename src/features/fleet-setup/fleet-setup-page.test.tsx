import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { parseOreCode, parseSamplingHouseCode, parseSectorCode, parseShiftCode } from '@/domain/common/codes'
import { parsePileId, parseShiftId, parseTruckId } from '@/domain/common/identifiers'
import { parseShiftDate } from '@/domain/common/shift-date'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { parseHaulerCode, parsePileAreaCode } from '@/domain/master/master-codes'
import { createHaulerReference, createPileAreaReference, createSectorReference, createTruckReference } from '@/domain/master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '@/domain/master/sampling-config'
import { createShift, type Shift } from '@/domain/shift/shift'
import { FleetSetupPage } from './fleet-setup-page'
import i18n from '@/i18n'

function renderFleetSetup(props: ComponentProps<typeof FleetSetupPage>) {
  return render(<I18nextProvider i18n={i18n}><FleetSetupPage {...props} /></I18nextProvider>)
}

function value<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid fixture')
  return result.value as T
}

function buildMasterData(): MasterData {
  const sector = value(parseSectorCode('BR1'))
  const stm = value(parseHaulerCode('STM'))
  const kpp = value(parseHaulerCode('KPP'))
  const ore = value(parseOreCode('SAP'))
  return value(createMasterData({
    employees: [], crews: [], locations: [], samplingHouses: [], sectors: [createSectorReference(sector)], haulers: [createHaulerReference(stm), createHaulerReference(kpp)],
    trucks: [createTruckReference(value(parseTruckId('DT-001')), stm), createTruckReference(value(parseTruckId('DT-002')), kpp)],
    pileAreas: [
      createPileAreaReference(sector, value(parsePileAreaCode('STOCK-1')), value(parsePileId('S5_24')), ore),
      createPileAreaReference(sector, value(parsePileAreaCode('STOCK-2')), value(parsePileId('S5_26')), ore),
    ],
    oreSamplingConfigs: [createOreSamplingConfig({ oreCode: ore, interval: value(parseSamplingInterval(2)), batchSize: value(parseBatchSize(20)), packing: value(parsePackingConfigValue(2)) })],
  }))
}

function shift(): Shift {
  return createShift({ id: value(parseShiftId('SHIFT-1')), date: value(parseShiftDate('2026-09-28')), shiftCode: value(parseShiftCode('D')), sectorCode: value(parseSectorCode('BR1')), samplingHouseCode: value(parseSamplingHouseCode('SH1')), status: 'NEW' })
}

async function chooseCompany(user: ReturnType<typeof userEvent.setup>, company: 'STM' | 'KPP') {
  await user.click(screen.getByRole('combobox', { name: 'Company' }))
  await user.click(screen.getByRole('option', { name: company }))
}

async function addFleet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '+ Fleet' }))
  await chooseCompany(user, 'STM')
  await user.type(screen.getByLabelText('Pile ID'), 'S5_24')
  await user.click(screen.getByRole('button', { name: /S5_24/ }))
  await user.type(screen.getByLabelText('Nomor Lambung Exca'), '23')
  await user.type(screen.getByLabelText('Truck'), 'DT-001')
  await user.click(screen.getByRole('button', { name: 'DT-001' }))
  await user.click(screen.getByRole('button', { name: 'Simpan Fleet' }))
}

describe('FleetSetupPage', () => {
  it('renders the NEW_BASE Registration sequence without Fleet Reference', async () => {
    const user = userEvent.setup()
    renderFleetSetup({ shift: shift(), masterData: buildMasterData(), onFleetSetupReady: vi.fn(), eligibleDestinationPileIds: [value(parsePileId('S5_24'))] })
    await user.click(screen.getByRole('button', { name: '+ Fleet' }))
    const company = screen.getByRole('combobox', { name: 'Company' })
    const fleetId = screen.getByLabelText('Fleet sequence')
    const pile = screen.getByLabelText('Pile ID')
    const exca = screen.getByLabelText('Nomor Lambung Exca')
    const truck = screen.getByLabelText('Truck')
    const isBefore = (first: Element, second: Element) => (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

    expect(isBefore(company, fleetId)).toBe(true)
    expect(isBefore(fleetId, pile)).toBe(true)
    expect(isBefore(pile, exca)).toBe(true)
    expect(isBefore(exca, truck)).toBe(true)
    expect(screen.queryByRole('combobox', { name: 'Fleet Reference' })).not.toBeInTheDocument()
    expect(fleetId).toBeDisabled()
    expect(pile).toBeDisabled()
    await chooseCompany(user, 'STM')
    expect(screen.getByText('Fleet_01')).toBeInTheDocument()
    expect(screen.getByLabelText('Pile ID')).not.toBeDisabled()
  })

  it('keeps Fleet ID editable and confirms a skipped number', async () => {
    const user = userEvent.setup()
    renderFleetSetup({ shift: shift(), masterData: buildMasterData(), onFleetSetupReady: vi.fn(), eligibleDestinationPileIds: [value(parsePileId('S5_24'))] })
    await user.click(screen.getByRole('button', { name: '+ Fleet' }))
    await chooseCompany(user, 'STM')
    await user.click(screen.getByRole('button', { name: 'Change Fleet sequence' }))
    await user.type(screen.getByLabelText('Fleet sequence'), '02')
    await user.click(screen.getByRole('button', { name: 'Fleet_02' }))
    expect(screen.getByRole('dialog', { name: 'Confirm Fleet sequence' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText('Fleet sequence')).toHaveValue('')
    await user.type(screen.getByLabelText('Fleet sequence'), '02')
    await user.click(screen.getByRole('button', { name: 'Fleet_02' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Fleet_02')).toBeInTheDocument()
  })

  it('filters Piles by Company and resets dependent values', async () => {
    const user = userEvent.setup()
    const eligiblePiles = [value(parsePileId('S5_24')), value(parsePileId('S5_26'))]
    renderFleetSetup({ shift: shift(), masterData: buildMasterData(), onFleetSetupReady: vi.fn(), eligibleDestinationPileIds: eligiblePiles })
    await addFleet(user)
    await user.click(screen.getByRole('button', { name: '+ Fleet' }))
    await chooseCompany(user, 'KPP')
    await user.type(screen.getByLabelText('Pile ID'), 'S5_')
    expect(screen.queryByRole('button', { name: /S5_24/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /S5_26/ })).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Pile ID'))
    await chooseCompany(user, 'STM')
    expect(screen.getByLabelText('Pile ID')).toHaveValue('')
    expect(screen.getByText('No Trucks')).toBeInTheDocument()
    expect(screen.getByText('Fleet_02')).toBeInTheDocument()
  })

  it('places selected Trucks above search and permits same-company Truck reuse', async () => {
    const user = userEvent.setup()
    const changes = vi.fn()
    renderFleetSetup({ shift: shift(), masterData: buildMasterData(), onFleetSetupReady: vi.fn(), onEntriesChange: changes, eligibleDestinationPileIds: [value(parsePileId('S5_24')), value(parsePileId('S5_26'))] })
    await addFleet(user)
    await user.click(screen.getByRole('button', { name: '+ Fleet' }))
    await chooseCompany(user, 'STM')
    await user.type(screen.getByLabelText('Pile ID'), 'S5_26')
    await user.click(screen.getByRole('button', { name: /S5_26/ }))
    await user.type(screen.getByLabelText('Nomor Lambung Exca'), '24')
    const selectedBox = screen.getByText('No Trucks')
    const truck = screen.getByLabelText('Truck')
    expect((selectedBox.compareDocumentPosition(truck) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true)
    await user.type(truck, 'DT-001')
    await user.click(screen.getByRole('button', { name: 'DT-001' }))
    expect(screen.getByText('1 Truck')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Simpan Fleet' }))
    const latestEntries = changes.mock.calls[changes.mock.calls.length - 1]?.[0] as readonly { kind: string; referenceFleetId: string; truckIds: readonly string[] }[]
    expect(latestEntries).toHaveLength(2)
    expect(latestEntries[1]).toMatchObject({ kind: 'BASE', referenceFleetId: '', truckIds: ['DT-001'] })
  })

  it('keeps a saved BASE Fleet editable and deletion-confirmed', async () => {
    const user = userEvent.setup()
    renderFleetSetup({ shift: shift(), masterData: buildMasterData(), onFleetSetupReady: vi.fn(), eligibleDestinationPileIds: [value(parsePileId('S5_24'))] })
    await addFleet(user)
    await user.click(screen.getByRole('button', { name: 'Fleet actions Fleet_01' }))
    await user.click(screen.getByRole('menuitem', { name: 'Ubah Fleet' }))
    expect(screen.getByRole('dialog', { name: /^(UBAH|EDIT) FLEET$/ })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Fleet Reference' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Batal' }))
    await user.click(screen.getByRole('button', { name: 'Fleet actions Fleet_01' }))
    await user.click(screen.getByRole('menuitem', { name: 'Hapus Fleet' }))
    expect(screen.getByRole('dialog', { name: 'Hapus Fleet' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Batal' }))
    expect(screen.getByText('1 Fleet')).toBeInTheDocument()
  })
})
