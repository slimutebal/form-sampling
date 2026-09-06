import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import { parseOreCode, parseSectorCode } from '@/domain/common/codes'
import { parseEmployeeId, parsePileId } from '@/domain/common/identifiers'
import { parseHaulerCode, parsePileAreaCode } from '@/domain/master/master-codes'
import { parseTruckId } from '@/domain/common/identifiers'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import {
  createEmployeeReference,
  createHaulerReference,
  createPileAreaReference,
  createSamplingHouseReference,
  createSectorReference,
  createTruckReference,
} from '@/domain/master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '@/domain/master/sampling-config'
import { parseSamplingHouseCode } from '@/domain/common/codes'
import i18n from '@/i18n'
import { StartPage } from './StartPage'

function must<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value as T
}

function buildMasterData(): MasterData {
  const br1 = must(parseSectorCode('BR1'))
  const sh01 = must(parseSamplingHouseCode('SH_01'))
  const h1 = must(parseHaulerCode('H1'))
  const sap = must(parseOreCode('SAP'))
  return must(
    createMasterData({
      employees: [createEmployeeReference(must(parseEmployeeId('RAHARJO-1')), 'Raharjo Rahman')],
      crews: [],
      sectors: [createSectorReference(br1)],
      locations: [],
      samplingHouses: [createSamplingHouseReference(br1, sh01)],
      pileAreas: [createPileAreaReference(br1, must(parsePileAreaCode('STOCK-1')), must(parsePileId('PILE-1')), sap)],
      haulers: [createHaulerReference(h1)],
      trucks: [createTruckReference(must(parseTruckId('T1')), h1)],
      oreSamplingConfigs: [
        createOreSamplingConfig({
          oreCode: sap,
          interval: must(parseSamplingInterval(2)),
          batchSize: must(parseBatchSize(20)),
          packing: must(parsePackingConfigValue(2)),
        }),
      ],
    }),
  )
}

function renderStartPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/start']}>
        <Routes>
          <Route path="/start" element={<StartPage />} />
          <Route path="/home" element={<div>HOME_PAGE_MARKER</div>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

async function fillRegistration(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByLabelText('Shift Date')
  fireEvent.change(screen.getByLabelText('Shift Date'), { target: { value: '2026-09-04' } })
  fireEvent.change(screen.getByLabelText('Shift Code'), { target: { value: 'DS' } })
  fireEvent.change(screen.getByLabelText('Sector'), { target: { value: 'BR1' } })
  fireEvent.change(screen.getByLabelText('Sampling House'), { target: { value: 'SH_01' } })
  await user.click(screen.getByRole('button', { name: 'Review Registration' }))
  await screen.findByText('Registration is ready for setup.')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

async function completeManpower(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: 'Shift Manpower' })
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

async function completeFleetSetupAndInitialize(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('button', { name: 'Add Front' })
  await user.click(screen.getByRole('button', { name: 'Add Front' }))
  await user.selectOptions(screen.getByLabelText('Front No'), '01')
  await user.selectOptions(screen.getByLabelText('Hauler'), 'H1')
  await user.selectOptions(screen.getByLabelText('Add Truck'), 'T1')
  await user.click(screen.getByRole('button', { name: 'Add Truck' }))
  await user.click(screen.getByRole('button', { name: 'Save Front' }))
  await user.click(screen.getByRole('button', { name: 'Review Fleet Setup' }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

describe('StartPage setup orchestration', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    await localOperationalStore.replaceMasterDataCache(buildMasterData(), new Date('2026-09-04'))
  })

  it('A. registration -> Continue advances into Handover, never dead-ending on the review screen', async () => {
    const user = userEvent.setup()
    renderStartPage()

    await fillRegistration(user)

    expect(await screen.findByRole('heading', { name: 'Previous Shift' })).toBeInTheDocument()
  })

  it('B. the Start Without Previous Shift path continues to Fleet Setup, then initializes and navigates to /home', async () => {
    const user = userEvent.setup()
    renderStartPage()

    await fillRegistration(user)
    await user.click(await screen.findByRole('button', { name: 'Start Without Previous File' }))

    await completeManpower(user)

    expect(await screen.findByRole('heading', { name: 'Fleet Setup' })).toBeInTheDocument()

    await completeFleetSetupAndInitialize(user)

    expect(await screen.findByText('HOME_PAGE_MARKER')).toBeInTheDocument()

    const workspace = await localOperationalStore.loadCurrentShiftWorkspace()
    expect(workspace.ok).toBe(true)
    if (!workspace.ok || !workspace.value) throw new Error('expected an initialized workspace')
    expect(workspace.value.shift.shiftCode).toBe('DS')
    // No handover was imported, so the workspace must start with zero
    // active piles — masterData.pileAreas (which has PILE-1 for BR1) is
    // a selection catalog, never preloaded wholesale (Phase 18
    // correction).
    expect(workspace.value.piles).toEqual([])
    expect(workspace.value.fleetSetup.fronts).toHaveLength(1)
    // No Manpower was added on this path — the workspace must still
    // initialize with an empty (not undefined) manpower list.
    expect(workspace.value.manpower).toEqual([])
  })
})
