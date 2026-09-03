import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { Button } from '@/components/ui/button'

export function WelcomePage() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t('welcome.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('welcome.subtitle')}</p>
      </div>
      <LanguageSwitcher />
      <Button asChild size="lg" className="w-full">
        <Link to="/start">{t('welcome.continue')}</Link>
      </Button>
    </div>
  )
}
