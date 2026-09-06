import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOutletContext } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { systemClock } from '@/application/common/clock'
import { buildShiftReport } from '@/application/reporting/build-shift-report'
import type { ReportLanguage, ShiftReport } from '@/application/reporting/report-types'
import { exportShiftWorkbook } from '@/features/export/export-shift-workbook'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { HaulageTransaction } from '@/domain/haulage/haulage-transaction'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'
import { downloadFile } from '@/infrastructure/device/download-file'
import { WhatsAppReportPreview } from '@/features/report/WhatsAppReportPreview'

type LoadPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | {
      readonly kind: 'loaded'
      readonly haulageTransactions: readonly HaulageTransaction[]
      readonly samplePositions: readonly SamplePosition[]
    }

const REPORT_LANGUAGES: readonly ReportLanguage[] = ['id', 'en']

/**
 * Router adapter for `/report` (Phase 18 §11, final correction §9).
 * Builds the Phase 14 `ShiftReport` in both languages from already-stored
 * workspace state (never a new calculation) — including real
 * `workspace.manpower` (Phase 18 §4) and `workspace.pendingBatches`, not
 * the placeholder `[]` this screen used before either existed. Renders
 * only the fixed `WhatsAppReportPreview` (its own header, Copy/Share, and
 * language toggle, reused verbatim) as the single operational report
 * preview — the earlier structured `ReportSections` view was a second,
 * duplicate presentation of the same report and has been removed, not
 * merely hidden — and offers a user-initiated Excel export (Phase 13).
 * Never touches ShiftStatus — finalization is out of scope here.
 */
export function ReportPage() {
  const { t } = useTranslation()
  const { workspace } = useOutletContext<ActiveWorkspaceContext>()
  const [phase, setPhase] = useState<LoadPhase>({ kind: 'loading' })
  const [exporting, setExporting] = useState(false)
  const [exportErrorCode, setExportErrorCode] = useState<string>()

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      localOperationalStore.listHaulageTransactionsForShift(workspace.shift.id),
      localOperationalStore.listSamplePositionsForShift(workspace.shift.id),
    ]).then(([haulageResult, sampleResult]) => {
      if (cancelled) return
      if (!haulageResult.ok || !sampleResult.ok) {
        setPhase({ kind: 'error' })
        return
      }
      setPhase({ kind: 'loaded', haulageTransactions: haulageResult.value, samplePositions: sampleResult.value })
    })

    return () => {
      cancelled = true
    }
  }, [workspace.shift.id])

  async function handleExport() {
    if (phase.kind !== 'loaded') return
    setExporting(true)
    setExportErrorCode(undefined)
    try {
      const result = await exportShiftWorkbook({
        shift: workspace.shift,
        piles: workspace.piles,
        haulageTransactions: phase.haulageTransactions,
        samplePositions: phase.samplePositions,
        pendingBatches: workspace.pendingBatches,
        masterData: workspace.masterData,
        clock: systemClock,
      })
      if (!result.ok) {
        setExportErrorCode(result.error.code)
        return
      }
      downloadFile(
        result.value.bytes,
        result.value.filename,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
    } finally {
      setExporting(false)
    }
  }

  if (phase.kind === 'loading') {
    return (
      <div>
        <PageHeader title={t('screens.report')} />
        <div className="px-4 py-4" aria-live="polite">
          <p className="text-sm text-muted-foreground">{t('report.loading')}</p>
        </div>
      </div>
    )
  }

  if (phase.kind === 'error') {
    return (
      <div>
        <PageHeader title={t('screens.report')} />
        <div className="px-4 py-4">
          <Card>
            <CardContent role="alert">
              <p>{t('report.errors.loadFailed')}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const reportResults = REPORT_LANGUAGES.map(
    (language) =>
      [
        language,
        buildShiftReport({
          language,
          shift: workspace.shift,
          piles: workspace.piles,
          haulageTransactions: phase.haulageTransactions,
          samplePositions: phase.samplePositions,
          masterData: workspace.masterData,
          manpowerAssignments: workspace.manpower.map((assignment) => ({
            personId: assignment.personId,
            name: assignment.name,
            jobDeskCode: assignment.jobDeskCode,
          })),
        }),
      ] as const,
  )
  const failed = reportResults.find(([, result]) => !result.ok)
  if (failed) {
    return (
      <div>
        <PageHeader title={t('screens.report')} />
        <div className="px-4 py-4">
          <Card>
            <CardContent role="alert">
              <p>{t('report.errors.buildFailed')}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const reports = Object.fromEntries(
    reportResults.map(([language, result]) => [language, (result as { ok: true; value: ShiftReport }).value]),
  ) as Record<ReportLanguage, ShiftReport>

  return (
    <div>
      <WhatsAppReportPreview reports={reports} />
      <div className="flex flex-col gap-2 px-4 pb-4">
        {exportErrorCode ? (
          <p role="alert" className="text-sm text-red-600">
            {t('report.errors.exportFailed')}
          </p>
        ) : null}
        <Button type="button" size="lg" variant="secondary" onClick={() => void handleExport()} disabled={exporting}>
          {exporting ? t('report.exporting') : t('report.exportExcel')}
        </Button>
      </div>
    </div>
  )
}
