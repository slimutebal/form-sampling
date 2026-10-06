import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import { AppRouter } from '@/app/router/AppRouter'
import i18n from '@/i18n'

function renderApp(initialEntries: string[]) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRouter />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('application shell', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('id')
  })

  it('renders the welcome screen at the root route', () => {
    renderApp(['/'])
    expect(screen.getByRole('heading', { name: 'Ore Quality Assurance' })).toBeInTheDocument()
  })

  it('does not render bottom navigation on the pre-operational start route', () => {
    renderApp(['/start'])
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('wraps the pre-operational start route in the PreShiftShell (safe-area flow spacer + opaque top cap)', () => {
    renderApp(['/start'])
    expect(screen.getByTestId('safe-area-top-cap')).toBeInTheDocument()
  })

  it('an active route without a workspace redirects to /start rather than rendering a broken active screen', async () => {
    expect(await localOperationalStore.loadCurrentShiftWorkspace()).toEqual({ ok: true, value: undefined })

    renderApp(['/piles'])
    expect(await screen.findByRole('heading', { name: 'WORK SETUP' }, { timeout: 5_000 })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})
