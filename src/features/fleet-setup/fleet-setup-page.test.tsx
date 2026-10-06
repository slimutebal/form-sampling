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
  const company = value(parseHaulerCode('STM'))
  const ore = value(parseOreCode('SAP'))
  return value(createMasterData({
    employees: [], crews: [], locations: [], samplingHouses: [], sectors: [createSectorReference(sector)], haulers: [createHaulerReference(company)],
    trucks: [createTruckReference(value(parseTruckId('DT-001')), company)],
    pileAreas: [createPileAreaReference(sector, value(parsePileAreaCode('STOCK-1')), value(parsePileId('S5_24')), ore)],
    oreSamplingConfigs: [createOreSamplingConfig({ oreCode: ore, interval: value(parseSamplingInterval(2)), batchSize: value(parseBatchSize(20)), packing: value(parsePackingConfigValue(2)) })],
  }))
}

function shift(): Shift {
  return createShift({ id: value(parseShiftId('SHIFT-1')), date: value(parseShiftDate('2026-09-28')), shiftCode: value(parseShiftCode('D')), sectorCode: value(parseSectorCode('BR1')), samplingHouseCode: value(parseSamplingHouseCode('SH1')), status: 'NEW' })
}

async function addFleet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '+ Fleet' }))
  await user.type(screen.getByLabelText('Kode Front'), '01')
  await user.click(screen.getByRole('button', { name: 'BR1/01' }))
  await user.selectOptions(screen.getByLabelText('Company'), 'STM')
  await user.type(screen.getByLabelText('Search Pile / Stockpile'), 'S5_24')
  await user.click(screen.getByRole('button', { name: /S5_24/ }))
  await user.type(screen.getByLabelText('Nomor Lambung Exca'), '23')
  await user.type(screen.getByLabelText('Search Unit Truck'), 'DT-001')
  await user.click(screen.getByRole('button', { name: 'DT-001' }))
  await user.click(screen.getByRole('button', { name: 'Simpan Fleet' }))
}

describe('FleetSetupPage', () => {
  it('uses the fixed Fleet setup layout, context values, and a bottom + Fleet action', () => {
    renderFleetSetup({ shift: shift(), masterData: buildMasterData(), onFleetSetupReady: vi.fn(), eligibleDestinationPileIds: [value(parsePileId('S5_24'))] })
    expect(screen.getByRole('heading', { name: 'FLEET SETUP' })).toBeInTheDocument()
    expect(screen.getByText('BR1')).toHaveClass('text-emerald-700')
    expect(screen.getByText('28-Sep-2026')).toBeInTheDocument()
    expect(screen.getByText('Day Shift')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Review Fleet Setup/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Fleet' })).toBeInTheDocument()
  })

  it('opens the Tambah Fleet modal, requires canonical Exca input, and renders display-only Exca after save', async () => {
    const user = userEvent.setup()
    renderFleetSetup({ shift: shift(), masterData: buildMasterData(), onFleetSetupReady: vi.fn(), eligibleDestinationPileIds: [value(parsePileId('S5_24'))] })
    await user.click(screen.getByRole('button', { name: '+ Fleet' }))
    expect(screen.getByRole('dialog', { name: 'TAMBAH FLEET' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Sector')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Company')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Simpan Fleet' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Destination')

    await user.click(screen.getByRole('button', { name: 'Batal' }))
    await addFleet(user)
    expect(screen.getByText('Exc_0023')).toBeInTheDocument()
    expect(screen.queryByText('STM-Exc_0023')).not.toBeInTheDocument()
    expect(screen.getByText('1 Fleet')).toBeInTheDocument()
  }, 15_000)

  it('limits destination candidates to active registered Pile IDs', async () => {
    const user = userEvent.setup()
    renderFleetSetup({ shift: shift(), masterData: buildMasterData(), onFleetSetupReady: vi.fn(), eligibleDestinationPileIds: [] })
    await user.click(screen.getByRole('button', { name: '+ Fleet' }))
    await user.type(screen.getByLabelText('Search Pile / Stockpile'), 'S5_24')
    expect(screen.queryByRole('button', { name: /S5_24/ })).not.toBeInTheDocument()
  })
})
