import { useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { confirmHandoverImport } from '@/application/handover/confirm-handover-import'
import type { HandoverCarryOverState } from '@/application/handover/handover-carry-over'
import type { HandoverImportStore } from '@/application/handover/handover-import-store'
import type { HandoverImportPreview } from '@/application/handover/preview-handover-import'
import { previewHandoverImport } from '@/application/handover/preview-handover-import'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { ExpectedPreviousShift } from '@/domain/handover/expected-previous-shift'
import type { HandoverShiftInfo } from '@/domain/handover/handover-shift-info'
import { errorTranslationKey } from '@/features/handover/error-messages'
import { groupPendingBatchesByPile } from '@/features/handover/group-pending-batches-by-pile'
import { HandoverPilePreviewCard } from '@/features/handover/handover-pile-preview-card'
import type { HandoverFileReadResult } from '@/features/handover/read-handover-file'
import { readHandoverFile as defaultReadHandoverFile } from '@/features/handover/read-handover-file'
import type { Result } from '@/domain/common/result'

export interface HandoverPageProps {
  /** Explicitly supplied by the caller (Start Shift flow) — never invented by this screen (rule 3). */
  expectedPreviousShift: ExpectedPreviousShift
  /** Production callers pass the app-wide LocalOperationalStore singleton (it structurally satisfies this port); tests pass a lightweight fake. */
  store: HandoverImportStore
  /**
   * Called once a handover has been confirmed — the caller is
   * responsible for actually persisting the carry-over state atomically
   * with the new Shift workspace (`LocalOperationalStore
   * .initializeShiftWorkspace`'s `handoverImport` parameter). This
   * component never persists anything itself.
   */
  onImportReady: (carryOver: HandoverCarryOverState, previousShiftInfo: HandoverShiftInfo) => void
  /** ARCHITECTURE.md §7 "Start Without Previous Shift" — omitted when the caller does not offer that path. */
  onStartWithoutPreviousShift?: () => void
  /** Injectable so tests can supply a fake reader instead of real File/SheetJS/Web Crypto plumbing. */
  readFile?: (file: File) => Promise<Result<HandoverFileReadResult, { readonly code: string }>>
}

type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'error'; readonly code: string }
  /**
   * A previous-shift relationship mismatch (BLOCKING — no "continue
   * anyway" override until business policy/authorization is confirmed).
   * Kept distinct from `preview` so there is no code path that can ever
   * render an enabled Confirm action while mismatched.
   */
  | { readonly kind: 'mismatch'; readonly preview: HandoverImportPreview }
  | { readonly kind: 'preview'; readonly preview: HandoverImportPreview }

/**
 * The Previous Shift handover import screen (ROADMAP.md Phase 12,
 * UI_UX_SPEC.md §19-22): select a previous-shift Excel archive, validate
 * it, preview its reconstructed carry-over state, and confirm the
 * import. All parsing/validation/reconstruction is delegated to
 * `@/application/handover/**`/`@/domain/handover/**` — this component
 * only orchestrates and renders, and never imports SheetJS itself.
 * Nothing is ever persisted here: `previewHandoverImport` and
 * `confirmHandoverImport` are both non-destructive; the caller performs
 * the actual atomic persistence after `onImportReady` fires.
 */
