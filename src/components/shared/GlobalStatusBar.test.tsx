import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { pwaUpdateStore } from '@/app/startup/pwa-update-store'
import type { CurrentShiftWorkspace, ShiftWorkspaceReader } from '@/application/ports/shift-workspace-reader'
import type { ShiftSummarySyncStatusReader, SyncStatusRecord } from '@/application/pwa/sync-presentation'
import type { Shift } from '@/domain/shift/shift'
import { GlobalStatusBar } from './GlobalStatusBar'

function fakeSyncReader(records: readonly SyncStatusRecord[]): ShiftSummarySyncStatusReader {
  return { listShiftSummarySyncRecords: async () => ({ ok: true, value: records }) }
}

function fakeActiveShiftReader(hasActiveShift: boolean): ShiftWorkspaceReader {
  const value: CurrentShiftWorkspace | undefined = hasActiveShift ? { shift: { id: 'SHIFT-1' } as unknown as Shift } : undefined
  return { loadCurrentShiftWorkspace: async () => ({ ok: true, value }) }
}

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

function renderBar(syncReader: ShiftSummarySyncStatusReader, activeShiftReader: ShiftWorkspaceReader) {
  return render(
    <I18nextProvider i18n={i18n}>
      <GlobalStatusBar syncReader={syncReader} activeShiftReader={activeShiftReader} />
    </I18nextProvider>,
  )
}

describe('GlobalStatusBar', () => {
  beforeEach(() => {
    void i18n.changeLanguage('en')
    pwaUpdateStore.setUpdater(undefined)
    pwaUpdateStore.setNeedRefresh(false)
    pwaUpdateStore.setOfflineReady(false)
  })

  afterEach(() => {
    setNavigatorOnLine(true)
  })

  it('shows Online when the browser is connected', async () => {
    setNavigatorOnLine(true)
    renderBar(fakeSyncReader([]), fakeActiveShiftReader(false))
    expect(screen.getByText('Online')).toBeInTheDocument()
    await act(async () => {
      await Promise.resolve()
    })
  })

  it('shows Offline and the saved-locally notice when disconnected', async () => {
    setNavigatorOnLine(false)
    renderBar(fakeSyncReader([]), fakeActiveShiftReader(false))
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.getByText('Offline — work is saved on this device.')).toBeInTheDocument()
    await act(async () => {
      await Promise.resolve()
    })
  })

  it('shows a pending count when a PENDING sync row exists', async () => {
    renderBar(fakeSyncReader([{ status: 'PENDING' }]), fakeActiveShiftReader(false))
    expect(await screen.findByText('1 pending')).toBeInTheDocument()
  })

  it('shows a failed count, outranking pending, when a FAILED row exists', async () => {
    renderBar(fakeSyncReader([{ status: 'PENDING' }, { status: 'FAILED' }]), fakeActiveShiftReader(false))
    expect(await screen.findByText('1 failed')).toBeInTheDocument()
    expect(screen.queryByText('1 pending')).not.toBeInTheDocument()
  })

  it('never renders a raw infrastructure error message when the sync read fails', async () => {
    const reader: ShiftSummarySyncStatusReader = {
      listShiftSummarySyncRecords: async () => ({ ok: false, error: { code: 'LOCAL_DATABASE_OPERATION_FAILED', message: 'raw internal detail' } }),
    }
    renderBar(reader, fakeActiveShiftReader(false))
    await waitFor(() => expect(screen.getByText('All synced')).toBeInTheDocument())
    expect(screen.queryByText('raw internal detail')).not.toBeInTheDocument()
  })

  it('shows Update Available when the PWA store reports needRefresh, without ever calling the updater automatically', async () => {
    const updater = vi.fn().mockResolvedValue(undefined)
    pwaUpdateStore.setUpdater(updater)
    pwaUpdateStore.setNeedRefresh(true)

    renderBar(fakeSyncReader([]), fakeActiveShiftReader(true))

    expect(await screen.findAllByText('Update available')).not.toHaveLength(0)
    expect(updater).not.toHaveBeenCalled()
  })

  it('with an active shift, shows the saved-locally notice and Update Later never calls the updater', async () => {
    const updater = vi.fn().mockResolvedValue(undefined)
    pwaUpdateStore.setUpdater(updater)
    pwaUpdateStore.setNeedRefresh(true)
    const user = userEvent.setup()

    renderBar(fakeSyncReader([]), fakeActiveShiftReader(true))

    expect(await screen.findByText('Current work is saved on this device.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Update Later' }))

    expect(updater).not.toHaveBeenCalled()
  })

  it('Update Now calls the registered updater exactly once, only on explicit action', async () => {
    const updater = vi.fn().mockResolvedValue(undefined)
    pwaUpdateStore.setUpdater(updater)
    pwaUpdateStore.setNeedRefresh(true)
    const user = userEvent.setup()

    renderBar(fakeSyncReader([]), fakeActiveShiftReader(false))

    await user.click(await screen.findByRole('button', { name: 'Update Now' }))

    expect(updater).toHaveBeenCalledTimes(1)
    expect(updater).toHaveBeenCalledWith(true)
  })
})
