import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useOutletContext, useParams } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { operationalFleetOptionsForPile } from '@/application/haulage-operation/operational-fleet-options'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export function ProductionRecordPage() {
  const { t } = useTranslation('production')
  const { t: tc } = useTranslation('common')
  const { workspace } = useOutletContext<ActiveWorkspaceContext>()
  const { pileId } = useParams<{ pileId: string }>()
  const navigate = useNavigate()
  const pile = workspace.piles.find((candidate) => candidate.id === pileId)
  const optionsResult = useMemo(
    () => (pile ? operationalFleetOptionsForPile(workspace.masterData, workspace.fleetSetup, pile.id) : undefined),
    [pile, workspace.fleetSetup, workspace.masterData],
  )
  const [selectedFrontId, setSelectedFrontId] = useState('')

  if (!pile) {
    return (
      <div>
        <PageHeader title={t('title')} />
        <div className="px-5 py-4">
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {t('errors.pileNotFound')}
          </p>
        </div>
      </div>
    )
  }

  if (!optionsResult?.ok) {
    return (
      <div>
        <PageHeader title={t('record.title', { pileId: pile.id })} />
        <div className="px-5 py-4">
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {t('errors.frontLoadFailed')}
          </p>
        </div>
      </div>
    )
  }

  const options = optionsResult.value

  return (
    <div>
      <PageHeader title={t('record.title', { pileId: pile.id })} />
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold">{pile.id}</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{pile.oreCode}</span>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('record.selectFront')}
              <select
                value={selectedFrontId}
                onChange={(event) => setSelectedFrontId(event.target.value)}
                className="h-12 rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="">—</option>
                {options.map((option) => (
                  <option key={option.frontId} value={option.frontId as string}>
                    {option.frontId}
                  </option>
                ))}
              </select>
            </label>

            {options.length === 0 ? <p className="text-sm text-muted-foreground">{t('record.noFront')}</p> : null}

            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate('/production?tab=record')}>
                {tc('fleetSetup.cancel')}
              </Button>
              <Button
                type="button"
                disabled={!selectedFrontId}
                onClick={() =>
                  navigate(
                    `/production/record/${encodeURIComponent(pile.id as string)}/haulage?front=${encodeURIComponent(selectedFrontId)}`,
                  )
                }
              >
                {tc('fleetSetup.continue')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
