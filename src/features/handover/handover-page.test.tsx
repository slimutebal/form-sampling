import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FakeHandoverImportStore } from '@/application/handover/handover-test-fixtures'
import type { HandoverCarryOverState } from '@/application/handover/handover-carry-over'
import { parseShiftCode } from '@/domain/common/codes'
import { parseShiftDate } from '@/domain/common/shift-date'
import type { ExpectedPreviousShift } from '@/domain/handover/expected-previous-shift'
import type { RawHandoverWorkbook } from '@/domain/handover/raw-handover-workbook'
import type { HandoverShiftInfo } from '@/domain/handover/handover-shift-info'
import { err, ok } from '@/domain/common/result'
import type { Result } from '@/domain/common/result'
import i18n from '@/i18n'
import { HandoverPage, type HandoverPageProps } from '@/features/handover/handover-page'
import type { HandoverFileReadResult } from '@/features/handover/read-handover-file'

const VALID_APP_DATA = { FileType: 'FORM_SAMPLING_SHIFT', SchemaVersion: 1, Shift_ID: 'SHIFT-PREV-1' }
const VALID_SHIFT_INFO = { Shift_ID: 'SHIFT-PREV-1', Date: '2026-09-03', Shift: 'D', Sector: 'BR1', Location: 'HOUSE-1' }

function baseWorkbook(overrides: Partial<RawHandoverWorkbook> = {}): RawHandoverWorkbook {
  return {
    appData: VALID_APP_DATA,
    shiftInfo: VALID_SHIFT_INFO,
    pendingSample: [],
    samplePosition: [],
    ...overrides,
  }
}

function expectedPreviousShift(date: string, shiftCode: string): ExpectedPreviousShift {
  const dateResult = parseShiftDate(date)
  const shiftCodeResult = parseShiftCode(shiftCode)
  if (!dateResult.ok || !shiftCodeResult.ok) throw new Error('invalid test fixture')
  return { date: dateResult.value, shiftCode: shiftCodeResult.value }
}

function fakeReadFile(
  raw: RawHandoverWorkbook,
  fingerprint = 'fp-1',
): (file: File) => Promise<Result<HandoverFileReadResult, { readonly code: string }>> {
  return async () => ok({ raw, fingerprint })
}

function failingReadFile(code: string): (file: File) => Promise<Result<HandoverFileReadResult, { readonly code: string }>> {
  return async () => err({ code })
}

/** Simulates `readFile` rejecting outright instead of resolving to a `Result` — must never happen from the real `readHandoverFile`, but the component defends against it anyway. */
function rejectingReadFile(): (file: File) => Promise<Result<HandoverFileReadResult, { readonly code: string }>> {
  return () => Promise.reject(new Error('unexpected file-read failure'))
}

/** An externally-resolvable Promise, for controlling exactly when one in-flight `readFile` call settles relative to another. */
function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

