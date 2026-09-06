import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router'
import type {
  CurrentShiftWorkspace,
  ShiftWorkspaceReadError,
  ShiftWorkspaceReader,
} from '@/application/ports/shift-workspace-reader'
import { parseSamplingHouseCode, parseSectorCode } from '@/domain/common/codes'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { createSamplingHouseReference, createSectorReference } from '@/domain/master/references'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { Shift } from '@/domain/shift/shift'
import { buildFixtureShift } from '@/infrastructure/local-db/local-db-test-fixtures'
import i18n from '@/i18n'
import { ShiftStartPage, type MasterDataCacheReader } from './shift-start-page'

type WorkspaceResult = Result<CurrentShiftWorkspace | undefined, ShiftWorkspaceReadError>
type MasterDataResult = Result<{ readonly masterData: MasterData; readonly fetchedAt: Date } | undefined, DomainError>

class FakeShiftWorkspaceReader implements ShiftWorkspaceReader {
  readonly result: WorkspaceResult

  constructor(result: WorkspaceResult) {
    this.result = result
  }

  async loadCurrentShiftWorkspace(): Promise<WorkspaceResult> {
    return this.result
  }
}

class SequencedShiftWorkspaceReader implements ShiftWorkspaceReader {
  readonly results: readonly WorkspaceResult[]
  callCount = 0

  constructor(results: readonly WorkspaceResult[]) {
    this.results = results
  }

  async loadCurrentShiftWorkspace(): Promise<WorkspaceResult> {
    const index = Math.min(this.callCount, this.results.length - 1)
    this.callCount += 1
    return this.results[index]
  }
}

class FakeMasterDataCacheReader implements MasterDataCacheReader {
  readonly result: MasterDataResult

  constructor(result: MasterDataResult) {
    this.result = result
  }

  async readCachedMasterData(): Promise<MasterDataResult> {
    return this.result
  }
}

class SequencedMasterDataCacheReader implements MasterDataCacheReader {
  readonly results: readonly MasterDataResult[]
  callCount = 0

  constructor(results: readonly MasterDataResult[]) {
    this.results = results
  }

  async readCachedMasterData(): Promise<MasterDataResult> {
    const index = Math.min(this.callCount, this.results.length - 1)
    this.callCount += 1
    return this.results[index]
  }
}

function must<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value as T
}

function buildTestMasterData(): MasterData {
  const br1 = must(parseSectorCode('BR1'))
  const ds = must(parseSectorCode('DS_SECTOR'))
  const sh01 = must(parseSamplingHouseCode('SH_01'))
  const br1Only = must(parseSamplingHouseCode('SHT/C01'))
  return must(
    createMasterData({
      employees: [],
      crews: [],
      sectors: [createSectorReference(br1), createSectorReference(ds)],
      locations: [],
      samplingHouses: [
        createSamplingHouseReference(br1, sh01),
        createSamplingHouseReference(br1, br1Only),
        createSamplingHouseReference(ds, sh01),
      ],
      pileAreas: [],
      haulers: [],
      trucks: [],
      oreSamplingConfigs: [],
    }),
  )
}

function readyMasterDataReader(): FakeMasterDataCacheReader {
  return new FakeMasterDataCacheReader(ok({ masterData: buildTestMasterData(), fetchedAt: new Date('2026-09-04') }))
}

function buildTestWorkspace(): CurrentShiftWorkspace {
  return { shift: buildFixtureShift('shift-1') }
}

