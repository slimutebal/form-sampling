import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { parseOreCode, parseSamplingHouseCode, parseSectorCode, parseShiftCode } from '@/domain/common/codes'
import { parsePileId, parseShiftId } from '@/domain/common/identifiers'
import { parseShiftDate } from '@/domain/common/shift-date'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { parsePileAreaCode } from '@/domain/master/master-codes'
import { createPileAreaReference, createSectorReference } from '@/domain/master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '@/domain/master/sampling-config'
import { createShift, type Shift } from '@/domain/shift/shift'
import type { PileRegistrationDraft } from '@/application/pile-registration/pile-registration-draft'
import { PileRegistrationPage } from './pile-registration-page'

function must<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid fixture')
  return result.value as T
}

function masterData(): MasterData {
  const sector = must(parseSectorCode('S5'))
  const sap = must(parseOreCode('SAP'))
  return must(createMasterData({
    employees: [], crews: [], sectors: [createSectorReference(sector)], locations: [], samplingHouses: [], haulers: [], trucks: [],
    pileAreas: [
      createPileAreaReference(sector, must(parsePileAreaCode('STOCK-A')), must(parsePileId('S5_24')), sap),
      createPileAreaReference(sector, must(parsePileAreaCode('STOCK-B')), must(parsePileId('S5_26')), sap),
    ],
    oreSamplingConfigs: [createOreSamplingConfig({ oreCode: sap, interval: must(parseSamplingInterval(2)), batchSize: must(parseBatchSize(20)), packing: must(parsePackingConfigValue(2)) })],
  }))
}

function shift(): Shift {
  return createShift({
    id: must(parseShiftId('SHIFT-1')), date: must(parseShiftDate('2026-09-04')), shiftCode: must(parseShiftCode('D')),
    sectorCode: must(parseSectorCode('S5')), samplingHouseCode: must(parseSamplingHouseCode('SH-1')), status: 'NEW',
  })
}

function registration(batch: number, rit = batch, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE'): PileRegistrationDraft {
  return {
    pileId: must(parsePileId('S5_24')), oreCode: must(parseOreCode('SAP')), batch: must(parseBatchNumber(batch)), rit: must(parseRitNumber(rit)), status,
  }
}

function renderPage(initialRegistrations: readonly PileRegistrationDraft[] = []) {
  const onRegistrationsChange = vi.fn()
  const onRegistrationsReady = vi.fn()
  const onBack = vi.fn()
  render(<PileRegistrationPage shift={shift()} masterData={masterData()} initialRegistrations={initialRegistrations} onRegistrationsChange={onRegistrationsChange} onRegistrationsReady={onRegistrationsReady} onBack={onBack} />)
  return { onRegistrationsChange, onRegistrationsReady, onBack }
}

async function selectPile(user: ReturnType<typeof userEvent.setup>, query: string, pileId = 'S5_24') {
  await user.type(screen.getByLabelText('Cari Pile/Stockpile'), query)
  await user.click(screen.getByRole('button', { name: new RegExp(`^${pileId}`) }))
}

async function fillEntry(user: ReturnType<typeof userEvent.setup>, batch: string, rit: string, status = 'ACTIVE') {
  await user.type(screen.getByLabelText('Batch'), batch)
  await user.type(screen.getByLabelText('Trip'), rit)
  await user.selectOptions(screen.getByLabelText('Status'), status)
}

