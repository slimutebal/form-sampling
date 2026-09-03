import Dexie from 'dexie'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import i18n from '@/i18n'
import {
  buildFixtureFleetSetup,
  buildFixtureMasterData,
  buildFixtureSapPile,
  buildFixtureShift,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import { LocalOperationalStore } from '@/infrastructure/local-db/local-operational-store'
import { ShiftStartPage } from '@/features/shift-registration/shift-start-page'

function uniqueDatabaseName(): string {
  return `shift-start-page-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

describe('ShiftStartPage — real LocalOperationalStore integration', () => {
  let databaseName: string
  let store: LocalOperationalStore

  beforeEach(() => {
    void i18n.changeLanguage('en')
    databaseName = uniqueDatabaseName()
    store = new LocalOperationalStore(databaseName)
  })

  afterEach(async () => {
    store.close()
    await Dexie.delete(databaseName)
  })

  it('shows the Resume card once a real workspace has been initialized and reopened', async () => {
    const masterData = buildFixtureMasterData()
    const fleetSetup = buildFixtureFleetSetup(masterData)
    const shift = buildFixtureShift('shift-integration-1')
    const pile = buildFixtureSapPile('PILE-1')

    const initializeResult = await store.initializeShiftWorkspace({
      shift,
      piles: [pile],
      masterData,
      fleetSetup,
    })
    expect(initializeResult.ok).toBe(true)

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/start']}>
          <ShiftStartPage store={store} />
        </MemoryRouter>
      </I18nextProvider>,
    )

    expect(await screen.findByText('Active Shift Found')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resume Shift' })).toBeInTheDocument()
  })
})
