import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import { parseOreCode, parseSamplingHouseCode, parseSectorCode } from '@/domain/common/codes'
import { parseEmployeeId, parsePileId, parseTruckId } from '@/domain/common/identifiers'
import { parseCrewCode, parseHaulerCode, parsePileAreaCode } from '@/domain/master/master-codes'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import {
  createHaulerReference,
  createCrewReference,
  createEmployeeReference,
  createPileAreaReference,
  createSamplingHouseReference,
  createSectorReference,
  createTruckReference,
} from '@/domain/master/references'
import { createOreSamplingConfig, parseBatchSize, parsePackingConfigValue, parseSamplingInterval } from '@/domain/master/sampling-config'
import i18n from '@/i18n'
import { clearPreShiftSetupSession } from '@/infrastructure/device/pre-shift-setup-session-store'
import { clearWorkSetupDraft } from '@/infrastructure/device/work-setup-draft-store'
import { StartPage } from './StartPage'

function must<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value as T
}

function buildLargeCatalogMasterData(): MasterData {
  const br1 = must(parseSectorCode('BR1'))
  const sh01 = must(parseSamplingHouseCode('SH_01'))
  const h1 = must(parseHaulerCode('H1'))
  const sap = must(parseOreCode('SAP'))
  const manyPileAreas = Array.from({ length: 500 }, (_, index) =>
    createPileAreaReference(br1, must(parsePileAreaCode('STOCK-1')), must(parsePileId(`PILE-${index + 1}`)), sap),
  )
  return must(
    createMasterData({
      employees: [createEmployeeReference(must(parseEmployeeId('RAHARJO-1')), 'Raharjo Rahman', 'Supervisor')],
      crews: [createCrewReference(must(parseCrewCode('CREW-1')), 'Crew One', 'Sampler')],
      sectors: [createSectorReference(br1)],
      locations: [],
      samplingHouses: [createSamplingHouseReference(br1, sh01)],
      pileAreas: manyPileAreas,
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
          <Route path="/start/*" element={<StartPage />} />
          <Route path="/production" element={<div>PRODUCTION_PAGE_MARKER</div>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('StartPage setup orchestration — large master pile catalog', () => {
  beforeEach(async () => {
    clearPreShiftSetupSession()
    clearWorkSetupDraft()
    await i18n.changeLanguage('en')
    await localOperationalStore.replaceMasterDataCache(buildLargeCatalogMasterData(), new Date('2026-09-04'))
  })

  it('a Sector with 500 master pile areas initializes only the selected Pile', async () => {
    const user = userEvent.setup()
    renderStartPage()

    await screen.findByLabelText('Shift Date')
    fireEvent.change(screen.getByLabelText('Shift Date'), { target: { value: '2026-09-04' } })
    await user.click(screen.getByRole('combobox', { name: 'Shift Code' }))
    await user.click(screen.getByRole('option', { name: 'D' }))
    await user.click(screen.getByRole('combobox', { name: 'Sector' }))
    await user.click(screen.getByRole('option', { name: 'BR1' }))
    await user.click(screen.getByRole('combobox', { name: 'Sampling House' }))
    await user.click(screen.getByRole('option', { name: 'SH_01' }))
    await user.type(screen.getByLabelText('Search NIK / Name'), 'Raharjo')
    await user.click(await screen.findByRole('button', { name: /Raharjo Rahman/ }))
    await user.type(screen.getByLabelText('Search NIK / Name'), 'Crew One')
    await user.click(await screen.findByRole('button', { name: /Crew One/ }))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByRole('heading', { name: 'Production Data Setup' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /^Create New Production\b/i }))
    await user.type(screen.getByLabelText('Cari Pile/Stockpile'), 'PILE-1')
    await user.click(await screen.findByRole('button', { name: /^PILE-1\s+\D/ }))
    await user.type(screen.getByLabelText('Batch'), '001')
    await user.type(screen.getByLabelText('Trip'), '001')
    await user.click(screen.getByRole('button', { name: 'Add Sample' }))
    await user.click(await screen.findByRole('button', { name: /^Next/ }))

    await user.click(screen.getByRole('button', { name: '+ Fleet' }))
    await user.click(screen.getByRole('combobox', { name: 'Company' }))
    await user.click(screen.getByRole('option', { name: 'H1' }))
    await user.type(screen.getByLabelText('Pile ID'), 'PILE-1')
    await user.click(screen.getByRole('button', { name: /^PILE-1\s+\D/ }))
    expect(screen.getByText('BR1/01')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Exca Hull Number'), '1')
    await user.type(screen.getByLabelText('Truck'), 'T1')
    await user.click(screen.getByRole('button', { name: 'T1' }))
    await user.click(screen.getByRole('button', { name: 'Save Fleet' }))

    await user.click(await screen.findByRole('button', { name: /^Next/ }))
    expect(await screen.findByRole('heading', { name: 'WORK SETUP REVIEW' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Finish Setup' }))
    await screen.findByText('PRODUCTION_PAGE_MARKER')

    const workspace = await localOperationalStore.loadCurrentShiftWorkspace()
    if (!workspace.ok || !workspace.value) throw new Error('expected an initialized workspace')
    expect(workspace.value.piles.map((pile) => pile.id)).toEqual(['PILE-1'])
    expect(workspace.value.masterData.pileAreas).toHaveLength(500)
  }, 15_000)
})
