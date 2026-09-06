import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { NewPileDraft } from '@/application/pile-master/create-pile-area-from-draft'
import type { ActivatedPile } from '@/application/pile-master/activate-new-pile'
import type { ShiftId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { deriveFrontLineage } from '@/domain/fleet/front-lineage'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import { createPile, type Pile } from '@/domain/pile/pile'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchableCombobox, type SearchableComboboxOption } from '@/components/shared/SearchableCombobox'
import { addPileErrorTranslationKey } from '@/features/piles/error-messages'
import { NewPileForm } from '@/features/pile-master/new-pile-form'
import type { LocalShiftWorkspace } from '@/infrastructure/local-db/local-operational-store'

/**
 * Every ACTIVE Front whose Destination is `pileId`, grouped per Pile
 * (Phase 18 §3/§4) — a HISTORICAL Front (superseded by a continuation)
 * never appears. A Front with no configured Destination is unscoped and
 * intentionally excluded here (it never belongs to a specific Pile card).
 */
function groupActiveFrontIdsByDestinationPile(fleetSetup: FleetSetup): ReadonlyMap<string, readonly string[]> {
  const lineage = deriveFrontLineage(fleetSetup)
  const activeFrontIds = new Set(lineage.activeFrontIds)
  const grouped = new Map<string, string[]>()
  for (const front of fleetSetup.fronts) {
    if (!activeFrontIds.has(front.frontId) || !front.destinationPileId) continue
    const key = front.destinationPileId as string
    const list = grouped.get(key)
    if (list) {
      list.push(front.frontId as string)
    } else {
      grouped.set(key, [front.frontId as string])
    }
  }
  return grouped
}

/** The smallest write shape the "Add Pile" flow needs from `LocalOperationalStore`. */
export interface PilesListPageStore {
  addPileToWorkspace(shiftId: ShiftId, pile: Pile): Promise<Result<void, DomainError>>
}

export interface PilesListPageProps {
  workspace: LocalShiftWorkspace
  /** Production callers pass the app-wide LocalOperationalStore singleton (it structurally satisfies this port); tests pass a lightweight fake. */
  store: PilesListPageStore
  /** Called after a Pile is successfully added, so the caller can refresh the shared workspace context (this component never re-reads the workspace itself). */
  onPileAdded: () => void
  /** New Pile Master creation (Phase 18 §6) — production callers pass `activateAppsScriptPile` bound to this shift; tests pass a fake. Omit to hide the "+ Tambah Pile Baru" action entirely (e.g. a caller not ready to wire the Google write yet). */
  createNewPile?: (draft: NewPileDraft) => Promise<Result<ActivatedPile, DomainError>>
}

/**
 * The Piles list (Phase 18 "Add Pile" wiring correction + §6/§7) — shows
 * only `workspace.piles`, the workspace's own active Pile list, never
 * `masterData.pileAreas` (that is a master catalog/selection source, not
 * an active-pile list). Search-then-select over the existing sector
 * master catalog (never a giant native select); when a search finds no
 * existing Pile_ID, offers New Pile Master creation instead. Ore is
 * always the selected/created PileArea's own Ore, never typed manually
 * for an existing pile.
 */
