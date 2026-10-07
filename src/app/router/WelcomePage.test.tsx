import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import { WelcomePage } from '@/app/router/WelcomePage'
import { buildFixtureMasterData, FIXTURE_EMPLOYEE_ID, FIXTURE_EMPLOYEE_NAME } from '@/infrastructure/local-db/local-db-test-fixtures'
import i18n from '@/i18n'

function renderWelcome() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/start" element={<div>START_PAGE_MARKER</div>} />
          <Route path="/production" element={<div>PRODUCTION_PAGE_MARKER</div>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('WelcomePage — Continue Record', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.spyOn(localOperationalStore, 'readCachedMasterData').mockResolvedValue({
      ok: true,
      value: { masterData: buildFixtureMasterData() },
    } as Awaited<ReturnType<typeof localOperationalStore.readCachedMasterData>>)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resumes an existing workspace and navigates to /production, never /home', async () => {
    const resume = vi
      .spyOn(localOperationalStore, 'resumeLocalWorkspace')
      .mockResolvedValue({ ok: true, value: {} } as Awaited<ReturnType<typeof localOperationalStore.resumeLocalWorkspace>>)
    const user = userEvent.setup()
    renderWelcome()

    await user.click(await screen.findByRole('button', { name: /^Continue Record/ }))
    await user.type(screen.getByLabelText('Search / Select Checker…'), FIXTURE_EMPLOYEE_NAME)
    await user.click(await screen.findByRole('button', { name: `${FIXTURE_EMPLOYEE_NAME} - ${FIXTURE_EMPLOYEE_ID}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('PRODUCTION_PAGE_MARKER')).toBeInTheDocument()
    expect(resume).toHaveBeenCalledWith(expect.any(String), expect.any(String), FIXTURE_EMPLOYEE_ID)
  })
})
