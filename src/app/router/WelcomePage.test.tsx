import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseSamplingHouseCode, parseSectorCode, parseShiftCode } from '@/domain/common/codes'
import { parseEmployeeId, parseShiftId } from '@/domain/common/identifiers'
import { ok } from '@/domain/common/result'
import { parseShiftDate } from '@/domain/common/shift-date'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { createEmployeeReference, createSamplingHouseReference, createSectorReference } from '@/domain/master/references'
import { createFleetSetup } from '@/domain/fleet/fleet-setup'
import { createShift } from '@/domain/shift/shift'
import { createDefaultShiftRegistrationFormValues } from '@/application/shift-registration/shift-registration-form-values'
import type { LocalShiftWorkspace } from '@/app/local-operational-store'
import { WelcomePage } from './WelcomePage'
import { loadLandingMasterData } from './landing-master-data'
import { clearPreShiftSetupSession, savePreShiftSetupSession } from '@/infrastructure/device/pre-shift-setup-session-store'

const store = vi.hoisted(() => ({
  readCachedMasterData: vi.fn(),
  findLocalWorkspaces: vi.fn(),
  listLocalWorkspaces: vi.fn(),
  resumeLocalWorkspaceById: vi.fn(),
}))

vi.mock('@/app/local-operational-store', () => ({
  localOperationalStore: store,
}))

function must<T>(result: { readonly ok: boolean; readonly value?: T }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value as T
}

function buildLandingMasterData(): MasterData {
  const sector = must(parseSectorCode('BR1'))
  const house = must(parseSamplingHouseCode('SH_01'))
  return must(
    createMasterData({
      employees: [
        createEmployeeReference(must(parseEmployeeId('RAHARJO-1')), 'Raharjo Rahman'),
        createEmployeeReference(must(parseEmployeeId('IRAWAN-1')), 'Irawan Saputra'),
      ],
      crews: [],
      sectors: [createSectorReference(sector)],
      locations: [],
      samplingHouses: [createSamplingHouseReference(sector, house)],
      pileAreas: [],
      haulers: [],
      trucks: [],
      oreSamplingConfigs: [],
    }),
  )
}

function buildWorkspace(id: string, masterData: MasterData, date: string): LocalShiftWorkspace {
  const defaultValues = createDefaultShiftRegistrationFormValues(new Date())
  const shift = createShift({
    id: must(parseShiftId(id)),
    date: must(parseShiftDate(date)),
    shiftCode: must(parseShiftCode(defaultValues.shiftCode)),
    sectorCode: masterData.sectors[0]!.code,
    samplingHouseCode: masterData.samplingHouses[0]!.code,
    status: 'ACTIVE',
  })
  return {
    shiftId: shift.id,
    shift,
    piles: [],
    masterData,
    fleetSetup: must(createFleetSetup({ fronts: [], fleets: [] }, masterData)),
    pendingBatches: [],
    pendingSamples: [],
    manpower: [],
    pileRegistrations: [],
  }
}

function deferred<T = unknown>() {
  let resolve!: (value: T) => void
  return {
    promise: new Promise<T>((complete) => { resolve = complete }),
    resolve,
  }
}

async function openContinueWithIdentity(user: ReturnType<typeof userEvent.setup>, checkerName: string) {
  await user.click(screen.getByRole('button', { name: /^Continue Record/ }))
  await screen.findByRole('dialog', { name: 'CONTINUE RECORD' })
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Sector' })).toBeEnabled())
  await user.click(screen.getByRole('combobox', { name: 'Sector' }))
  await user.click(screen.getByRole('option', { name: 'BR1' }))
  await user.click(screen.getByRole('combobox', { name: 'Sampling House' }))
  await user.click(screen.getByRole('option', { name: 'SH_01' }))
  await user.type(screen.getByRole('textbox', { name: 'Checker' }), checkerName)
  await user.click(await screen.findByRole('button', { name: new RegExp(checkerName) }))
}

function renderLanding() {
  return render(<MemoryRouter><WelcomePage /></MemoryRouter>)
}

