import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/PageHeader'

interface PlaceholderScreenProps {
  titleKey: string
}

export function PlaceholderScreen({ titleKey }: PlaceholderScreenProps) {
  const { t } = useTranslation()

  return (
    <div>
      <PageHeader title={t(titleKey)} />
      <div className="px-4 py-4">
        <Card>
          <CardContent>{t('placeholder.screenNotice')}</CardContent>
        </Card>
      </div>
    </div>
  )
}
