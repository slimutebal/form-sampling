import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import { parseOreCode, parseSectorCode } from '@/domain/common/codes'
import { parseEmployeeId, parsePileId } from '@/domain/common/identifiers'
import { parseCrewCode, parseHaulerCode, parsePileAreaCode } from '@/domain/master/master-codes'
import { parseTruckId } from '@/domain/common/identifiers'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import {
  createEmployeeReference,
  createCrewReference,
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
import { clearPreShiftSetupSession, readPreShiftSetupSession } from '@/infrastructure/device/pre-shift-setup-session-store'
import { clearWorkSetupDraft } from '@/infrastructure/device/work-setup-draft-store'
import { DEFAULT_LOCAL_DATABASE_NAME } from '@/infrastructure/local-db/database'

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
      employees: [createEmployeeReference(must(parseEmployeeId('RAHARJO-1')), 'Raharjo Rahman', 'Supervisor')],
      crews: [createCrewReference(must(parseCrewCode('CREW-1')), 'Crew One', 'Sampler')],
      sectors: [createSectorReference(br1)],
      locations: [],
      samplingHouses: [createSamplingHouseReference(br1, sh01)],
      pileAreas: [createPileAreaReference(br1, must(parsePileAreaCode('STOCK-1')), must(parsePileId('PILE-1')), sap)],
      haulers: [createHaulerReference(h1)],
      trucks: [
        createTruckReference(must(parseTruckId('T1')), h1),
        createTruckReference(must(parseTruckId('T2')), h1),
      ],
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

function BrowserBackControl() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(-1)}>Browser Back</button>
}

function appBackButton() {
  return screen.getByRole('button', { name: /^\u2190 Back$/ })
}

async function resetStartPageTestDatabase() {
  // Some cases intentionally initialize an active workspace. Each case must
  // start from a clean test database so that workspace cannot affect another
  // case's Work Setup route. Do not call localOperationalStore.close() here:
  // Dexie's default close() disables autoOpen on the shared store. The next
  // cache write would then fail with DatabaseClosedError and Work Setup would
  // correctly render its local-data error state instead of the form.
  // Dexie.delete() notifies an open shared connection via versionchange and
  // that path keeps autoOpen enabled for the next isolated test database.
  await Dexie.delete(DEFAULT_LOCAL_DATABASE_NAME)
}

function renderStartPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[{ pathname: '/start', state: { forceNew: true, setupChecker: { personId: 'RAHARJO-1', name: 'Raharjo Rahman', source: 'EMPLOYEE' } } }]}>
        <BrowserBackControl />
        <Routes>
          <Route path="/start/*" element={<StartPage />} />
          <Route path="/production" element={<div>PRODUCTION_PAGE_MARKER</div>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

function renderRecoveredStartPage(initialPath: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialPath]}>
        <BrowserBackControl />
        <Routes>
          <Route path="/start/*" element={<StartPage />} />
          <Route path="/production" element={<div>PRODUCTION_PAGE_MARKER</div>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

async function fillRegistration(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByLabelText('Shift Date')
  fireEvent.change(screen.getByLabelText('Shift Date'), { target: { value: '2026-09-04' } })
  await user.click(screen.getByRole('combobox', { name: 'Shift Code' }))
  await user.click(screen.getByRole('option', { name: 'D' }))
  await user.click(screen.getByRole('combobox', { name: 'Sector' }))
  await user.click(screen.getByRole('option', { name: 'BR1' }))
  await user.click(screen.getByRole('combobox', { name: 'Sampling House' }))
  await user.click(screen.getByRole('option', { name: 'SH_01' }))
  expect(screen.getByTestId('work-setup-roster')).toHaveTextContent('Raharjo Rahman')
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  await user.type(screen.getByLabelText('Search NIK / Name'), 'Crew One')
  await user.click(await screen.findByRole('button', { name: /Crew One/ }))
  await user.click(screen.getByRole('button', { name: /^Next/ }))
  expect(await screen.findByRole('heading', { name: 'Production Data Setup' })).toBeInTheDocument()
}

async function createNewProduction(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Create New Production\b/i }))
}

