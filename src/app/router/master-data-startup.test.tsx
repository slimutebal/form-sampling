import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import {
  clearMasterDataDiagnostics,
  readMasterDataDiagnostics,
} from '@/app/google/master-data-diagnostics'
import { AppRouter } from '@/app/router/AppRouter'
import { WelcomePage } from '@/app/router/WelcomePage'
import type { MasterDataCacheEntry } from '@/application/google/google-ports'
import { err, ok } from '@/domain/common/result'
import {
  buildFixtureMasterData,
  FIXTURE_EMPLOYEE_ID,
  FIXTURE_EMPLOYEE_NAME,
} from '@/infrastructure/local-db/local-db-test-fixtures'
import i18n from '@/i18n'

/**
 * Landing master-data startup, end to end through the real single-flight
 * `refreshAppsScriptMasterData`, JSONP reader and parser. Only the network
 * (JSONP responses) and the IndexedDB cache (in memory, to count writes)
 * are simulated.
 */

const UNAVAILABLE_EN = 'Master data is unavailable.'
const UNAVAILABLE_ID = 'Master data belum tersedia.'

const validTables = {
  Employees: [
    ['Employee_ID', 'Name', 'Initial', 'Level'],
    [FIXTURE_EMPLOYEE_ID, FIXTURE_EMPLOYEE_NAME, 'JD', 'Checker'],
  ],
  Crews: [
    ['Crew_ID', 'Name', 'Job'],
    ['CREW-A', 'Crew A', 'Sampler'],
  ],
  Sectors: [['Sector_Code'], ['BR1']],
  Sampling_Houses: [
    ['Sector_Code', 'Sampling_House_Code'],
    ['BR1', 'SH1'],
  ],
  Pile_Areas: [['Sector_Code', 'Stockpile_Code', 'Pile_ID', 'Ore']],
  Haulers: [['Hauler_Code', 'Name']],
  Trucks: [['Truck_ID', 'Hauler_Code']],
  Ore_Sampling_Config: [['Ore', 'Sampling_Interval', 'Batch_Size', 'Packing']],
}
const crewsWithNameOnlyRow = {
  ...validTables,
  Crews: [
    ['Crew_ID', 'Name', 'Job'],
    ['CREW-A', 'Crew A', 'Sampler'],
    ['', 'Private Crew Name', ''],
  ],
}

let cacheEntry: MasterDataCacheEntry | undefined
let replaceCache: ReturnType<typeof vi.spyOn>

function scripts(): HTMLScriptElement[] {
  return [...document.head.querySelectorAll<HTMLScriptElement>('script[src]')]
}

async function respond(tables: unknown) {
  const [script] = scripts()
  const callback = (window as unknown as Record<string, unknown>)[
    new URL(script.src).searchParams.get('callback') ?? ''
  ]
  if (typeof callback !== 'function') throw new Error('no pending JSONP callback')
  await act(async () => {
    callback({ tables })
  })
}

async function failRequest() {
  await act(async () => {
    scripts()[0].dispatchEvent(new Event('error'))
  })
}

function renderAt(element: 'app' | 'welcome') {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/']}>
        {element === 'app' ? (
          <AppRouter />
        ) : (
          <Routes>
            <Route path="/" element={<WelcomePage />} />
          </Routes>
        )}
      </MemoryRouter>
    </I18nextProvider>,
  )
}