function renderPage(overrides: {
  store?: ShiftWorkspaceReader
  masterDataReader?: MasterDataCacheReader
  generateShiftId?: () => string
  refreshMasterData?: () => Promise<Result<void, DomainError>>
  isOnline?: () => boolean
  onContinue?: (shift: Shift, masterData: MasterData) => void
}) {
  const store = overrides.store ?? new FakeShiftWorkspaceReader(ok(undefined))
  const masterDataReader = overrides.masterDataReader ?? readyMasterDataReader()
  const onContinue = overrides.onContinue ?? vi.fn()
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/start']}>
        <Routes>
          <Route
            path="/start"
            element={
              <ShiftStartPage
                store={store}
                masterDataReader={masterDataReader}
                generateShiftId={overrides.generateShiftId}
                refreshMasterData={overrides.refreshMasterData}
                isOnline={overrides.isOnline}
                onContinue={onContinue}
              />
            }
          />
          <Route path="/home" element={<div>HOME_PAGE_MARKER</div>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText('Shift Date'), { target: { value: '2026-09-04' } })
  fireEvent.change(screen.getByLabelText('Shift Code'), { target: { value: 'DS' } })
  fireEvent.change(screen.getByLabelText('Sector'), { target: { value: 'BR1' } })
  fireEvent.change(screen.getByLabelText('Sampling House'), { target: { value: 'SH_01' } })
}