export function HandoverPage({
  expectedPreviousShift,
  store,
  onImportReady,
  onStartWithoutPreviousShift,
  readFile = defaultReadHandoverFile,
}: HandoverPageProps) {
  const { t } = useTranslation()

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const isSubmittingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  /**
   * Guards against a stale async result overwriting a newer one: each
   * call to `handleFileSelected` claims the next id, and every `setPhase`
   * after an `await` first checks it still owns the latest id. This
   * covers both an older `readFile`/`previewHandoverImport` resolving
   * after a newer file selection already replaced it, and `readFile`
   * rejecting instead of resolving to a `Result` (defense in depth on
   * top of `readHandoverFile` itself never rejecting).
   */
  const requestIdRef = useRef(0)

  async function handleFileSelected(file: File) {
    const requestId = ++requestIdRef.current
    setPhase({ kind: 'checking' })

    let read: Result<HandoverFileReadResult, { readonly code: string }>
    try {
      read = await readFile(file)
    } catch {
      if (requestIdRef.current === requestId) {
        setPhase({ kind: 'error', code: 'FILE_READ_FAILED' })
      }
      return
    }
    if (requestIdRef.current !== requestId) {
      return
    }
    if (!read.ok) {
      setPhase({ kind: 'error', code: read.error.code })
      return
    }

    const preview = await previewHandoverImport({
      raw: read.value.raw,
      fingerprint: read.value.fingerprint,
      expectedPreviousShift,
      store,
    })
    if (requestIdRef.current !== requestId) {
      return
    }
    if (!preview.ok) {
      setPhase({ kind: 'error', code: preview.error.code })
      return
    }

    setPhase(
      preview.value.relationshipCheck.matches
        ? { kind: 'preview', preview: preview.value }
        : { kind: 'mismatch', preview: preview.value },
    )
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) {
      void handleFileSelected(file)
    }
  }

  function handleConfirm() {
    if (phase.kind !== 'preview' || isSubmittingRef.current) {
      return
    }
    isSubmittingRef.current = true
    const { preview } = phase
    const result = confirmHandoverImport({ preview })
    if (!result.ok) {
      // Defense in depth — the Confirm action is only ever reachable
      // from the 'preview' phase, which is only entered when the
      // relationship already matches, so this should not occur in
      // practice. Reset the guard so a genuine failure can be retried —
      // the success path below deliberately leaves it set (one-shot:
      // `onImportReady` must never fire twice for the same preview, and
      // nothing here transitions `phase` away from 'preview', so a rapid
      // double click must be blocked by the guard alone).
      isSubmittingRef.current = false
      setPhase({ kind: 'error', code: result.error.code })
      return
    }
    onImportReady(result.value, preview.archive.shiftInfo)
  }

  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      className="sr-only"
      onChange={handleFileInputChange}
      aria-label={t('handover.selectFile')}
    />
  )

  if (phase.kind === 'idle') {
    return (
      <div>
        <PageHeader title={t('handover.title')} />
        <div className="flex flex-col gap-4 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <p className="text-sm text-muted-foreground">{t('handover.description')}</p>
          {hiddenFileInput}
          <Button type="button" size="lg" className="w-full" onClick={() => fileInputRef.current?.click()}>
            {t('handover.selectFile')}
          </Button>
          {onStartWithoutPreviousShift ? (
            <Button type="button" variant="secondary" className="w-full" onClick={onStartWithoutPreviousShift}>
              {t('handover.startWithoutPreviousShift')}
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  if (phase.kind === 'checking') {
    return (
      <div>
        <PageHeader title={t('handover.title')} />
        <div className="px-5 py-4" aria-live="polite">
          {/* Kept mounted (not just present in 'idle'/'error'/'mismatch'/'preview')
              so a still-hanging check can never strand the operator without a
              file input to act on — `requestIdRef` in `handleFileSelected`
              ensures an abandoned in-flight check can't clobber whatever a
              newer selection resolves to. */}
          {hiddenFileInput}
          <p className="text-sm text-muted-foreground">{t('handover.checkingFile')}</p>
        </div>
      </div>
    )
  }

  if (phase.kind === 'error') {
    return (
      <div>
        <PageHeader title={t('handover.title')} />
        <div className="flex flex-col gap-4 px-5 py-4">
          {hiddenFileInput}
          <Card>
            <CardContent role="alert" className="flex flex-col gap-3">
              <p>{t(errorTranslationKey(phase.code))}</p>
              <Button type="button" onClick={() => fileInputRef.current?.click()}>
                {t('handover.chooseAnotherFile')}
              </Button>
            </CardContent>
          </Card>
          {onStartWithoutPreviousShift ? (
            <Button type="button" variant="secondary" className="w-full" onClick={onStartWithoutPreviousShift}>
              {t('handover.startWithoutPreviousShift')}
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  if (phase.kind === 'mismatch') {
    const { preview } = phase
    return (
      <div>
        <PageHeader title={t('handover.mismatchTitle')} />
        <div className="flex flex-col gap-4 px-5 py-4">
          {hiddenFileInput}
          <Card>
            <CardContent role="alert" className="flex flex-col gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{t('handover.mismatchImported')}</p>
                <p className="text-sm font-medium">
                  {preview.archive.shiftInfo.date} · {preview.archive.shiftInfo.shiftCode}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('handover.mismatchExpected')}</p>
                <p className="text-sm font-medium">
                  {expectedPreviousShift.date} · {expectedPreviousShift.shiftCode}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">{t('handover.mismatchMessage')}</p>
              <Button type="button" onClick={() => fileInputRef.current?.click()}>
                {t('handover.chooseAnotherFile')}
              </Button>
            </CardContent>
          </Card>
          {onStartWithoutPreviousShift ? (
            <Button type="button" variant="secondary" className="w-full" onClick={onStartWithoutPreviousShift}>
              {t('handover.startWithoutPreviousShift')}
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  const { preview } = phase
  const pileGroups = groupPendingBatchesByPile(preview.activePendingBatches)
  const pendingPileCount = preview.activeCarryOverPiles.length
  const pendingSampleCount = preview.pendingSamples.length

  return (
    <div>
      <PageHeader title={t('handover.previewTitle')} />
      <div className="flex flex-col gap-4 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {hiddenFileInput}

        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t('handover.previousShift')}</p>
            <p className="text-base font-semibold">
              {preview.archive.shiftInfo.date} · {preview.archive.shiftInfo.shiftCode}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-row justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{t('handover.pendingPiles')}</p>
              <p className="text-xl font-semibold" data-testid="pending-pile-count">
                {pendingPileCount}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('handover.pendingSamples')}</p>
              <p className="text-xl font-semibold" data-testid="pending-sample-count">
                {pendingSampleCount}
              </p>
            </div>
          </CardContent>
        </Card>

        {pileGroups.length === 0 && pendingSampleCount === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {t('handover.noPendingWork')}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {pileGroups.map((group) => (
              <HandoverPilePreviewCard key={group.pile.id} group={group} />
            ))}
          </div>
        )}

        <Button type="button" size="lg" className="w-full" onClick={handleConfirm}>
          {t('handover.confirmImport')}
        </Button>
      </div>
    </div>
  )
}
