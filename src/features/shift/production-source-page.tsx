import { ArrowLeft, ChevronRight, ClipboardPaste, FilePlus2, FileUp } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export type ProductionSource = 'IMPORTED_FILE' | 'PASTED_REPORT' | 'MANUAL'

interface ProductionSourcePageProps {
  readonly onImportFile: () => void
  readonly onPasteReport: (report: string) => void
  readonly onCreateNew: () => void
  readonly onBack: () => void
}

/**
 * Selects how the unified Sample Setup editor receives its initial draft.
 * It never writes a workspace and does not contain a second sample editor.
 */
export function ProductionSourcePage({
  onImportFile,
  onPasteReport,
  onCreateNew,
  onBack,
}: ProductionSourcePageProps) {
  const [pastedReport, setPastedReport] = useState('')

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 py-3">
        <Button type="button" variant="ghost" onClick={onBack}><ArrowLeft aria-hidden="true" size={18} />Back</Button>
        <h1 className="type-page-title min-w-0 text-center">Production Data Setup</h1>
        <span />
      </header>

      <main className="flex min-h-0 flex-1 overflow-y-auto px-4 sm:px-5">
        <section className="mx-auto flex w-full max-w-xl flex-col justify-center gap-4 py-8 sm:py-10">
          <section className="rounded-2xl border border-border/80 bg-surface-elevated p-4 shadow-sm sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ClipboardPaste aria-hidden="true" size={21} />
              </span>
              <div className="min-w-0">
                <h2 className="type-section-title">Paste Text Report</h2>
                <p className="type-body-muted mt-1 text-muted-foreground">Paste production report text</p>
              </div>
            </div>

            <label htmlFor="pasted-production-report" className="sr-only">Paste Text Report</label>
            <textarea
              id="pasted-production-report"
              value={pastedReport}
              onChange={(event) => setPastedReport(event.target.value)}
              placeholder="Paste text laporan produksi sebelumnya..."
              className="type-field-value mt-4 min-h-40 w-full resize-y rounded-xl border border-border bg-input p-3 text-foreground placeholder:text-muted-foreground focus:border-focus-accent focus:bg-input-focus focus:outline-none focus:ring-2 focus:ring-focus-accent/60"
            />
            <Button type="button" className="mt-3 w-full" disabled={!pastedReport.trim()} onClick={() => onPasteReport(pastedReport)}>Analyze Text Report</Button>
          </section>

          <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
            <Button type="button" variant="secondary" className="h-auto min-h-24 justify-start whitespace-normal rounded-xl border border-border bg-surface-elevated px-4 py-3 text-left shadow-sm hover:bg-muted" onClick={onImportFile}>
              <FileUp aria-hidden="true" size={22} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1"><span className="type-section-title block">Import File</span><span className="type-caption mt-1 block text-muted-foreground">Import production report file</span></span>
              <ChevronRight aria-hidden="true" size={18} className="shrink-0 text-muted-foreground" />
            </Button>
            <Button type="button" variant="secondary" className="h-auto min-h-24 justify-start whitespace-normal rounded-xl border border-border bg-surface-elevated px-4 py-3 text-left shadow-sm hover:bg-muted" onClick={onCreateNew}>
              <FilePlus2 aria-hidden="true" size={22} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1"><span className="type-section-title block">Create New Production</span><span className="type-caption mt-1 block text-muted-foreground">Start with a blank production setup</span></span>
              <ChevronRight aria-hidden="true" size={18} className="shrink-0 text-muted-foreground" />
            </Button>
          </div>
        </section>
      </main>
    </div>
  )
}
