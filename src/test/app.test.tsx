import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router'
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
  beforeEach(() => {
    void i18n.changeLanguage('id')
  })

  it('renders the welcome screen at the root route', () => {
    renderApp(['/'])
    expect(screen.getByRole('heading', { name: 'Form Sampling' })).toBeInTheDocument()
  })

  it('renders the bottom navigation shell with all primary destinations', () => {
    renderApp(['/home'])
    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: /Beranda/i })).toBeInTheDocument()
    expect(within(nav).getAllByRole('link')).toHaveLength(5)
  })

  it('renders a placeholder screen for each primary route', () => {
    renderApp(['/piles'])
    expect(screen.getByRole('heading', { name: 'Pile' })).toBeInTheDocument()
  })

  it('switches translated shell text without reloading', async () => {
    const user = userEvent.setup()
    renderApp(['/more'])

    expect(screen.getByRole('heading', { name: 'Lainnya' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'EN' }))

    expect(await screen.findByRole('heading', { name: 'More' })).toBeInTheDocument()
  })
})
