import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { NewPileDraft } from '@/application/pile-master/create-pile-area-from-draft'
import { createPileAreaFromDraft } from '@/application/pile-master/create-pile-area-from-draft'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SectorCode } from '@/domain/common/codes'
import type { DomainError, Result } from '@/domain/common/result'
import type { MasterData } from '@/domain/master/master-data'
import { isOnline } from '@/infrastructure/device/connectivity'
import { pileMasterErrorTranslationKey } from '@/features/pile-master/error-messages'

/**
 * Generic in `T`: the workspace-active flow submits to `activateNewPile`
 * (`T = ActivatedPile`, a `Pile` + `PileAreaReference`), while the
 * pre-workspace Fleet Setup flow submits to `createPileAreaForSetup`
 * (`T = CreatedSetupPileArea`, a `PileAreaReference` + merged
 * `MasterData`) — same form, same derived-preview/offline-gate behavior,
 * different result shape for the caller to act on.
 */
export interface NewPileFormProps<T> {
  initialPileId: string
  sectorCode: SectorCode
  masterData: MasterData
  onSubmit: (draft: NewPileDraft) => Promise<Result<T, DomainError>>
  onCreated: (value: T) => void
  onCancel: () => void
}

/**
 * New Pile Master creation form (post-inspection correction §3) — Pile ID
 * comes from the search query that found no match; Sector, Stockpile, and
 * Ore are all read-only, derived from the Pile ID's confirmed canonical
 * naming grammar (`createPileAreaFromDraft` / `deriveCanonicalPileArea`).
 * There is no Stockpile text field and no Ore dropdown — an
 * unsupported/irregular Pile_ID pattern blocks submission with a stable
 * validation message instead of falling back to manual selection.
 *
 * Because this writes to the shared Google master, submission is also
 * blocked outright while offline, with a clear explanation rather than a
 * silently-disabled button — existing cached piles/operational work are
 * unaffected by this gate.
 */
export function NewPileForm<T>({
  initialPileId,
  sectorCode,
  masterData,
  onSubmit,
  onCreated,
  onCancel,
}: NewPileFormProps<T>) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [errorCode, setErrorCode] = useState<string>()

  const preview = createPileAreaFromDraft({ pileId: initialPileId }, sectorCode, masterData)
  const offline = !isOnline()

  async function handleSubmit() {
    if (saving || offline || !preview.ok) return
    setSaving(true)
    setErrorCode(undefined)
    try {
      const draft: NewPileDraft = { pileId: initialPileId }
      const result = await onSubmit(draft)
      if (!result.ok) {
        setErrorCode(result.error.code)
        return
      }
      onCreated(result.value)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pileMaster.addNewPile')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t('pileMaster.pileId')}</span>
          <output className="min-h-11 break-all rounded-md border border-border bg-muted px-3 py-2.5">
            {initialPileId}
          </output>
        </div>
        {preview.ok ? (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t('fleetSetup.sector')}</span>
              <output className="min-h-11 break-all rounded-md border border-border bg-muted px-3 py-2.5">
                {preview.value.sectorCode}
              </output>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t('pileMaster.stockpile')}</span>
              <output className="min-h-11 break-all rounded-md border border-border bg-muted px-3 py-2.5">
                {preview.value.stockpileCode}
              </output>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t('pileMaster.ore')}</span>
              <output className="min-h-11 break-all rounded-md border border-border bg-muted px-3 py-2.5">
                {preview.value.oreCode}
              </output>
            </div>
          </>
        ) : (
          <p role="alert" className="text-sm text-red-600">
            {t(pileMasterErrorTranslationKey(preview.error.code))}
          </p>
        )}

        {offline ? (
          <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {t('pileMaster.errors.requiresConnection')}
          </p>
        ) : errorCode ? (
          <p role="alert" className="text-sm text-red-600">
            {t(pileMasterErrorTranslationKey(errorCode))}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('fleetSetup.cancel')}
          </Button>
          <Button type="button" disabled={saving || offline || !preview.ok} onClick={() => void handleSubmit()}>
            {saving ? t('pileMaster.adding') : t('pileMaster.add')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