describe('PileRegistrationPage', () => {
  it('renders registered rows with a count, and the left-hand red x removes the selected row', async () => {
    const user = userEvent.setup()
    const { onRegistrationsChange } = renderPage([registration(8), registration(6, 6, 'INACTIVE')])

    expect(screen.getByRole('heading', { name: 'SAMPLE SETUP' })).toBeInTheDocument()
    expect(screen.getByText('2 Samples')).toBeInTheDocument()
    expect(screen.getAllByText('008')).toHaveLength(2)
    expect(screen.getByRole('cell', { name: 'Active' }).closest('tr')).toHaveClass('text-emerald-700')
    const inactiveRow = screen.getByRole('cell', { name: 'Inactive' }).closest('tr')
    expect(inactiveRow).toHaveClass('text-red-700')
    await user.click(screen.getByRole('button', { name: 'Remove S5_24 batch 006' }))

    expect(onRegistrationsChange).toHaveBeenLastCalledWith([registration(8)])
  })

  it('searches master Piles by Pile ID and Stockpile, then adds a selected master row and clears the entry', async () => {
    const user = userEvent.setup()
    const { onRegistrationsChange } = renderPage()

    expect(screen.getByLabelText('Status')).toHaveValue('ACTIVE')
    await selectPile(user, 'STOCK-A')
    await fillEntry(user, '008', '006', 'INACTIVE')
    expect(screen.getByLabelText('Sample progress')).toHaveTextContent('3 / 10 Incr')
    expect(screen.getByLabelText('Sample progress')).toHaveTextContent('3 Sample In House')
    await user.click(screen.getByRole('button', { name: 'Add Sample' }))

    expect(onRegistrationsChange).toHaveBeenLastCalledWith([registration(8, 6, 'INACTIVE')])
    expect(screen.getByText('008')).toBeInTheDocument()
    expect(screen.getByLabelText('Cari Pile/Stockpile')).toHaveValue('')
    expect(screen.getByLabelText('Batch')).toHaveValue('')
    expect(screen.getByLabelText('Trip')).toHaveValue('')
    expect(screen.getByLabelText('Status')).toHaveValue('ACTIVE')
  })

  it('requires a selected master Pile, Batch, and Trip', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText('Cari Pile/Stockpile'), 'made-up')
    await user.click(screen.getByRole('button', { name: 'Add Sample' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Select a Pile')

    await user.clear(screen.getByLabelText('Cari Pile/Stockpile'))
    await selectPile(user, 'S5_24')
    await user.click(screen.getByRole('button', { name: 'Add Sample' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Batch is required')
    await user.type(screen.getByLabelText('Batch'), '2')
    await user.click(screen.getByRole('button', { name: 'Add Sample' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Trip is required')
    await user.type(screen.getByLabelText('Trip'), '2')
    expect(screen.getByLabelText('Status')).toHaveValue('ACTIVE')
  })

  it('allows the same Pile ID with another Batch but rejects the same Pile ID + Batch', async () => {
    const user = userEvent.setup()
    const { onRegistrationsChange } = renderPage([registration(2)])

    await selectPile(user, 'S5_24')
    await fillEntry(user, '006', '006')
    await user.click(screen.getByRole('button', { name: 'Add Sample' }))
    expect(onRegistrationsChange).toHaveBeenLastCalledWith([registration(2), registration(6)])

    await selectPile(user, 'S5_24')
    await fillEntry(user, '002', '002')
    await user.click(screen.getByRole('button', { name: 'Add Sample' }))
    expect(screen.getByRole('alert')).toHaveTextContent('already registered')
  })

  it('preserves the draft when continuing and invokes Back independently', async () => {
    const user = userEvent.setup()
    const { onBack, onRegistrationsReady } = renderPage([registration(2), registration(6)])
    await user.click(screen.getByRole('button', { name: /Next/ }))
    expect(onRegistrationsReady).toHaveBeenCalledWith([registration(2), registration(6)])
    await user.click(screen.getByRole('button', { name: /Back/ }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('allows continuing without registrations and remains usable after registrations are removed', async () => {
    const user = userEvent.setup()
    renderPage()
    const next = screen.getByRole('button', { name: /Next/ })
    expect(next).toBeEnabled()

    await selectPile(user, 'S5_24')
    await fillEntry(user, '002', '002')
    await user.click(screen.getByRole('button', { name: 'Add Sample' }))
    expect(next).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Remove S5_24 batch 002' }))
    expect(next).toBeEnabled()
  })

  it('renders registrations in natural Pile, Batch, then Rit order', () => {
    renderPage([registration(60, 19), registration(2, 2), registration(6, 16)])
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('002'),
      expect.stringContaining('006'),
      expect.stringContaining('060'),
    ])
  })
})