async function completeFleetSetupAndInitialize(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Next/ }))
  expect(await screen.findByRole('heading', { name: 'WORK SETUP REVIEW' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Finish Setup' }))
}

async function continuePileRegistration(user: ReturnType<typeof userEvent.setup>) {
  expect(await screen.findByRole('heading', { name: 'SAMPLE SETUP' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /^Next/ }))
}

async function addPileRegistration(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: 'SAMPLE SETUP' })
  await user.type(screen.getByLabelText('Cari Pile/Stockpile'), 'PILE-1')
  await user.click(screen.getByRole('button', { name: /^PILE-1/ }))
  await user.type(screen.getByLabelText('Batch'), '001')
  await user.type(screen.getByLabelText('Trip'), '001')
  await user.click(screen.getByRole('button', { name: 'Add Sample' }))
  await user.click(screen.getByRole('button', { name: /^Next/ }))
}

async function addFleet(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: 'FLEET SETUP' })
  await user.click(screen.getByRole('button', { name: '+ Fleet' }))
  await user.click(screen.getByRole('combobox', { name: 'Company' }))
  await user.click(screen.getByRole('option', { name: 'H1' }))
  await user.type(screen.getByLabelText('Pile ID'), 'PILE-1')
  await user.click(screen.getByRole('option', { name: /^PILE-1/ }))
  await user.type(screen.getByLabelText('Exca Hull Number'), '1')
  await user.type(screen.getByLabelText('Truck'), 'T1')
  await user.click(screen.getByRole('button', { name: 'T1' }))
  expect(screen.getByRole('button', { name: 'Remove T1' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Save Fleet' }))
}

describe('StartPage setup orchestration', () => {
  beforeEach(async () => {
    await resetStartPageTestDatabase()
    clearPreShiftSetupSession()
    clearWorkSetupDraft()
    await i18n.changeLanguage('en')
    const cached = await localOperationalStore.replaceMasterDataCache(buildMasterData(), new Date('2026-09-04'))
    expect(cached).toEqual({ ok: true, value: undefined })
    expect(await localOperationalStore.loadCurrentShiftWorkspace()).toEqual({ ok: true, value: undefined })
  })

  it('A. Work Setup Next advances into Production Data Setup', async () => {
    const user = userEvent.setup()
    renderStartPage()

    await fillRegistration(user)

    expect(await screen.findByRole('heading', { name: 'Production Data Setup' })).toBeInTheDocument()
  })

  it('B. the Start Without Previous Shift path continues through Pile Registration to Fleet Setup, then initializes and navigates to /production', async () => {
    const user = userEvent.setup()
    renderStartPage()

    await fillRegistration(user)
    await createNewProduction(user)

    await addPileRegistration(user)
    expect(await screen.findByRole('heading', { name: 'FLEET SETUP' })).toBeInTheDocument()

    await addFleet(user)
    await completeFleetSetupAndInitialize(user)

    expect(await screen.findByText('PRODUCTION_PAGE_MARKER')).toBeInTheDocument()

    const workspace = await localOperationalStore.loadCurrentShiftWorkspace()
    expect(workspace.ok).toBe(true)
    if (!workspace.ok || !workspace.value) throw new Error('expected an initialized workspace')
    expect(workspace.value.shift.shiftCode).toBe('D')
    // No handover was imported, so the workspace must start with zero
    // active piles — masterData.pileAreas (which has PILE-1 for BR1) is
    // a selection catalog, never preloaded wholesale (Phase 18
    // correction).
    expect(workspace.value.piles.map((pile) => pile.id)).toEqual(['PILE-1'])
    expect(workspace.value.fleetSetup.fronts).toHaveLength(1)
    // The selected Pengawas and Crew are carried into the activated workspace.
    expect(workspace.value.manpower).toHaveLength(2)
    expect(workspace.value.manpower[0]?.jobDeskCode).toBe('Checker')
  })

  it('keeps setup Back transitions in the ordered pre-shift flow', async () => {
    const user = userEvent.setup()
    renderStartPage()

    await fillRegistration(user)
    await createNewProduction(user)
    await continuePileRegistration(user)
    expect(await screen.findByRole('heading', { name: 'FLEET SETUP' })).toBeInTheDocument()

    await user.click(appBackButton())
    expect(await screen.findByRole('heading', { name: 'SAMPLE SETUP' })).toBeInTheDocument()

    await user.click(appBackButton())
    expect(await screen.findByRole('heading', { name: 'Production Data Setup' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Back$/ }))
    expect(await screen.findByLabelText('Shift Date')).toHaveValue('2026-09-04')
  })

  it('returns from Work Setup Review to Fleet Setup, then Pile Setup, without recreating the Review page', async () => {
    const user = userEvent.setup()
    renderStartPage()

    await fillRegistration(user)
    await createNewProduction(user)
    await addPileRegistration(user)
    await addFleet(user)
    await user.click(screen.getByRole('button', { name: /^Next/ }))
    expect(await screen.findByRole('heading', { name: 'WORK SETUP REVIEW' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to Fleet' }))
    expect(await screen.findByRole('heading', { name: 'FLEET SETUP' })).toBeInTheDocument()
    await user.click(appBackButton())
    expect(await screen.findByRole('heading', { name: 'SAMPLE SETUP' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'WORK SETUP REVIEW' })).not.toBeInTheDocument()
  })

  it('advances deterministically from Pile Setup to Fleet Setup to Work Setup Review', async () => {
    const user = userEvent.setup()
    renderStartPage()

    await fillRegistration(user)
    await createNewProduction(user)
    await addPileRegistration(user)
    expect(await screen.findByRole('heading', { name: 'FLEET SETUP' })).toBeInTheDocument()
    await addFleet(user)
    await user.click(screen.getByRole('button', { name: /^Next/ }))
    expect(await screen.findByRole('heading', { name: 'WORK SETUP REVIEW' })).toBeInTheDocument()
  })

  it('preserves Fleet draft edits while returning through Pile Setup', async () => {
    const user = userEvent.setup()
    renderStartPage()

    await fillRegistration(user)
    await createNewProduction(user)
    await addPileRegistration(user)
    await addFleet(user)
    await user.click(screen.getByRole('button', { name: /^Next/ }))
    await screen.findByRole('heading', { name: 'WORK SETUP REVIEW' })
    await user.click(screen.getByRole('button', { name: 'Back to Fleet' }))
    await user.click(screen.getByRole('button', { name: 'Fleet actions Fleet_01' }))
    await user.click(screen.getByRole('menuitem', { name: 'Ubah Fleet' }))
    expect(screen.getByRole('button', { name: 'Remove T1' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Truck'), 'T2')
    await user.click(screen.getByRole('button', { name: 'T2' }))
    expect(screen.getByRole('button', { name: 'Remove T2' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save Fleet' }))

    await user.click(appBackButton())
    expect(await screen.findByRole('heading', { name: 'SAMPLE SETUP' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Next/ }))
    await screen.findByRole('heading', { name: 'FLEET SETUP' })
    await user.click(screen.getByRole('button', { name: 'Fleet actions Fleet_01' }))
    await user.click(screen.getByRole('menuitem', { name: 'Ubah Fleet' }))
    expect(screen.getByRole('button', { name: 'Remove T1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove T2' })).toBeInTheDocument()
  })

  it('lets native browser Back move from Review to Fleet to Pile without a Review/Fleet bounce', async () => {
    const user = userEvent.setup()
    renderStartPage()

    await fillRegistration(user)
    await createNewProduction(user)
    await addPileRegistration(user)
    await addFleet(user)
    await user.click(screen.getByRole('button', { name: /^Next/ }))
    await screen.findByRole('heading', { name: 'WORK SETUP REVIEW' })

    await user.click(screen.getByRole('button', { name: 'Browser Back' }))
    expect(await screen.findByRole('heading', { name: 'FLEET SETUP' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Browser Back' }))
    expect(await screen.findByRole('heading', { name: 'SAMPLE SETUP' })).toBeInTheDocument()
  })

  it('resumes an incomplete review and can move backward without an automatic redirect loop', async () => {
    const user = userEvent.setup()
    const rendered = renderStartPage()

    await fillRegistration(user)
    await createNewProduction(user)
    await addPileRegistration(user)
    await addFleet(user)
    await user.click(screen.getByRole('button', { name: /^Next/ }))
    await screen.findByRole('heading', { name: 'WORK SETUP REVIEW' })
    await waitFor(() => expect(readPreShiftSetupSession<{ readonly fleetSetup?: unknown }>()?.fleetSetup).toBeDefined())
    rendered.unmount()

    const recoveredUser = userEvent.setup()
    renderRecoveredStartPage('/start/review')
    expect(await screen.findByRole('heading', { name: 'WORK SETUP REVIEW' })).toBeInTheDocument()
    await recoveredUser.click(screen.getByRole('button', { name: 'Back to Fleet' }))
    expect(await screen.findByRole('heading', { name: 'FLEET SETUP' })).toBeInTheDocument()
    await recoveredUser.click(appBackButton())
    expect(await screen.findByRole('heading', { name: 'SAMPLE SETUP' })).toBeInTheDocument()
  })

  it('keeps separate Batch/Rit registrations intact across Pile Registration -> Fleet Setup -> Back', async () => {
    const user = userEvent.setup()
    renderStartPage()

    await fillRegistration(user)
    await createNewProduction(user)
    await screen.findByRole('heading', { name: 'SAMPLE SETUP' })
    await user.type(screen.getByLabelText('Cari Pile/Stockpile'), 'PILE-1')
    await user.click(screen.getByRole('button', { name: /^PILE-1/ }))
    await user.type(screen.getByLabelText('Batch'), '002')
    await user.type(screen.getByLabelText('Trip'), '002')
    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(screen.getByRole('option', { name: 'Active' }))
    await user.click(screen.getByRole('button', { name: 'Add Sample' }))

    await user.type(screen.getByLabelText('Cari Pile/Stockpile'), 'PILE-1')
    await user.click(screen.getByRole('button', { name: /^PILE-1/ }))
    await user.type(screen.getByLabelText('Batch'), '006')
    await user.type(screen.getByLabelText('Trip'), '006')
    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(screen.getByRole('option', { name: 'Active' }))
    await user.click(screen.getByRole('button', { name: 'Add Sample' }))
    await user.click(screen.getByRole('button', { name: /^Next/ }))

    expect(await screen.findByRole('heading', { name: 'FLEET SETUP' })).toBeInTheDocument()
    await user.click(appBackButton())
    expect(await screen.findByRole('heading', { name: 'SAMPLE SETUP' })).toBeInTheDocument()
    expect(screen.getByText('2 Samples')).toBeInTheDocument()
    expect(screen.getAllByText('002')).toHaveLength(2)
    expect(screen.getAllByText('006')).toHaveLength(2)
  })

  it('keeps Continue Setup available after returning from Handover to Work Setup', async () => {
    const user = userEvent.setup()
    renderStartPage()

    await fillRegistration(user)
    await createNewProduction(user)
    await user.type(screen.getByLabelText('Cari Pile/Stockpile'), 'PILE-1')
    await user.click(screen.getByRole('button', { name: /^PILE-1/ }))
    await user.type(screen.getByLabelText('Batch'), '002')
    await user.type(screen.getByLabelText('Trip'), '002')
    await user.click(screen.getByRole('button', { name: 'Add Sample' }))
    await user.click(screen.getByRole('button', { name: /Next/ }))

    expect(await screen.findByRole('heading', { name: 'FLEET SETUP' })).toBeInTheDocument()
    await user.click(appBackButton())
    await user.click(appBackButton())
    expect(await screen.findByRole('heading', { name: 'Production Data Setup' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Back$/ }))
    await screen.findByLabelText('Shift Date')
    expect(screen.queryByText('Active Shift Found')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Next/ }))

    expect(await screen.findByRole('heading', { name: 'Production Data Setup' })).toBeInTheDocument()
  })

  it('uses browser history for Sample Setup -> Production Data Setup -> Work Setup without clearing the draft', async () => {
    const user = userEvent.setup()
    renderStartPage()

    await fillRegistration(user)
    await createNewProduction(user)
    await continuePileRegistration(user)

    await user.click(screen.getByRole('button', { name: 'Browser Back' }))
    expect(await screen.findByRole('heading', { name: 'SAMPLE SETUP' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Browser Back' }))
    expect(await screen.findByRole('heading', { name: 'Production Data Setup' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Browser Back' }))
    expect(await screen.findByLabelText('Shift Date')).toHaveValue('2026-09-04')
    expect(screen.getByText('1 Lead')).toBeInTheDocument()
    expect(screen.getByText('1 Crew')).toBeInTheDocument()
  })
})
