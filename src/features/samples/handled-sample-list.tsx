import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import type { EmployeeReference } from '@/domain/master/references'
import type { SamplePosition } from '@/domain/sample-handling/sample-position'

interface HandledSampleListProps {
  samplePositions: readonly SamplePosition[]
  employees: readonly EmployeeReference[]
}

function employeeLabel(employees: readonly EmployeeReference[], employeeId: string): string {
  const employee = employees.find((candidate) => candidate.id === employeeId)
  return employee ? `${employee.id} — ${employee.name}` : employeeId
}

/**
 * Compact, read-only list of already-saved Sample Positions
 * (docs/ROADMAP.md Phase 11 §40). Deliberately has no Edit/Delete/
 * Correction/Void action — SamplePosition correction policy is
 * NEEDS_CONFIRMATION (BUSINESS_RULES.md §28).
 */
export function HandledSampleList({ samplePositions, employees }: HandledSampleListProps) {
  const { t } = useTranslation()

  if (samplePositions.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('sampleHandling.noHandledSamples')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {samplePositions.map((position) => (
        <Card key={position.id}>
          <CardContent className="flex flex-col gap-1">
            <p className="break-words text-sm font-semibold">{position.pileId}</p>
            <p className="text-xs text-muted-foreground">{position.oreCode}</p>
            <p className="text-sm">
              {t('sampleHandling.batch')} {Number(position.batchNumber)} · {Number(position.ritFrom)} →{' '}
              {Number(position.ritTo)}
            </p>
            <p className="text-sm">
              {t('sampleHandling.totalBag')}: {Number(position.totalBag)}
            </p>
            <p className="text-sm font-medium">
              {position.delivery.status === 'DELIVERED' ? t('sampleHandling.delivered') : t('sampleHandling.notPickedUp')}
            </p>
            {position.delivery.status === 'DELIVERED' ? (
              <>
                <p className="break-words text-xs text-muted-foreground">
                  {t('sampleHandling.destination')}: {position.delivery.destination}
                </p>
                {position.delivery.dispatcherEmployeeId ? (
                  <p className="break-words text-xs text-muted-foreground">
                    {t('sampleHandling.dispatcher')}: {employeeLabel(employees, position.delivery.dispatcherEmployeeId)}
                  </p>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
