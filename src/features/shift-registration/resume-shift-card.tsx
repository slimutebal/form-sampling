import { useTranslation } from 'react-i18next'
import type { SupportedLanguage } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Shift } from '@/domain/shift/shift'
import { formatShiftDateForDisplay } from '@/features/shift-registration/format-shift-date'

interface ResumeShiftCardProps {
  shift: Shift
  onResume: () => void
  onStartNew: () => void
}

export function ResumeShiftCard({ shift, onResume, onStartNew }: ResumeShiftCardProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.language as SupportedLanguage

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('shiftStart.resume.title')}</CardTitle>
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

          <dt className="text-muted-foreground">{t('shiftStart.fields.status')}</dt>
          <dd className="text-right font-medium">{t(`shiftStart.status.${shift.status}`)}</dd>
        </dl>

        <div className="mt-4 flex flex-col gap-2">
          <Button type="button" size="lg" className="w-full" onClick={onResume}>
            {t('shiftStart.resume.resumeAction')}
          </Button>
          <Button type="button" variant="secondary" className="w-full" onClick={onStartNew}>
            {t('shiftStart.resume.startNewAction')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