async function selectAnyFile() {
  const input: HTMLInputElement = screen.getByLabelText('Select Excel File')
  const file = new File(['irrelevant'], 'previous-shift.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  await userEvent.upload(input, file)
}

function renderPage(overrides: Partial<HandoverPageProps> & { readFile: HandoverPageProps['readFile'] }) {
  const store = overrides.store ?? new FakeHandoverImportStore()
  const props: HandoverPageProps = {
    expectedPreviousShift: expectedPreviousShift('2026-09-03', 'D'),
    store,
    onImportReady: vi.fn(),
    ...overrides,
  }
  return { ...render(<HandoverPage {...props} />), props }
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('HandoverPage', () => {
  it('shows the file picker (and Start Without Previous Shift when offered) in the idle state', () => {
    const onStartWithoutPreviousShift = vi.fn()
    renderPage({ readFile: fakeReadFile(baseWorkbook()), onStartWithoutPreviousShift })

    expect(screen.getByRole('button', { name: 'Select Excel File' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Without Previous File' })).toBeInTheDocument()
  })

  it('imports a valid archive: previews multiple CONTINUE pending batches and pending samples, confirm succeeds', async () => {
    const onImportReady = vi.fn()
    const raw = baseWorkbook({
      pendingSample: [
        { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' },
        { Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 25, Last_Rit: 3, Status: 'CONTINUE' },
      ],
      samplePosition: [{ Pile_ID: 'L18_S09', Ore: 'SAP', Batch: 24, Rit_From: 2, Rit_To: 10, Status: 'NOT_PICKED_UP' }],
    })
    renderPage({ readFile: fakeReadFile(raw), onImportReady })

    await selectAnyFile()

    await waitFor(() => expect(screen.getByTestId('pending-pile-count')).toHaveTextContent('1'))
    expect(screen.getByTestId('pending-sample-count')).toHaveTextContent('1')
    expect(screen.getByText('L18_S09')).toBeInTheDocument()
    expect(screen.getByText('Batch 24 → last Rit 10')).toBeInTheDocument()
    expect(screen.getByText('Batch 25 → last Rit 3')).toBeInTheDocument()
    expect(screen.getByText('CONTINUE')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Confirm Import' }))

    await waitFor(() => expect(onImportReady).toHaveBeenCalledTimes(1))
    const [carryOver, previousShiftInfo] = onImportReady.mock.calls[0] as [HandoverCarryOverState, HandoverShiftInfo]
    expect(carryOver.pendingBatches).toHaveLength(2)
    expect(carryOver.pendingSamples).toHaveLength(1)
    expect(previousShiftInfo.shiftId).toBe('SHIFT-PREV-1')
  })

  it('HOLD batches are preserved but excluded from the active preview count/cards', async () => {
    const raw = baseWorkbook({
      pendingSample: [
        { Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' },
        { Pile_ID: 'PILE-2', Ore: 'LIM', Batch: 7, Last_Rit: 65, Status: 'HOLD' },
      ],
    })
    renderPage({ readFile: fakeReadFile(raw) })

    await selectAnyFile()

    await waitFor(() => expect(screen.getByTestId('pending-pile-count')).toHaveTextContent('1'))
    expect(screen.getByText('PILE-1')).toBeInTheDocument()
    expect(screen.queryByText('PILE-2')).not.toBeInTheDocument()
  })

  it('shows no pending work message for an archive with nothing to carry over', async () => {
    renderPage({ readFile: fakeReadFile(baseWorkbook()) })
    await selectAnyFile()
    await waitFor(() => expect(screen.getByText('No pending work in this archive.')).toBeInTheDocument())
    expect(screen.getByTestId('pending-pile-count')).toHaveTextContent('0')
    expect(screen.getByTestId('pending-sample-count')).toHaveTextContent('0')
  })

  it('shows a translated error (not a raw message) and lets the operator choose another file on a validation failure', async () => {
    renderPage({ readFile: fakeReadFile(baseWorkbook({ appData: { ...VALID_APP_DATA, SchemaVersion: 99 } })) })
    await selectAnyFile()

    await waitFor(() =>
      expect(
        screen.getByText("This archive's format is not supported by this app version."),
      ).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Choose Another File' })).toBeInTheDocument()
  })

  it('surfaces an App_Data/Shift_Info Shift_ID mismatch as a translated error, not a raw message', async () => {
    renderPage({
      readFile: fakeReadFile(
        baseWorkbook({
          appData: { ...VALID_APP_DATA, Shift_ID: 'SHIFT-PREV-1' },
          shiftInfo: { ...VALID_SHIFT_INFO, Shift_ID: 'SHIFT-PREV-2' },
        }),
      ),
    })
    await selectAnyFile()

    await waitFor(() =>
      expect(
        screen.getByText("This archive's shift information is inconsistent and cannot be imported."),
      ).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Choose Another File' })).toBeInTheDocument()
  })

  it('surfaces a Pile/Ore conflict between Pending_Sample and Sample_Position as a translated error, not a raw message', async () => {
    renderPage({
      readFile: fakeReadFile(
        baseWorkbook({
          pendingSample: [{ Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' }],
          samplePosition: [
            { Pile_ID: 'PILE-1', Ore: 'LIM', Batch: 24, Rit_From: 2, Rit_To: 10, Status: 'NOT_PICKED_UP' },
          ],
        }),
      ),
    })
    await selectAnyFile()

    await waitFor(() =>
      expect(
        screen.getByText('This archive has conflicting Ore data for the same Pile and cannot be imported.'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Choose Another File' })).toBeInTheDocument()
  })

  it('surfaces a duplicate import as a translated, blocking error', async () => {
    const store = new FakeHandoverImportStore()
    store.markImported('fp-1')
    renderPage({ readFile: fakeReadFile(baseWorkbook()), store })
    await selectAnyFile()

    await waitFor(() =>
      expect(screen.getByText('Previous shift already imported. No data duplicated.')).toBeInTheDocument(),
    )
  })

  it('propagates a file read failure without ever rendering a raw message', async () => {
    renderPage({ readFile: failingReadFile('MISSING_REQUIRED_SHEET') })
    await selectAnyFile()
    await waitFor(() =>
      expect(
        screen.getByText('This archive is missing required data and cannot be imported.'),
      ).toBeInTheDocument(),
    )
  })

  it('a previous-shift mismatch is unconditionally blocking — no Confirm Import action exists, and no "continue anyway" bypass', async () => {
    const onImportReady = vi.fn()
    renderPage({
      readFile: fakeReadFile(baseWorkbook()),
      expectedPreviousShift: expectedPreviousShift('2026-09-01', 'N'),
      onImportReady,
    })
    await selectAnyFile()

    await waitFor(() => expect(screen.getByText('Shift Mismatch')).toBeInTheDocument())
    expect(screen.getByText('2026-09-03 · D')).toBeInTheDocument()
    expect(screen.getByText('2026-09-01 · N')).toBeInTheDocument()
    // No Confirm Import button, no checkbox, no override of any kind —
    // the only actions are choosing another file or starting without one.
    expect(screen.queryByRole('button', { name: 'Confirm Import' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose Another File' })).toBeInTheDocument()
    expect(onImportReady).not.toHaveBeenCalled()
  })

  it('calls onStartWithoutPreviousShift when chosen', async () => {
    const onStartWithoutPreviousShift = vi.fn()
    renderPage({ readFile: fakeReadFile(baseWorkbook()), onStartWithoutPreviousShift })
    await userEvent.click(screen.getByRole('button', { name: 'Start Without Previous File' }))
    expect(onStartWithoutPreviousShift).toHaveBeenCalledTimes(1)
  })

  it('defensively catches an unexpected rejected readFile and shows a stable translated error, not a raw message', async () => {
    renderPage({ readFile: rejectingReadFile() })
    await selectAnyFile()

    await waitFor(() => expect(screen.getByText('Unable to read this file.')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Choose Another File' })).toBeInTheDocument()
  })

  it('a rapid double confirm invokes onImportReady exactly once and does not reset to an actionable preview state', async () => {
    const onImportReady = vi.fn()
    const raw = baseWorkbook({
      pendingSample: [{ Pile_ID: 'PILE-1', Ore: 'SAP', Batch: 24, Last_Rit: 10, Status: 'CONTINUE' }],
    })
    renderPage({ readFile: fakeReadFile(raw), onImportReady })
    await selectAnyFile()

    await waitFor(() => expect(screen.getByTestId('pending-pile-count')).toHaveTextContent('1'))

    const confirmButton = screen.getByRole('button', { name: 'Confirm Import' })
    // fireEvent invokes the click handler synchronously (unlike userEvent),
    // reproducing a genuine rapid double click/tap with no state update in
    // between — the only thing that can stop the second call is the guard
    // itself, not a re-render.
    fireEvent.click(confirmButton)
    fireEvent.click(confirmButton)

    expect(onImportReady).toHaveBeenCalledTimes(1)
  })

  it('an older in-flight file-read/preview result cannot overwrite a newer one', async () => {
    const stalePreview = createDeferred<Result<HandoverFileReadResult, { readonly code: string }>>()
    let callCount = 0
    const readFile = vi.fn(async (): Promise<Result<HandoverFileReadResult, { readonly code: string }>> => {
      callCount += 1
      if (callCount === 1) {
        return stalePreview.promise
      }
      return ok({ raw: baseWorkbook(), fingerprint: 'fp-newer' })
    })

    renderPage({ readFile })

    const fileA = new File(['a'], 'a.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const fileB = new File(['b'], 'b.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    // First selection starts a slow read that never resolves on its own.
    // The file input stays mounted through the 'checking' phase precisely
    // so a still-in-flight check can never strand the operator — which is
    // also what makes this second, overlapping selection possible here.
    // The idle→checking transition reorders sibling elements, so React
    // mounts a fresh <input> node rather than reusing the old one — it must
    // be re-queried after the first dispatch rather than reused.
    fireEvent.change(screen.getByLabelText('Select Excel File'), { target: { files: [fileA] } })
    fireEvent.change(screen.getByLabelText('Select Excel File'), { target: { files: [fileB] } })

    await waitFor(() => expect(screen.getByText('No pending work in this archive.')).toBeInTheDocument())

    // The stale first read now resolves with an error — it must not
    // overwrite the newer, already-rendered preview state.
    stalePreview.resolve(err({ code: 'MISSING_REQUIRED_SHEET' }))

    await waitFor(() => expect(screen.getByText('No pending work in this archive.')).toBeInTheDocument())
    expect(
      screen.queryByText('This archive is missing required data and cannot be imported.'),
    ).not.toBeInTheDocument()
  })
})