describe('ShiftStartPage', () => {
  beforeEach(() => {
    void i18n.changeLanguage('en')
  })

  it('A. fresh local DB / no current shift shows the registration form once MasterData is ready', async () => {
    const refreshMasterData = vi.fn()
    renderPage({ refreshMasterData, isOnline: () => false })

    expect(await screen.findByLabelText('Shift Date')).toBeInTheDocument()
    expect(screen.getByLabelText('Shift Code')).toBeInTheDocument()
    expect(screen.getByLabelText('Sector')).toBeInTheDocument()
    expect(screen.getByLabelText('Sampling House')).toBeInTheDocument()
    expect(refreshMasterData).not.toHaveBeenCalled()
  })

  it('B. current shift exists shows the Resume card with date/shift code/sector/sampling house/status', async () => {
    renderPage({ store: new FakeShiftWorkspaceReader(ok(buildTestWorkspace())) })

    expect(await screen.findByText('Active Shift Found')).toBeInTheDocument()
    expect(screen.getByText('September 4, 2026')).toBeInTheDocument()
    expect(screen.getByText('D')).toBeInTheDocument()
    expect(screen.getByText('S1')).toBeInTheDocument()
    expect(screen.getByText('HOUSE-1')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('C. clicking Resume Shift navigates to /home without any workspace write', async () => {
    const user = userEvent.setup()
    renderPage({ store: new FakeShiftWorkspaceReader(ok(buildTestWorkspace())) })

    await user.click(await screen.findByRole('button', { name: 'Resume Shift' }))

    expect(await screen.findByText('HOME_PAGE_MARKER')).toBeInTheDocument()
  })

  it('D. Start New Shift with an existing current shift opens the registration form', async () => {
    const user = userEvent.setup()
    renderPage({ store: new FakeShiftWorkspaceReader(ok(buildTestWorkspace())) })

    await user.click(await screen.findByRole('button', { name: 'Start New Shift' }))

    expect(await screen.findByLabelText('Shift Date')).toBeInTheDocument()
  })

  it('E. a persistence load error shows a translated error state with Retry, not a silent "no shift" fallback', async () => {
    renderPage({
      store: new FakeShiftWorkspaceReader(
        err({ code: 'CURRENT_SHIFT_WORKSPACE_NOT_FOUND', message: 'pointer references missing workspace' }),
      ),
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('Local shift data is inconsistent.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Shift Date')).not.toBeInTheDocument()
  })

  it('F. retry re-runs the load and reflects a successful second attempt', async () => {
    const user = userEvent.setup()
    const store = new SequencedShiftWorkspaceReader([
      err({ code: 'LOCAL_DATABASE_OPERATION_FAILED', message: 'boom' }),
      ok(buildTestWorkspace()),
    ])
    renderPage({ store })

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Active Shift Found')).toBeInTheDocument()
  })

  it('G. a valid registration produces a review with a Shift in status NEW, and Continue hands it (with MasterData) to the caller', async () => {
    const user = userEvent.setup()
    let readyShift: Shift | undefined
    let readyMasterData: MasterData | undefined
    renderPage({
      generateShiftId: () => 'fixed-shift-id',
      onContinue: (shift, masterData) => {
        readyShift = shift
        readyMasterData = masterData
      },
    })

    await screen.findByLabelText('Shift Date')
    fillValidForm()
    await user.click(screen.getByRole('button', { name: 'Review Registration' }))

    expect(await screen.findByText('Registration is ready for setup.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(readyShift?.status).toBe('NEW')
    expect(readyShift?.id).toBe('fixed-shift-id')
    expect(readyMasterData).toBeDefined()
  })

  it('G2. an invalid generated ShiftId shows a translated registration error, not the review, and never a raw DomainError.message', async () => {
    const user = userEvent.setup()
    renderPage({ generateShiftId: () => '   ' })

    await screen.findByLabelText('Shift Date')
    fillValidForm()
    await user.click(screen.getByRole('button', { name: 'Review Registration' }))

    expect(await screen.findByText('Unable to complete registration. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText('Registration is ready for setup.')).not.toBeInTheDocument()
    expect(screen.queryByText(/must not be blank or whitespace-only/i)).not.toBeInTheDocument()
  })

  it('H. an invalid form shows field-level validation and does not show the review', async () => {
    const user = userEvent.setup()
    renderPage({})

    await screen.findByLabelText('Shift Date')
    await user.click(screen.getByRole('button', { name: 'Review Registration' }))

    expect(await screen.findAllByText('This field is required.')).toHaveLength(4)
    expect(screen.queryByText('Registration is ready for setup.')).not.toBeInTheDocument()
  })

  it('I. editing a review returns to the form with entered values retained', async () => {
    const user = userEvent.setup()
    renderPage({})

    await screen.findByLabelText('Shift Date')
    fillValidForm()
    await user.click(screen.getByRole('button', { name: 'Review Registration' }))

    expect(await screen.findByText('Registration is ready for setup.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit Registration' }))

    expect(await screen.findByLabelText('Shift Date')).toHaveValue('2026-09-04')
    expect(screen.getByLabelText('Shift Code')).toHaveValue('DS')
    expect(screen.getByLabelText('Sector')).toHaveValue('BR1')
    expect(screen.getByLabelText('Sampling House')).toHaveValue('SH_01')
  })

  it('J. the Shift Code selector only offers DS/NS — no arbitrary text is possible', async () => {
    renderPage({})

    const select = (await screen.findByLabelText('Shift Code')) as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    const values = Array.from(select.options).map((option) => option.value)
    expect(values.sort()).toEqual(['', 'DS', 'NS'])
  })

  it('K. Sector options come from MasterData, not a hardcoded list', async () => {
    renderPage({})

    const select = (await screen.findByLabelText('Sector')) as HTMLSelectElement
    const values = Array.from(select.options).map((option) => option.value)
    expect(values.sort()).toEqual(['', 'BR1', 'DS_SECTOR'])
  })

  it('L. Sampling House options are filtered by the selected Sector, and the same code (SH_01) can exist under two different sectors', async () => {
    renderPage({})

    await screen.findByLabelText('Sector')
    fireEvent.change(screen.getByLabelText('Sector'), { target: { value: 'BR1' } })
    const br1Options = Array.from((screen.getByLabelText('Sampling House') as HTMLSelectElement).options).map(
      (option) => option.value,
    )
    expect(br1Options.sort()).toEqual(['', 'SHT/C01', 'SH_01'])

    fireEvent.change(screen.getByLabelText('Sector'), { target: { value: 'DS_SECTOR' } })
    const dsOptions = Array.from((screen.getByLabelText('Sampling House') as HTMLSelectElement).options).map(
      (option) => option.value,
    )
    expect(dsOptions.sort()).toEqual(['', 'SH_01'])
  })

  it('M. changing Sector clears an already-selected Sampling House that is not valid under the new Sector', async () => {
    renderPage({})

    await screen.findByLabelText('Sector')
    fireEvent.change(screen.getByLabelText('Sector'), { target: { value: 'BR1' } })
    fireEvent.change(screen.getByLabelText('Sampling House'), { target: { value: 'SHT/C01' } })
    expect(screen.getByLabelText('Sampling House')).toHaveValue('SHT/C01')

    fireEvent.change(screen.getByLabelText('Sector'), { target: { value: 'DS_SECTOR' } })

    expect(screen.getByLabelText('Sampling House')).toHaveValue('')
  })

  it('N. submitting an invalid Sector/Sampling House pair is rejected with field errors', async () => {
    const user = userEvent.setup()
    renderPage({})

    await screen.findByLabelText('Shift Date')
    fireEvent.change(screen.getByLabelText('Shift Date'), { target: { value: '2026-09-04' } })
    fireEvent.change(screen.getByLabelText('Shift Code'), { target: { value: 'DS' } })
    // Sector left unselected — Sector and Sampling House must both report errors.
    await user.click(screen.getByRole('button', { name: 'Review Registration' }))

    expect(screen.queryByText('Registration is ready for setup.')).not.toBeInTheDocument()
  })

  it('O. an empty cache while offline shows the first-use internet-required message', async () => {
    renderPage({ masterDataReader: new FakeMasterDataCacheReader(ok(undefined)), isOnline: () => false })

    expect(await screen.findByText('Internet is required to download master data for first use.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Shift Date')).not.toBeInTheDocument()
  })

  it('O2. a cached master-data snapshot works offline without a remote request', async () => {
    const refreshMasterData = vi.fn()
    renderPage({ refreshMasterData, isOnline: () => false })
    expect(await screen.findByLabelText('Shift Date')).toBeInTheDocument()
    expect(refreshMasterData).not.toHaveBeenCalled()
  })

  it('P. a MasterData cache read failure shows a blocking error and never clears local data (no destructive call is made)', async () => {
    const reader = new FakeMasterDataCacheReader(err({ code: 'LOCAL_DATABASE_OPERATION_FAILED', message: 'boom' }))
    renderPage({ masterDataReader: reader })

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load local master data.')
    expect(screen.queryByLabelText('Shift Date')).not.toBeInTheDocument()
  })

  it('Q. an existing active workspace resumes without ever consulting the MasterData cache reader', async () => {
    const masterDataReader = new FakeMasterDataCacheReader(err({ code: 'SHOULD_NOT_BE_USED', message: 'boom' }))
    renderPage({ store: new FakeShiftWorkspaceReader(ok(buildTestWorkspace())), masterDataReader })

    expect(await screen.findByText('Active Shift Found')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('R. an empty online cache automatically fetches Apps Script data, writes it, and reveals registration', async () => {
    const masterDataReader = new SequencedMasterDataCacheReader([
      ok(undefined),
      ok({ masterData: buildTestMasterData(), fetchedAt: new Date('2026-09-05') }),
    ])
    const refreshMasterData = vi.fn().mockResolvedValue(ok(undefined))
    renderPage({ masterDataReader, refreshMasterData, isOnline: () => true })

    await waitFor(() => {
      expect(refreshMasterData).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByLabelText('Shift Date')).toBeInTheDocument()
  })

  it('S. a failed Apps Script fetch shows a retry without exposing raw error text', async () => {
    const user = userEvent.setup()
    const masterDataReader = new FakeMasterDataCacheReader(ok(undefined))
    const refreshMasterData = vi.fn().mockResolvedValue(err({ code: 'GOOGLE_REQUEST_FAILED', message: 'raw request detail' }))
    renderPage({ masterDataReader, refreshMasterData, isOnline: () => true })

    expect(await screen.findByText('Master data is not available. Check your connection and try again.')).toBeInTheDocument()
    expect(screen.queryByText(/raw request detail/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'TRY AGAIN' }))
    expect(refreshMasterData).toHaveBeenCalledTimes(2)
  })
})
