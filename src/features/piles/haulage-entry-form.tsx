import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchableCombobox, type SearchableComboboxOption } from '@/components/shared/SearchableCombobox'

interface HaulageEntryFormProps {
  /** This Front's resolved effective-fleet Truck members — ranked first as quick-select chips (Phase 18 §6). */
  effectiveTruckIds: readonly string[]
  /** Every known master Truck, searchable regardless of fleet membership — selecting one outside the effective fleet is allowed; the domain marks it TRUCK SALAH. */
  allTruckIds: readonly string[]
  selectedTruckId: string
  onTruckChange: (truckId: string) => void
  onSubmit: () => void
  saving: boolean
  isSample: boolean
}

/**
 * Truck checker (Phase 18 §5/§6): the Front is already fixed from route
 * context and shown read-only elsewhere (`PileOperationalHeader`) — this
 * form only ever asks for the Truck. The expected effective-fleet Trucks
 * are offered as one-tap quick-select chips; the search box below
 * reaches every other known master Truck. Any selection is accepted —
 * whether it lands VALID or WRONG_TRUCK is a domain classification
 * (`validateTruckForFleet`), never decided here.
 */
export function HaulageEntryForm({
  effectiveTruckIds,
  allTruckIds,
  selectedTruckId,
  onTruckChange,
  onSubmit,
  saving,
  isSample,
}: HaulageEntryFormProps) {
  const { t } = useTranslation()
  const [truckQuery, setTruckQuery] = useState('')

  const canSubmit = selectedTruckId.length > 0 && !saving

  const truckSearchOptions: readonly SearchableComboboxOption[] = useMemo(() => {
    const normalized = truckQuery.trim().toLowerCase()
    if (!normalized) return []
    const effectiveSet = new Set(effectiveTruckIds)
    const matches = allTruckIds.filter((truckId) => truckId.toLowerCase().includes(normalized))
    const ranked = [...matches].sort((a, b) => Number(effectiveSet.has(b)) - Number(effectiveSet.has(a)))
    return ranked.map((truckId) => ({ value: truckId, label: truckId }))
  }, [allTruckIds, effectiveTruckIds, truckQuery])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit()
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            {!selectedTruckId && effectiveTruckIds.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {effectiveTruckIds.map((truckId) => (
                  <button
                    key={truckId}
                    type="button"
                    onClick={() => onTruckChange(truckId)}
                    className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary"
                  >
                    {truckId}
                  </button>
                ))}
              </div>
            ) : null}
            <SearchableCombobox
              label={t('pileHaulage.truck')}
              query={truckQuery}
              onQueryChange={setTruckQuery}
              options={truckSearchOptions}
              onSelect={(option) => {
                onTruckChange(option.value)
                setTruckQuery('')
              }}
              selectedLabel={selectedTruckId || undefined}
              clearLabel={t('fleetSetup.change')}
              onClearSelection={() => onTruckChange('')}
              placeholder={t('pileHaulage.searchTruckPlaceholder')}
              noResultsContent={<p className="text-sm text-muted-foreground">{t('pileHaulage.noTruckFound')}</p>}
            />
          </div>

          <Button type="submit" size="lg" className="h-14 w-full" disabled={!canSubmit}>
            {saving
              ? t('pileHaulage.recording')
              : isSample
                ? t('pileHaulage.recordSampleHaulage')
                : t('pileHaulage.recordHaulage')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
