import { ChevronRight, Database, Truck, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'

const items = [
  { to: '/manpower/edit', key: 'manpower', Icon: Users },
  { to: '/piles', key: 'pile', Icon: Database },
  { to: '/fleet', key: 'fleet', Icon: Truck },
] as const

export function RegistrationPage() {
  const { t } = useTranslation('registration')

  return (
    <div>
      <PageHeader title={t('title')} />
      <div className="flex flex-col gap-3 px-5 py-4">
        {items.map(({ to, key, Icon }) => (
          <Link key={to} to={to}>
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon aria-hidden="true" size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t(`${key}.title`)}</p>
                  <p className="text-sm text-muted-foreground">{t(`${key}.description`)}</p>
                </div>
                <ChevronRight aria-hidden="true" size={20} className="text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
