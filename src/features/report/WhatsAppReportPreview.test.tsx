import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildShiftReport, type BuildShiftReportInput } from '@/application/reporting/build-shift-report'
import { formatWhatsAppReport } from '@/application/reporting/format-whatsapp-report'
import type { ReportLanguage, ShiftReport } from '@/application/reporting/report-types'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { ClipboardCopyResult } from '@/infrastructure/device/clipboard'
import type { ShareTextOutcome } from '@/infrastructure/device/text-share'
import {
  buildFixtureMasterData,
  buildFixtureSapPile,
  buildFixtureShift,
} from '@/test/fixtures/haulage-operation-test-fixtures'
import i18n from '@/i18n'
import { WhatsAppReportPreview, type WhatsAppReportPreviewProps } from './WhatsAppReportPreview'

const masterData = buildFixtureMasterData()
const pile = buildFixtureSapPile('PILE-1')

function buildReport(language: ReportLanguage): ShiftReport {
  const input: BuildShiftReportInput = {
    language,
    shift: buildFixtureShift('SHIFT-1'),
    piles: [pile],
    productionRecords: [],
    samplePositions: [],
    masterData,
    manpowerAssignments: [],
  }
  const result = buildShiftReport(input)
  if (!result.ok) throw new Error(`bad fixture: ${result.error.code}`)
  return result.value
}

const reports: Record<ReportLanguage, ShiftReport> = {
  id: buildReport('id'),
  en: buildReport('en'),
}

function renderPreview(overrides: Partial<WhatsAppReportPreviewProps> = {}) {
  const props: WhatsAppReportPreviewProps = { reports, ...overrides }
  return render(<WhatsAppReportPreview {...props} />)
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('WhatsAppReportPreview — preview text', () => {
  it('renders exactly the formatter output for the selected report language', () => {
    renderPreview()
    expect(screen.getByTestId('whatsapp-report-preview').textContent).toBe(formatWhatsAppReport(reports.id))
  })

  it('switching report language changes only the preview text, not the app language', async () => {
    const user = userEvent.setup()
    renderPreview()

    expect(screen.getByText('WhatsApp Report')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByTestId('whatsapp-report-preview')).toHaveTextContent('DAILY ORE QUALITY ASSURANCE REPORT')
    // App UI chrome stays English — the button label and title never re-translate to Indonesian.
    expect(screen.getByText('WhatsApp Report')).toBeInTheDocument()
    expect(i18n.language).toBe('en')

    await user.click(screen.getByRole('button', { name: 'Indonesian' }))
    expect(screen.getByTestId('whatsapp-report-preview')).toHaveTextContent('LAPORAN HARIAN JAMINAN KUALITAS BIJIH')
    expect(i18n.language).toBe('en')
  })
})

describe('WhatsAppReportPreview — copy', () => {
  it('sends exactly the visible preview string to the clipboard adapter and shows copied feedback', async () => {
    const user = userEvent.setup()
    let sentText: string | undefined
    const copyToClipboard = async (text: string): Promise<Result<ClipboardCopyResult, DomainError>> => {
      sentText = text
      return ok({ copied: true })
    }

    renderPreview({ copyToClipboard, isClipboardSupported: () => true })
    const visibleText = screen.getByTestId('whatsapp-report-preview').textContent
    await user.click(screen.getByRole('button', { name: 'Copy Report' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard'))
    expect(sentText).toBe(visibleText)
    expect(sentText).toBe(formatWhatsAppReport(reports.id))
  })

  it('shows a localized message on copy failure, never a raw error code/message', async () => {
    const user = userEvent.setup()
    const copyToClipboard = async (): Promise<Result<ClipboardCopyResult, DomainError>> =>
      err({ code: 'REPORT_COPY_FAILED', message: 'raw browser detail' })

    renderPreview({ copyToClipboard, isClipboardSupported: () => true })
    await user.click(screen.getByRole('button', { name: 'Copy Report' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Copy failed. Please try again.')
    expect(alert.textContent).not.toContain('raw browser detail')
    expect(alert.textContent).not.toContain('REPORT_COPY_FAILED')
  })
})

describe('WhatsAppReportPreview — share', () => {
  it('sends exactly the visible preview string to the share adapter', async () => {
    const user = userEvent.setup()
    let sentText: string | undefined
    const shareReportText = async (text: string): Promise<Result<ShareTextOutcome, DomainError>> => {
      sentText = text
      return ok({ kind: 'shared' })
    }

    renderPreview({ isShareSupported: () => true, shareReportText })
    const visibleText = screen.getByTestId('whatsapp-report-preview').textContent
    await user.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => expect(sentText).toBeDefined())
    expect(sentText).toBe(visibleText)
    expect(sentText).toBe(formatWhatsAppReport(reports.id))
  })

  it('a successful share shows feedback', async () => {
    const user = userEvent.setup()
    renderPreview({
      isShareSupported: () => true,
      shareReportText: async () => ok({ kind: 'shared' }),
    })

    await user.click(screen.getByRole('button', { name: 'Share' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Shared')
  })

  it('a cancelled share (AbortError outcome) shows no error feedback', async () => {
    const user = userEvent.setup()
    renderPreview({
      isShareSupported: () => true,
      shareReportText: async () => ok({ kind: 'cancelled' }),
    })

    await user.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('a share failure shows a localized message', async () => {
    const user = userEvent.setup()
    renderPreview({
      isShareSupported: () => true,
      shareReportText: async () => err({ code: 'REPORT_SHARE_FAILED', message: 'raw detail' }),
    })

    await user.click(screen.getByRole('button', { name: 'Share' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Share failed. Please try again.')
  })

  it('unsupported Web Share hides the Share button and shows an explicit unsupported note, while Copy stays available', () => {
    renderPreview({ isShareSupported: () => false, isClipboardSupported: () => true })

    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
    expect(screen.getByText('Share is not available on this device. Use Copy instead.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy Report' })).toBeEnabled()
  })
})
