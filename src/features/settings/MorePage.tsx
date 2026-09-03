import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card'

export function MorePage() {
  const { t } = useTranslation()

  return (
    <div>
      <PageHeader title={t('screens.more')} />
      <div className="flex flex-col gap-4 px-4 py-4">
        <Card>
          <CardTitle>{t('settings.language')}</CardTitle>
          <CardDescription>{t('placeholder.screenNotice')}</CardDescription>
          <CardContent className="mt-3">
            <LanguageSwitcher />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
