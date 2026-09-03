import { useTranslation } from 'react-i18next'

interface EffectiveFleetPreviewProps {
  truckIds: readonly string[]
  errorKey?: string
  titleKey?: string
}

export function EffectiveFleetPreview({
  truckIds,
  errorKey,
  titleKey = 'fleetSetup.effectiveFleet',
}: EffectiveFleetPreviewProps) {
  const { t } = useTranslation()

  return (
    <section className="rounded-lg border border-primary/20 bg-muted/60 p-3" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold">{t(titleKey)}</h4>
        <span className="text-sm font-medium">
          {t('fleetSetup.truckCount')}: {truckIds.length}
        </span>
      </div>
      {errorKey ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {t(errorKey)}
        </p>
      ) : truckIds.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t('fleetSetup.noTrucks')}</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label={t(titleKey)}>
          {truckIds.map((truckId) => (
            <li
              key={truckId}
              className="max-w-full break-all rounded-md bg-background px-2.5 py-1.5 font-medium"
            >
              {truckId}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
