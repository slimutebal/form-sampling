import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatWhatsAppReport } from '@/application/reporting/format-whatsapp-report'
import type { ReportLanguage, ShiftReport } from '@/application/reporting/report-types'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { DomainError, Result } from '@/domain/common/result'
import { copyTextToClipboard, isClipboardCopySupported, type ClipboardCopyResult } from '@/infrastructure/device/clipboard'
import { isTextShareSupported, shareText, type ShareTextOutcome } from '@/infrastructure/device/text-share'

export interface WhatsAppReportPreviewProps {
  /**
   * Both language variants of the already-built Phase 14 `ShiftReport`.
   * This component never rebuilds/recalculates a report — switching the
   * report language only swaps which of these two pre-built DTOs is
   * formatted and shown (ROADMAP Phase 15 §10/§15).
   */
  reports: Record<ReportLanguage, ShiftReport>
  /** Which report language is selected first. Independent of the app's own i18n language. */
  initialReportLanguage?: ReportLanguage
  /** Injectable clipboard adapter — defaults to the real device adapter; tests supply a fake. */
  copyToClipboard?: (text: string) => Promise<Result<ClipboardCopyResult, DomainError>>
  /** Injectable share adapter — defaults to the real device adapter; tests supply a fake. */
  shareReportText?: (text: string) => Promise<Result<ShareTextOutcome, DomainError>>
  /** Injectable clipboard-support detector — defaults to the real feature detection. */
  isClipboardSupported?: () => boolean
  /** Injectable share-support detector — defaults to the real feature detection. */
  isShareSupported?: () => boolean
}

type Feedback = { readonly kind: 'copied' } | { readonly kind: 'shared' } | { readonly kind: 'error'; readonly code: string }

function feedbackTranslationKey(feedback: Feedback | undefined): string | undefined {
  if (!feedback) return undefined
  if (feedback.kind === 'copied') return 'whatsAppReport.copied'
  if (feedback.kind === 'shared') return 'whatsAppReport.sharedFeedback'
  switch (feedback.code) {
    case 'REPORT_COPY_UNSUPPORTED':
      return 'whatsAppReport.errors.copyUnsupported'
    case 'REPORT_COPY_FAILED':
      return 'whatsAppReport.errors.copyFailed'
    case 'REPORT_SHARE_UNSUPPORTED':
      return 'whatsAppReport.errors.shareUnsupported'
    case 'REPORT_SHARE_FAILED':
      return 'whatsAppReport.errors.shareFailed'
    default:
      return 'whatsAppReport.errors.generic'
  }
}

/**
 * Standalone field-ready WhatsApp Report screen (ROADMAP Phase 15 §14):
 * Generate → Preview → Copy → Share. Not yet wired into the app
 * index/router (Phase 18). The formatted text shown in the `<pre>`
 * preview is exactly what Copy and Share send — one text-generation
 * path (`formatWhatsAppReport`), no regeneration on Copy/Share.
 */
export function WhatsAppReportPreview({
  reports,
  initialReportLanguage = 'id',
  copyToClipboard = copyTextToClipboard,
  shareReportText = shareText,
  isClipboardSupported = isClipboardCopySupported,
  isShareSupported = isTextShareSupported,
}: WhatsAppReportPreviewProps) {
  const { t } = useTranslation()
  const [reportLanguage, setReportLanguage] = useState<ReportLanguage>(initialReportLanguage)
  const [feedback, setFeedback] = useState<Feedback>()
  const [copying, setCopying] = useState(false)
  const [sharing, setSharing] = useState(false)

  const report = reports[reportLanguage]
  const text = useMemo(() => formatWhatsAppReport(report), [report])

  const clipboardSupported = isClipboardSupported()
  const shareSupported = isShareSupported()

  function handleLanguageChange(language: ReportLanguage) {
    setReportLanguage(language)
    setFeedback(undefined)
  }

  async function handleCopy() {
    setCopying(true)
    setFeedback(undefined)
    try {
      const result = await copyToClipboard(text)
      setFeedback(result.ok ? { kind: 'copied' } : { kind: 'error', code: result.error.code })
    } finally {
      setCopying(false)
    }
  }

  async function handleShare() {
    setSharing(true)
    setFeedback(undefined)
    try {
      const result = await shareReportText(text)
      if (!result.ok) {
        setFeedback({ kind: 'error', code: result.error.code })
        return
      }
      // A cancelled native share sheet is deliberately not surfaced as
      // feedback — ROADMAP Phase 15 §12: cancellation is not a failure.
      if (result.value.kind === 'shared') {
        setFeedback({ kind: 'shared' })
      }
    } finally {
      setSharing(false)
    }
  }

  const feedbackKey = feedbackTranslationKey(feedback)

  return (
    <div>
      <PageHeader title={t('whatsAppReport.title')} />
      <div className="flex flex-col gap-4 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t('whatsAppReport.reportLanguage')}</p>
            <div className="flex flex-row gap-2">
              <Button
                type="button"
                variant={reportLanguage === 'id' ? 'primary' : 'secondary'}
                aria-pressed={reportLanguage === 'id'}
                onClick={() => handleLanguageChange('id')}
              >
                {t('settings.languageId')}
              </Button>
              <Button
                type="button"
                variant={reportLanguage === 'en' ? 'primary' : 'secondary'}
                aria-pressed={reportLanguage === 'en'}
                onClick={() => handleLanguageChange('en')}
              >
                {t('settings.languageEn')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-x-hidden">
          <CardContent>
            <pre
              data-testid="whatsapp-report-preview"
              className="w-full max-w-full overflow-x-hidden whitespace-pre-wrap break-words text-sm"
            >
              {text}
            </pre>
          </CardContent>
        </Card>

        {feedbackKey ? (
          <p
            role={feedback?.kind === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            className={feedback?.kind === 'error' ? 'text-sm text-red-600' : 'text-sm font-medium text-emerald-700'}
          >
            {t(feedbackKey)}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button type="button" size="lg" onClick={() => void handleCopy()} disabled={!clipboardSupported || copying}>
            {t('whatsAppReport.copyReport')}
          </Button>
          {shareSupported ? (
            <Button type="button" size="lg" variant="secondary" onClick={() => void handleShare()} disabled={sharing}>
              {t('whatsAppReport.share')}
            </Button>
          ) : (
            <p role="note" className="text-sm text-muted-foreground">
              {t('whatsAppReport.errors.shareUnsupported')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
