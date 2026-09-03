import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router'
import type {
  CurrentShiftWorkspace,
  ShiftWorkspaceReadError,
  ShiftWorkspaceReader,
} from '@/application/ports/shift-workspace-reader'
import type { Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { Shift } from '@/domain/shift/shift'
import { buildFixtureShift } from '@/infrastructure/local-db/local-db-test-fixtures'
import i18n from '@/i18n'
import { ShiftStartPage } from './shift-start-page'

type WorkspaceResult = Result<CurrentShiftWorkspace | undefined, ShiftWorkspaceReadError>

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

function buildTestWorkspace(): CurrentShiftWorkspace {
  return { shift: buildFixtureShift('shift-1') }
}

function renderPage(store: ShiftWorkspaceReader, generateShiftId?: () => string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/start']}>
        <Routes>
          <Route
            path="/start"
            element={<ShiftStartPage store={store} generateShiftId={generateShiftId} />}
          />
          <Route path="/home" element={<div>HOME_PAGE_MARKER</div>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText('Shift Date'), { target: { value: '2026-09-04' } })
  fireEvent.change(screen.getByLabelText('Shift Code'), { target: { value: 'D' } })
  fireEvent.change(screen.getByLabelText('Sector'), { target: { value: 'BR1' } })
  fireEvent.change(screen.getByLabelText('Sampling House'), { target: { value: 'HOUSE-1' } })
}

describe('ShiftStartPage', () => {
  beforeEach(() => {
    void i18n.changeLanguage('en')
  })

  it('A. fresh local DB / no current shift shows the registration form', async () => {
    renderPage(new FakeShiftWorkspaceReader(ok(undefined)))

    expect(await screen.findByLabelText('Shift Date')).toBeInTheDocument()
    expect(screen.getByLabelText('Shift Code')).toBeInTheDocument()
    expect(screen.getByLabelText('Sector')).toBeInTheDocument()
    expect(screen.getByLabelText('Sampling House')).toBeInTheDocument()
  })

  it('B. current shift exists shows the Resume card with date/shift code/sector/sampling house/status', async () => {
    renderPage(new FakeShiftWorkspaceReader(ok(buildTestWorkspace())))

    expect(await screen.findByText('Active Shift Found')).toBeInTheDocument()
    expect(screen.getByText('September 4, 2026')).toBeInTheDocument()
    expect(screen.getByText('D')).toBeInTheDocument()
    expect(screen.getByText('S1')).toBeInTheDocument()
    expect(screen.getByText('HOUSE-1')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('C. clicking Resume Shift navigates to /home without any workspace write', async () => {
    const user = userEvent.setup()
    renderPage(new FakeShiftWorkspaceReader(ok(buildTestWorkspace())))

    await user.click(await screen.findByRole('button', { name: 'Resume Shift' }))

    expect(await screen.findByText('HOME_PAGE_MARKER')).toBeInTheDocument()
  })

  it('D. Start New Shift with an existing current shift opens the registration form', async () => {
    const user = userEvent.setup()
    renderPage(new FakeShiftWorkspaceReader(ok(buildTestWorkspace())))

    await user.click(await screen.findByRole('button', { name: 'Start New Shift' }))

    expect(await screen.findByLabelText('Shift Date')).toBeInTheDocument()
  })

  it('E. a persistence load error shows a translated error state with Retry, not a silent "no shift" fallback', async () => {
    renderPage(
      new FakeShiftWorkspaceReader(
        err({ code: 'CURRENT_SHIFT_WORKSPACE_NOT_FOUND', message: 'pointer references missing workspace' }),
      ),
    )

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
    renderPage(store)

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Active Shift Found')).toBeInTheDocument()
  })

  it('G. a valid registration produces a review with a Shift in status NEW and never initializes a workspace', async () => {
    const user = userEvent.setup()
    let readyShift: Shift | undefined
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/start']}>
          <ShiftStartPage
            store={new FakeShiftWorkspaceReader(ok(undefined))}
            generateShiftId={() => 'fixed-shift-id'}
            onRegistrationReady={(shift) => {
              readyShift = shift
            }}
          />
        </MemoryRouter>
      </I18nextProvider>,
    )

    await screen.findByLabelText('Shift Date')
    fillValidForm()
    await user.click(screen.getByRole('button', { name: 'Review Registration' }))

    expect(await screen.findByText('Registration is ready for setup.')).toBeInTheDocument()
    expect(readyShift?.status).toBe('NEW')
    expect(readyShift?.id).toBe('fixed-shift-id')
  })

  it('G2. an invalid generated ShiftId shows a translated registration error, not the review, and never a raw DomainError.message', async () => {
    const user = userEvent.setup()
    let readyShiftCalled = false
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/start']}>
          <ShiftStartPage
            store={new FakeShiftWorkspaceReader(ok(undefined))}
            generateShiftId={() => '   '}
            onRegistrationReady={() => {
              readyShiftCalled = true
            }}
          />
        </MemoryRouter>
      </I18nextProvider>,
    )

    await screen.findByLabelText('Shift Date')
    fillValidForm()
    await user.click(screen.getByRole('button', { name: 'Review Registration' }))

    expect(await screen.findByText('Unable to complete registration. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText('Registration is ready for setup.')).not.toBeInTheDocument()
    expect(screen.queryByText(/must not be blank or whitespace-only/i)).not.toBeInTheDocument()
    expect(readyShiftCalled).toBe(false)
  })

  it('H. an invalid form shows field-level validation and does not show the review', async () => {
    const user = userEvent.setup()
    renderPage(new FakeShiftWorkspaceReader(ok(undefined)))

    await screen.findByLabelText('Shift Date')
    await user.click(screen.getByRole('button', { name: 'Review Registration' }))

    expect(await screen.findAllByText('This field is required.')).toHaveLength(4)
    expect(screen.queryByText('Registration is ready for setup.')).not.toBeInTheDocument()
  })

  it('I. editing a review returns to the form with entered values retained', async () => {
    const user = userEvent.setup()
    renderPage(new FakeShiftWorkspaceReader(ok(undefined)))

    await screen.findByLabelText('Shift Date')
    fillValidForm()
    await user.click(screen.getByRole('button', { name: 'Review Registration' }))

    expect(await screen.findByText('Registration is ready for setup.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit Registration' }))

    expect(await screen.findByLabelText('Shift Date')).toHaveValue('2026-09-04')
    expect(screen.getByLabelText('Shift Code')).toHaveValue('D')
    expect(screen.getByLabelText('Sector')).toHaveValue('BR1')
    expect(screen.getByLabelText('Sampling House')).toHaveValue('HOUSE-1')
  })
})