describe('loadLandingMasterData', () => {
  it('uses the validated refresh result directly on first online use', async () => {
    const masterData = buildLandingMasterData()
    const refreshMasterData = vi.fn().mockResolvedValue(ok({ masterData }))

    await expect(loadLandingMasterData({
      readCachedMasterData: async () => ok(undefined),
      refreshMasterData,
      isOnline: () => true,
    })).resolves.toEqual({ kind: 'ready', masterData })
    expect(refreshMasterData).toHaveBeenCalledOnce()
  })

  it('preserves a real cache or remote failure instead of reporting a false available state', async () => {
    await expect(loadLandingMasterData({
      readCachedMasterData: async () => ({ ok: false as const, error: { code: 'INDEXED_DB_UNAVAILABLE', message: 'blocked' } }),
      refreshMasterData: async () => ok({ masterData: buildLandingMasterData() }),
      isOnline: () => true,
    })).resolves.toEqual({ kind: 'failed', code: 'INDEXED_DB_UNAVAILABLE' })
  })
})

describe('WelcomePage', () => {
  beforeEach(() => {
    clearPreShiftSetupSession()
    store.readCachedMasterData.mockResolvedValue(ok({ masterData: buildLandingMasterData(), fetchedAt: new Date('2026-10-06') }))
    store.findLocalWorkspaces.mockReset()
    store.findLocalWorkspaces.mockResolvedValue(ok([]))
    store.listLocalWorkspaces.mockReset()
    store.listLocalWorkspaces.mockResolvedValue(ok([]))
    store.resumeLocalWorkspaceById.mockReset()
  })

  it('renders the requested landing copy without old quality branding or a landing language selector', async () => {
    const { container } = renderLanding()

    await screen.findByText('Ore Quality Assurance')
    expect(container.querySelector('img[alt=""]')).toHaveAttribute('src', expect.stringContaining('images/landing/ops-mine-landing.png'))
    expect(screen.getByTestId('temporary-q-logo')).toHaveTextContent('Q')
    expect(screen.getByText('Semangat pagi,')).toBeInTheDocument()
    expect(screen.getByText('Quality Ranger')).toBeInTheDocument()
    expect(screen.getByText('Elevate workflow with an intelligent field recording system.')).toBeInTheDocument()
    expect(screen.getByText('Every One Safe: Always!')).toBeInTheDocument()
    expect(screen.getByText('Elevate workflow with an intelligent field recording system.').closest('section')).toContainElement(screen.getByTestId('landing-title'))
    expect(screen.getByText('Every One Safe: Always!').closest('section')).toContainElement(screen.getByText('Quality Ranger'))
    expect(screen.queryByText('QPS QUALITY')).not.toBeInTheDocument()
    expect(screen.queryByText('QUALITY CONTROL PLATFORM')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /language/i })).not.toBeInTheDocument()
  })

  it('retries failed master-data loading once without reloading the landing page', async () => {
    const user = userEvent.setup()
    const retry = deferred<ReturnType<typeof ok<{ readonly masterData: MasterData }>>>()
    store.readCachedMasterData
      .mockRejectedValueOnce(new Error('temporary IndexedDB failure'))
      .mockImplementationOnce(() => retry.promise)
    renderLanding()

    const retryButton = await screen.findByRole('button', { name: 'Try Again / Coba Lagi' })
    await waitFor(() => expect(retryButton).toBeEnabled())
    await user.click(retryButton)
    expect(retryButton).toBeDisabled()
    await user.click(retryButton)
    expect(store.readCachedMasterData).toHaveBeenCalledTimes(2)

    retry.resolve(ok({ masterData: buildLandingMasterData() }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Try Again / Coba Lagi' })).not.toBeInTheDocument())
    expect(screen.getByText('Ore Quality Assurance')).toBeInTheDocument()
  })

  it('opens New Record as an accessible modal, keeps typed checker text readable, and closes on Escape', async () => {
    const user = userEvent.setup()
    renderLanding()

    await user.click(screen.getByRole('button', { name: /^New Record/ }))
    expect(screen.getByRole('dialog', { name: 'NEW RECORD' })).toBeInTheDocument()
    expect(screen.getByRole('dialog')).not.toHaveClass('overflow-y-auto')
    expect(screen.getByRole('dialog')).not.toHaveClass('max-h-[85dvh]')
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Confirm/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Work Setup' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog').querySelector('select')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Sector' })).toBeEnabled())

    const search = screen.getByRole('textbox', { name: 'Checker' })
    await user.type(search, 'Raharjo')
    expect(search).toHaveValue('Raharjo')
    expect(search).toHaveClass('text-emerald-950', 'caret-emerald-950')
    expect(await screen.findByRole('listbox', { name: 'Checker results' })).toHaveClass('absolute')
    expect(await screen.findByRole('button', { name: /Raharjo Rahman/ })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^New Record/ })).toHaveFocus()
  })

  it('validates real master-data selections before allowing the new-record handoff', async () => {
    const user = userEvent.setup()
    renderLanding()

    await user.click(screen.getByRole('button', { name: /^New Record/ }))
    await screen.findByRole('dialog', { name: 'NEW RECORD' })
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Sector' })).toBeEnabled())
    await user.click(screen.getByRole('combobox', { name: 'Sector' }))
    await user.click(screen.getByRole('option', { name: 'BR1' }))
    await user.click(screen.getByRole('combobox', { name: 'Sampling House' }))
    await user.click(screen.getByRole('option', { name: 'SH_01' }))
    await user.type(screen.getByRole('textbox', { name: 'Checker' }), 'Raharjo')
    await user.click(await screen.findByRole('button', { name: /Raharjo Rahman/ }))

    expect(screen.getByRole('button', { name: /^Confirm/ })).toBeEnabled()
    expect(store.findLocalWorkspaces).not.toHaveBeenCalled()
  })

  it('opens Continue Record as a modal and never searches or resumes before a full identity is selected', async () => {
    const user = userEvent.setup()
    renderLanding()

    await user.click(screen.getByRole('button', { name: /^Continue Record/ }))
    await screen.findByRole('dialog', { name: 'CONTINUE RECORD' })
    expect(screen.getByRole('button', { name: /^Confirm/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue Record' })).not.toBeInTheDocument()
    expect(store.findLocalWorkspaces).not.toHaveBeenCalled()
    expect(store.resumeLocalWorkspaceById).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('discovers a legacy workspace only after an explicit recovery request, without inventing a Checker or changing the active workspace before confirmation', async () => {
    const user = userEvent.setup()
    const masterData = buildLandingMasterData()
    const legacyWorkspace = buildWorkspace('LEGACY-SHIFT-1', masterData, '2026-01-01')
    store.listLocalWorkspaces.mockResolvedValue(ok([legacyWorkspace]))
    store.resumeLocalWorkspaceById.mockResolvedValue(ok(legacyWorkspace))
    renderLanding()

    await user.click(screen.getByRole('button', { name: /^Continue Record/ }))
    expect(store.listLocalWorkspaces).not.toHaveBeenCalled()
    expect(store.resumeLocalWorkspaceById).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Find saved workspaces on this device' }))
    expect(await screen.findByText('Recovery candidates — verify identity before selecting')).toBeInTheDocument()
    expect(screen.getByText('Checker: not recorded (legacy workspace)')).toBeInTheDocument()
    expect(store.listLocalWorkspaces).toHaveBeenCalledOnce()
    expect(store.resumeLocalWorkspaceById).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^Confirm/ })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /01-Jan-2026/ }))
    expect(screen.getByRole('button', { name: /^Confirm/ })).toBeEnabled()
    expect(store.resumeLocalWorkspaceById).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /^Confirm/ }))
    await waitFor(() => expect(store.resumeLocalWorkspaceById).toHaveBeenCalledWith('LEGACY-SHIFT-1'))
  })

  it('shows every recovery candidate for explicit selection when exact identity lookup finds nothing', async () => {
    const user = userEvent.setup()
    const masterData = buildLandingMasterData()
    const firstWorkspace = buildWorkspace('SHIFT-RECOVERY-1', masterData, '2026-01-01')
    const secondWorkspace = buildWorkspace('SHIFT-RECOVERY-2', masterData, '2026-01-02')
    store.listLocalWorkspaces.mockResolvedValue(ok([firstWorkspace, secondWorkspace]))
    renderLanding()

    await user.click(screen.getByRole('button', { name: /^Continue Record/ }))
    await user.click(screen.getByRole('button', { name: 'Find saved workspaces on this device' }))

    expect(await screen.findByRole('button', { name: /01-Jan-2026/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /02-Jan-2026/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Confirm/ })).toBeDisabled()
  })

  it('clears the previous Continue Record selection when the dialog is closed and reopened', async () => {
    const user = userEvent.setup()
    const masterData = buildLandingMasterData()
    const firstWorkspace = buildWorkspace('SHIFT-1', masterData, '2026-01-01')
    const reopenedWorkspace = buildWorkspace('SHIFT-2', masterData, '2026-01-02')
    const reopenedLookup = deferred()
    store.findLocalWorkspaces
      .mockResolvedValueOnce(ok([firstWorkspace]))
      .mockImplementationOnce(() => reopenedLookup.promise)
    renderLanding()

    await openContinueWithIdentity(user, 'Raharjo')
    const firstMatch = await screen.findByRole('button', { name: /01-Jan-2026/ })
    await user.click(firstMatch)
    expect(screen.getByRole('button', { name: /^Confirm/ })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.click(screen.getByRole('button', { name: /^Continue Record/ }))
    await screen.findByRole('dialog', { name: 'CONTINUE RECORD' })
    await waitFor(() => expect(store.findLocalWorkspaces).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('button', { name: /01-Jan-2026/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Confirm/ })).toBeDisabled()

    reopenedLookup.resolve(ok([reopenedWorkspace]))
    expect(await screen.findByRole('button', { name: /02-Jan-2026/ })).toBeInTheDocument()
  })

  it('keeps a stale Continue Record lookup from replacing the latest checker result', async () => {
    const user = userEvent.setup()
    const masterData = buildLandingMasterData()
    const firstWorkspace = buildWorkspace('SHIFT-1', masterData, '2026-01-01')
    const latestWorkspace = buildWorkspace('SHIFT-2', masterData, '2026-01-02')
    const firstLookup = deferred()
    const latestLookup = deferred()
    store.findLocalWorkspaces
      .mockImplementationOnce(() => firstLookup.promise)
      .mockImplementationOnce(() => latestLookup.promise)
    renderLanding()

    await openContinueWithIdentity(user, 'Raharjo')
    await waitFor(() => expect(store.findLocalWorkspaces).toHaveBeenCalledTimes(1))

    const checker = screen.getByRole('textbox', { name: 'Checker' })
    await user.clear(checker)
    await user.type(checker, 'Irawan')
    await user.click(await screen.findByRole('button', { name: /Irawan Saputra/ }))
    await waitFor(() => expect(store.findLocalWorkspaces).toHaveBeenCalledTimes(2))

    latestLookup.resolve(ok([latestWorkspace]))
    expect(await screen.findByRole('button', { name: /02-Jan-2026/ })).toBeInTheDocument()

    firstLookup.resolve(ok([firstWorkspace]))
    await waitFor(() => expect(screen.queryByRole('button', { name: /01-Jan-2026/ })).not.toBeInTheDocument())
  })

  it('offers the first incomplete setup stage without treating it as a completed Record', async () => {
    const user = userEvent.setup()
    savePreShiftSetupSession({ shift: { id: 'SHIFT-1' }, outcome: { pileRegistrations: [] } })
    render(<MemoryRouter initialEntries={['/']}><Routes><Route path="/" element={<WelcomePage />} /><Route path="/start/piles" element={<div>RECOVERED_SAMPLE_SETUP</div>} /></Routes></MemoryRouter>)

    await user.click(screen.getByRole('button', { name: /^Continue Setup/ }))

    expect(await screen.findByText('RECOVERED_SAMPLE_SETUP')).toBeInTheDocument()
  })
})
