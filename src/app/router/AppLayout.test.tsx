import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import i18n from '@/i18n'
import { AppLayout } from './AppLayout'

function renderLayout() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/start" element={<div>START_PAGE_MARKER</div>} />
          <Route element={<AppLayout />}>
            <Route path="/home" element={<div>HOME_PAGE_MARKER</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('AppLayout route guard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('A. redirects to /start when no active workspace exists, rather than rendering a broken active screen', async () => {
    vi.spyOn(localOperationalStore, 'loadCurrentShiftWorkspace').mockResolvedValue({ ok: true, value: undefined })

    renderLayout()

    expect(await screen.findByText('START_PAGE_MARKER')).toBeInTheDocument()
    expect(screen.queryByText('HOME_PAGE_MARKER')).not.toBeInTheDocument()
  })

  it('B. a workspace load failure shows a localized blocking/retry state, and never navigates away or clears data', async () => {
    // GlobalStatusBar's own `useActiveShiftPresence` reads the same
    // singleton independently, so this mock must serve any number of
    // callers, not just the AppLayout guard's own read.
    const spy = vi
      .spyOn(localOperationalStore, 'loadCurrentShiftWorkspace')
      .mockResolvedValue({ ok: false, error: { code: 'LOCAL_DATABASE_OPERATION_FAILED', message: 'boom' } })

    renderLayout()

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load the active shift workspace.')
    expect(screen.queryByText('HOME_PAGE_MARKER')).not.toBeInTheDocument()
    expect(screen.queryByText('START_PAGE_MARKER')).not.toBeInTheDocument()
    expect(spy).toHaveBeenCalled()
  })

  it('D. renders the opaque safe-area top cap regardless of workspace load phase', () => {
    vi.spyOn(localOperationalStore, 'loadCurrentShiftWorkspace').mockResolvedValue({ ok: true, value: undefined })

    renderLayout()

    // Present immediately (before the async workspace load even resolves) —
    // it must cover the status-bar/Dynamic-Island strip no matter which of
    // AppLayout's phase branches (loading/error/none/loaded) is rendering
    // below it.
    expect(screen.getByTestId('safe-area-top-cap')).toBeInTheDocument()
  })

  it('C. Retry re-runs the workspace load after a failure', async () => {
    const user = userEvent.setup()
    const spy = vi
      .spyOn(localOperationalStore, 'loadCurrentShiftWorkspace')
      .mockResolvedValue({ ok: false, error: { code: 'LOCAL_DATABASE_OPERATION_FAILED', message: 'boom' } })

    renderLayout()
    await screen.findByRole('alert')

    // Update the persistent mock in place (not `mockResolvedValueOnce`,
    // which would race against GlobalStatusBar's own independent call to
    // the same method) so every subsequent caller — including the
    // guard's retry — observes the recovered state.
    spy.mockResolvedValue({ ok: true, value: undefined })
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('START_PAGE_MARKER')).toBeInTheDocument()
  })
})