async function checkerCandidateVisible(): Promise<boolean> {
  const user = userEvent.setup()
  if (!screen.queryByLabelText('Search / Select Checker…')) {
    await user.click(screen.getByRole('button', { name: /^New Record/ }))
  }
  const search = screen.getByLabelText('Search / Select Checker…')
  await user.clear(search)
  await user.type(search, FIXTURE_EMPLOYEE_NAME)
  return (
    screen.queryByRole('button', { name: `${FIXTURE_EMPLOYEE_NAME} - ${FIXTURE_EMPLOYEE_ID}` }) !==
    null
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  cacheEntry = undefined
  clearMasterDataDiagnostics()
  vi.stubEnv('VITE_GOOGLE_APPS_SCRIPT_URL', 'https://example.test/exec')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(localOperationalStore, 'readCachedMasterData').mockImplementation(async () =>
    ok(cacheEntry),
  )
  replaceCache = vi
    .spyOn(localOperationalStore, 'replaceMasterDataCache')
    .mockImplementation(async (masterData, fetchedAt) => {
      cacheEntry = { masterData, fetchedAt }
      return ok(undefined)
    })
})

afterEach(async () => {
  // Settle leftover requests so no shared single-flight request leaks into the next test.
  await act(async () => {
    scripts().forEach((script) => script.dispatchEvent(new Event('error')))
  })
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('Landing master data — valid cache', () => {
  it('shows cached personnel immediately; a failing background refresh never hides it', async () => {
    cacheEntry = { masterData: buildFixtureMasterData(), fetchedAt: new Date('2026-09-01') }
    renderAt('app')

    await waitFor(() => expect(scripts()).toHaveLength(1)) // AppRouter background refresh only
    expect(await checkerCandidateVisible()).toBe(true)
    await failRequest()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(await checkerCandidateVisible()).toBe(true)
    expect(replaceCache).not.toHaveBeenCalled()
  })
})

describe('Landing master data — empty cache', () => {
  it('AppRouter and Landing share one request; its validated result enables Checker search and is cached once', async () => {
    renderAt('app')
    await waitFor(() => expect(localOperationalStore.readCachedMasterData).toHaveBeenCalled())
    expect(scripts()).toHaveLength(1)

    await respond(validTables)

    await waitFor(async () => expect(await checkerCandidateVisible()).toBe(true))
    expect(replaceCache).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('an initial failure keeps the user on Landing with a clear error, its code and a Try Again button', async () => {
    renderAt('app')
    await waitFor(() => expect(scripts()).toHaveLength(1))
    await failRequest()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(UNAVAILABLE_EN)
    expect(screen.getByTestId('master-data-diagnostic')).toHaveTextContent(
      'APPS_SCRIPT_UNAVAILABLE',
    )
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeEnabled()
    expect(screen.getByRole('heading', { name: 'Ore Quality Assurance' })).toBeInTheDocument()
  })

  it('invalid Google data shows the code with table and row, never the sheet values', async () => {
    renderAt('welcome')
    await waitFor(() => expect(scripts()).toHaveLength(1))
    await respond(crewsWithNameOnlyRow)

    const diagnostic = await screen.findByTestId('master-data-diagnostic')
    expect(diagnostic).toHaveTextContent('MASTER_DATA_REMOTE_INVALID')
    expect(diagnostic).toHaveTextContent('Crews · row 3')
    expect(screen.getByRole('alert')).not.toHaveTextContent('Private Crew Name')
    expect(JSON.stringify(readMasterDataDiagnostics())).not.toContain('Private Crew Name')
    expect(replaceCache).not.toHaveBeenCalled()
  })

  it('manual retry shows loading, ignores rapid repeat clicks, then recovers Checker selection and clears the error', async () => {
    renderAt('welcome')
    await waitFor(() => expect(scripts()).toHaveLength(1))
    await failRequest()
    const retry = await screen.findByRole('button', { name: 'Try Again' })

    fireEvent.click(retry)
    fireEvent.click(retry)
    const loading = await screen.findByRole('button', { name: 'Loading…' })
    expect(loading).toBeDisabled()
    fireEvent.click(loading)
    await waitFor(() => expect(scripts()).toHaveLength(1))

    await respond(validTables)

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(await checkerCandidateVisible()).toBe(true)
    expect(replaceCache).toHaveBeenCalledTimes(1)
  })

  it('a failed retry re-enables the button with the new code', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderAt('welcome')
    await waitFor(() => expect(scripts()).toHaveLength(1))
    await failRequest()

    fireEvent.click(await screen.findByRole('button', { name: 'Try Again' }))
    await waitFor(() => expect(scripts()).toHaveLength(1))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })

    expect(await screen.findByRole('button', { name: 'Try Again' })).toBeEnabled()
    expect(screen.getByTestId('master-data-diagnostic')).toHaveTextContent('APPS_SCRIPT_TIMEOUT')
    vi.useRealTimers()
  })

  it('a stale error clears when a later shared refresh (e.g. reconnect) succeeds', async () => {
    renderAt('app')
    await waitFor(() => expect(scripts()).toHaveLength(1))
    await failRequest()
    expect(await screen.findByRole('alert')).toHaveTextContent(UNAVAILABLE_EN)

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await respond(validTables)

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(await checkerCandidateVisible()).toBe(true)
  })

  it('switching language while loading sends no extra request and the error follows the new language', async () => {
    renderAt('app')
    await waitFor(() => expect(scripts()).toHaveLength(1))

    await act(async () => {
      await i18n.changeLanguage('id')
    })
    expect(scripts()).toHaveLength(1)
    await failRequest()
    expect(await screen.findByRole('alert')).toHaveTextContent(UNAVAILABLE_ID)
    expect(screen.getByRole('button', { name: 'Coba Lagi' })).toBeEnabled()

    await act(async () => {
      await i18n.changeLanguage('en')
    })
    expect(scripts()).toHaveLength(0)
    expect(screen.getByRole('alert')).toHaveTextContent(UNAVAILABLE_EN)
  })

  it('a result arriving after unmount sets no state and raises no error', async () => {
    const consoleError = vi.spyOn(console, 'error')
    const { unmount } = renderAt('welcome')
    await waitFor(() => expect(scripts()).toHaveLength(1))
    unmount()

    await respond(validTables)

    expect(consoleError).not.toHaveBeenCalled()
    expect(replaceCache).toHaveBeenCalledTimes(1) // the shared refresh still completes and caches
  })
})

describe('Landing master data — explicit local-database and offline handling', () => {
  it('a cache-read failure is recorded as CACHE_READ and Landing still loads through the remote refresh', async () => {
    vi.mocked(localOperationalStore.readCachedMasterData).mockResolvedValueOnce(
      err({ code: 'LOCAL_DATABASE_OPERATION_FAILED', message: 'blocked' }),
    )
    renderAt('welcome')
    await waitFor(() => expect(scripts()).toHaveLength(1))
    await respond(validTables)

    expect(await checkerCandidateVisible()).toBe(true)
    expect(readMasterDataDiagnostics()).toEqual([
      expect.objectContaining({ stage: 'CACHE_READ', code: 'LOCAL_DATABASE_OPERATION_FAILED' }),
    ])
  })

  it('a cache-write failure after valid remote data is shown as LOCAL_DATABASE_OPERATION_FAILED', async () => {
    replaceCache.mockResolvedValueOnce(
      err({ code: 'LOCAL_DATABASE_OPERATION_FAILED', message: 'quota' }),
    )
    renderAt('welcome')
    await waitFor(() => expect(scripts()).toHaveLength(1))
    await respond(validTables)

    expect(await screen.findByTestId('master-data-diagnostic')).toHaveTextContent(
      'LOCAL_DATABASE_OPERATION_FAILED',
    )
    expect(readMasterDataDiagnostics()[0]).toMatchObject({ stage: 'CACHE_WRITE' })
  })

  it('offline with no cache shows the first-use hint and a retry, without any request', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderAt('welcome')

    expect(await screen.findByRole('alert')).toHaveTextContent(UNAVAILABLE_EN)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Internet is required to download master data for first use.',
    )
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeEnabled()
    expect(scripts()).toHaveLength(0)
  })
})
