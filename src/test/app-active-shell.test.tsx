import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, useLocation } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import { AppRouter } from '@/app/router/AppRouter'
import {
  buildFixtureFleetSetup,
  buildFixtureMasterData,
  buildFixtureSapPile,
  buildFixtureShift,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import i18n from '@/i18n'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{location.pathname}</div>
}

function renderApp(initialEntries: string[]) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRouter />
        <LocationProbe />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

/**
 * Deliberately a separate file from `app.test.tsx` (Phase 18 wiring
 * correction §15/§16 regression coverage): `AppLayout` reads the
 * app-wide `localOperationalStore` singleton directly (mirrors every
 * other active route), so exercising the "workspace is active" shell
 * needs a real seeded workspace in that singleton's own IndexedDB.
 * Vitest gives each test file its own isolated jsdom/fake-indexeddb
 * environment, so seeding once here — with no manual close/delete —
 * never touches `app.test.tsx`'s own (deliberately empty) database.
 */
describe('application shell — active workspace', () => {
  beforeAll(async () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('app-shell-shift')
    const pile = buildFixtureSapPile('PILE-1')
    const result = await localOperationalStore.initializeShiftWorkspace({
      shift,
      piles: [pile],
      masterData,
      fleetSetup,
    })
    if (!result.ok) throw new Error(`fixture setup failed: ${result.error.code}`)
  })

  beforeEach(() => {
    void i18n.changeLanguage('id')
  })

  it('renders the bottom navigation shell with all primary destinations', async () => {
    renderApp(['/production'])

    const nav = await screen.findByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'SETUP' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Add' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'REPORT' })).toBeInTheDocument()
    expect(within(nav).getAllByRole('link')).toHaveLength(2)
  })

  it('redirects the legacy /home route to /production without mounting a Home page', async () => {
    renderApp(['/home'])

    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent(/^\/production$/))
    expect(await screen.findByRole('navigation')).toBeInTheDocument()
  })

  it('renders the real Piles screen (not a placeholder)', async () => {
    renderApp(['/piles'])

    expect(await screen.findByText('PILE-1')).toBeInTheDocument()
  })

  it('renders the real Fleet screen (not a placeholder)', async () => {
    renderApp(['/fleet'])

    expect(await screen.findByText('F1')).toBeInTheDocument()
  })
})