export function PilesListPage({ workspace, store, onPileAdded, createNewPile }: PilesListPageProps) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorCode, setErrorCode] = useState<string>()

  const activePileIds = new Set(workspace.piles.map((pile) => pile.id as string))
  const candidates = workspace.masterData.pileAreas.filter(
    (pileArea) => pileArea.sectorCode === workspace.shift.sectorCode && !activePileIds.has(pileArea.pileId as string),
  )
  const activeFrontIdsByPileId = useMemo(
    () => groupActiveFrontIdsByDestinationPile(workspace.fleetSetup),
    [workspace.fleetSetup],
  )

  const searchOptions: readonly SearchableComboboxOption[] = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return []
    return candidates
      .filter(
        (pileArea) =>
          (pileArea.pileId as string).toLowerCase().includes(normalized) ||
          (pileArea.stockpileCode as string).toLowerCase().includes(normalized),
      )
      .map((pileArea) => ({
        value: pileArea.pileId as string,
        label: pileArea.pileId as string,
        description: `${pileArea.oreCode} · ${pileArea.stockpileCode}`,
      }))
  }, [candidates, query])

  function openAddPile() {
    setAdding(true)
    setQuery('')
    setCreatingNew(false)
    setErrorCode(undefined)
  }

  function cancelAddPile() {
    setAdding(false)
    setQuery('')
    setCreatingNew(false)
    setErrorCode(undefined)
  }

  async function handleSelectExisting(option: SearchableComboboxOption) {
    const candidate = candidates.find((pileArea) => pileArea.pileId === option.value)
    if (!candidate || saving) return
    setSaving(true)
    setErrorCode(undefined)
    try {
      const result = await store.addPileToWorkspace(workspace.shiftId, createPile(candidate.pileId, candidate.oreCode))
      if (!result.ok) {
        setErrorCode(result.error.code)
        return
      }
      cancelAddPile()
      onPileAdded()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title={t('screens.piles')} />
      <div className="flex flex-col gap-3 px-5 py-4">
        {workspace.piles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {t('piles.noPiles')}
          </p>
        ) : (
          workspace.piles.map((pile) => {
            const activeFrontIds = activeFrontIdsByPileId.get(pile.id as string) ?? []
            return (
              <Card key={pile.id}>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex flex-row items-center justify-between">
                    <span className="font-semibold">{pile.id}</span>
                    <span className="text-sm text-muted-foreground">{pile.oreCode}</span>
                  </div>
                  {activeFrontIds.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('piles.noActiveFront')}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {activeFrontIds.map((frontId) => (
                        <Link
                          key={frontId}
                          to={`/piles/${pile.id}?front=${encodeURIComponent(frontId)}`}
                          className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-sm font-medium text-primary"
                        >
                          {frontId}
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}

        {errorCode ? (
          <p role="alert" className="text-sm text-red-600">
            {t(addPileErrorTranslationKey(errorCode))}
          </p>
        ) : null}

        {adding ? (
          creatingNew ? (
            <NewPileForm
              initialPileId={query.trim()}
              sectorCode={workspace.shift.sectorCode}
              masterData={workspace.masterData}
              onSubmit={(draft) => {
                if (!createNewPile) {
                  return Promise.resolve({
                    ok: false as const,
                    error: { code: 'PILE_MASTER_CREATION_UNAVAILABLE', message: 'New Pile Master creation is not available here' },
                  })
                }
                return createNewPile(draft)
              }}
              onCreated={() => {
                cancelAddPile()
                onPileAdded()
              }}
              onCancel={() => setCreatingNew(false)}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col gap-3">
                <SearchableCombobox
                  label={t('piles.searchPileToAdd')}
                  query={query}
                  onQueryChange={setQuery}
                  options={searchOptions}
                  onSelect={(option) => void handleSelectExisting(option)}
                  clearLabel={t('fleetSetup.change')}
                  onClearSelection={() => setQuery('')}
                  placeholder={t('piles.searchPileToAddPlaceholder')}
                  noResultsContent={
                    createNewPile ? (
                      <Button type="button" variant="secondary" onClick={() => setCreatingNew(true)}>
                        {t('pileMaster.addNewPileNamed', { pileId: query.trim() })}
                      </Button>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t('piles.noPileCandidates')}</p>
                    )
                  }
                />
                <Button type="button" variant="secondary" onClick={cancelAddPile}>
                  {t('fleetSetup.cancel')}
                </Button>
              </CardContent>
            </Card>
          )
        ) : (
          <Button type="button" size="lg" onClick={openAddPile}>
            {t('piles.addPile')}
          </Button>
        )}
      </div>
    </div>
  )
}
