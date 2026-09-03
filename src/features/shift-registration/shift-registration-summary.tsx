import { useTranslation } from 'react-i18next'
import type { SupportedLanguage } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Shift } from '@/domain/shift/shift'
import { formatShiftDateForDisplay } from '@/features/shift-registration/format-shift-date'

interface ShiftRegistrationSummaryProps {
  shift: Shift
  onEdit: () => void
}

export function ShiftRegistrationSummary({ shift, onEdit }: ShiftRegistrationSummaryProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.language as SupportedLanguage

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('shiftStart.review.title')}</CardTitle>
        <CardDescription>{t('shiftStart.review.message')}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
          <dt className="text-muted-foreground">{t('shiftStart.fields.date')}</dt>
          <dd className="text-right font-medium">{formatShiftDateForDisplay(shift.date, language)}</dd>

          <dt className="text-muted-foreground">{t('shiftStart.fields.shiftCode')}</dt>
          <dd className="text-right font-medium">{shift.shiftCode}</dd>

          <dt className="text-muted-foreground">{t('shiftStart.fields.sectorCode')}</dt>
          <dd className="text-right font-medium">{shift.sectorCode}</dd>

          <dt className="text-muted-foreground">{t('shiftStart.fields.samplingHouseCode')}</dt>
          <dd className="text-right font-medium">{shift.samplingHouseCode}</dd>
        </dl>

        <Button type="button" variant="secondary" className="mt-4 w-full" onClick={onEdit}>
          {t('shiftStart.review.edit')}
        </Button>
      </CardContent>
    </Card>
  )
}
