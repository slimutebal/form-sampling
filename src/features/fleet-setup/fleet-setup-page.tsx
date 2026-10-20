import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createFleetSetupFromDraft } from '@/application/fleet-setup/create-fleet-setup-from-draft'
import { previewEffectiveFleet } from '@/application/fleet-setup/effective-fleet-preview'
import { generateFleetId as defaultGenerateFleetId, type FleetIdGenerator } from '@/application/fleet-setup/fleet-id-generator'
import { formatFleetFullCode, formatFleetShortLabel } from '@/application/fleet-setup/fleet-assignment-identity'
import { createEmptyFleetSetupDraftEntry, type FleetSetupDraftEntry } from '@/application/fleet-setup/fleet-setup-draft'
import type { CreatedSetupPileArea } from '@/application/pile-master/create-pile-area-for-setup'
import type { NewPileDraft } from '@/application/pile-master/create-pile-area-from-draft'
import type { DomainError, Result } from '@/domain/common/result'
import { displayExcaCode } from '@/domain/fleet/exca-code'
import type { PileId } from '@/domain/common/identifiers'
import type { FleetSetup } from '@/domain/fleet/fleet-setup'
import type { MasterData } from '@/domain/master/master-data'
import type { Shift } from '@/domain/shift/shift'
import { Button } from '@/components/ui/button'
import { fleetErrorTranslationKey } from '@/features/fleet-setup/error-messages'
import { FrontEditor } from '@/features/fleet-setup/front-editor'
import { formatShiftDateForDisplay } from '@/features/shift-registration/format-shift-date'

export interface FleetSetupPageProps {
  shift: Shift
  masterData: MasterData
  onFleetSetupReady: (fleetSetup: FleetSetup) => void
  onBack?: () => void
  initialEntries?: readonly FleetSetupDraftEntry[]
  onEntriesChange?: (entries: readonly FleetSetupDraftEntry[]) => void
  generateFleetId?: FleetIdGenerator
  /** Retained for caller compatibility; setup destinations now come only from Pile Registration. */
  createNewPile?: (draft: NewPileDraft) => Promise<Result<CreatedSetupPileArea, DomainError>>
  onMasterDataUpdated?: (masterData: MasterData) => void
  /** Active Pile Registration projection used for new Fleet destinations. */
  eligibleDestinationPileIds?: readonly PileId[]
}

function shiftLabel(shiftCode: string): string {
  return shiftCode.startsWith('N') ? 'Night Shift' : 'Day Shift'
}

export function FleetSetupPage({
  shift,
  masterData,
  onFleetSetupReady,
  onBack,
  initialEntries = [],
  onEntriesChange,
  generateFleetId = defaultGenerateFleetId,
  eligibleDestinationPileIds,
}: FleetSetupPageProps) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<readonly FleetSetupDraftEntry[]>(initialEntries)
  const [editing, setEditing] = useState<FleetSetupDraftEntry>()
  const [openActionFleetId, setOpenActionFleetId] = useState<string>()
  const [pendingDelete, setPendingDelete] = useState<FleetSetupDraftEntry>()
  const [pageErrorKey, setPageErrorKey] = useState<string>()

  const previews = useMemo(
    () => new Map(entries.map((entry) => [entry.fleetId, previewEffectiveFleet(entries, shift, masterData, entry.fleetId)] as const)),
    [entries, masterData, shift],
  )

  function handleSave(entry: FleetSetupDraftEntry) {
    const index = entries.findIndex((candidate) => candidate.fleetId === entry.fleetId)
    const next = index < 0 ? [...entries, entry] : entries.map((candidate, itemIndex) => itemIndex === index ? entry : candidate)
    setEntries(next)
    onEntriesChange?.(next)
    setEditing(undefined)
    setPageErrorKey(undefined)
  }

  function requestRemove(entry: FleetSetupDraftEntry) {
    if (entries.some((candidate) => candidate.kind === 'DERIVED' && candidate.referenceFleetId === entry.fleetId)) {
      setPageErrorKey(fleetErrorTranslationKey('FLEET_DEPENDENCY_EXISTS'))
      return
    }
    setOpenActionFleetId(undefined)
    setPendingDelete(entry)
  }

  function confirmRemove() {
    if (!pendingDelete) return
    const entry = pendingDelete
    const next = entries.filter((candidate) => candidate.fleetId !== entry.fleetId)
    setEntries(next)
    onEntriesChange?.(next)
    setPendingDelete(undefined)
    setPageErrorKey(undefined)
  }

  function handleContinue() {
    const result = createFleetSetupFromDraft(entries, shift, masterData)
    if (!result.ok) {
      setPageErrorKey(fleetErrorTranslationKey(result.error.code))
      return
    }
    setPageErrorKey(undefined)
    onFleetSetupReady(result.value.fleetSetup)
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 py-3">
        <Button data-ui="back-button" type="button" variant="secondary" className="border border-emerald-700 text-emerald-800 hover:bg-emerald-50" onClick={onBack}>← Back</Button>
        <h1 className="type-page-title min-w-0 text-center">FLEET SETUP</h1>
        <Button data-ui="next-button" type="button" variant="focus" onClick={handleContinue}>Next →</Button>
      </header>
      <div className="shrink-0 px-5 pt-3">
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-4">
            <strong className="text-3xl font-extrabold text-emerald-700">{shift.sectorCode}</strong>
            <div className="text-right text-sm leading-6"><div>{formatShiftDateForDisplay(shift.date)}</div><div>{shiftLabel(shift.shiftCode)}</div></div>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2">
        <h2 className="type-section-title">{t('fleetSetup.registeredFleet')}</h2>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-medium text-emerald-900">{t('fleetSetup.fleetCount', { count: entries.length })}</span>
      </div>
      {pageErrorKey ? <p role="alert" className="mx-5 shrink-0 pb-2 text-sm text-red-700">{t(pageErrorKey)}</p> : null}
      <div className="mx-5 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
        <table className="w-full table-fixed text-left text-sm sm:text-base">
          <thead className="sticky top-0 bg-muted text-muted-foreground">
            <tr>
              <th className="w-10 px-1 py-2" aria-label="Actions" />
              <th className="w-[16%] px-1 py-2 font-medium">Comp</th>
              <th className="w-[22%] px-1 py-2 font-medium">Fleet</th>
              <th className="w-[22%] px-1 py-2 font-medium">Pile Id</th>
              <th className="w-[17%] px-1 py-2 font-medium">Exc</th>
              <th className="w-[12%] px-1 py-2 font-medium">Truck</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const preview = previews.get(entry.fleetId)
              const truckCount = preview?.ok ? preview.value.length : 0
              return <tr key={entry.fleetId}>
                <td className="relative px-1 py-2 align-middle"><button type="button" aria-label={`Fleet actions ${formatFleetShortLabel(Number(entry.frontNumber))}`} className="rounded px-2 py-1 text-lg leading-none" onClick={() => setOpenActionFleetId((current) => current === entry.fleetId ? undefined : entry.fleetId)}>⋮</button>{openActionFleetId === entry.fleetId ? <div role="menu" className="absolute left-0 top-full z-20 w-32 rounded-md border border-border bg-surface-elevated p-1 text-foreground shadow-lg"><button role="menuitem" type="button" className="block w-full rounded px-2 py-2 text-left text-sm text-foreground hover:bg-muted" onClick={() => { setEditing(entry); setOpenActionFleetId(undefined) }}>Ubah Fleet</button><button role="menuitem" type="button" className="block w-full rounded px-2 py-2 text-left text-sm text-red-700 hover:bg-muted" onClick={() => requestRemove(entry)}>Hapus Fleet</button></div> : null}</td>
                <td className="truncate px-1 py-2">{entry.haulerCode}</td>
                <td className="truncate px-1 py-2" title={formatFleetFullCode({ operationalDate: shift.date, shiftCode: shift.shiftCode, sectorCode: shift.sectorCode, sequence: Number(entry.frontNumber) })}>{formatFleetShortLabel(Number(entry.frontNumber))}</td>
                <td className="truncate px-1 py-2">{entry.destinationPileId || '—'}</td>
                <td className="truncate px-1 py-2">{displayExcaCode(entry.excaCode)}</td>
                <td className="px-1 py-2 text-center">{truckCount}</td>
              </tr>
            })}
            {entries.length === 0 ? <tr><td colSpan={6} className="px-2 py-5 text-center text-muted-foreground">{t('fleetSetup.noFleets')}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-center">
        <Button type="button" onClick={() => setEditing(createEmptyFleetSetupDraftEntry(generateFleetId()))}>{t('fleetSetup.addFleet')}</Button>
      </div>
      {editing ? <FrontEditor initialEntry={editing} entries={entries} shift={shift} masterData={masterData} onSave={handleSave} onCancel={() => setEditing(undefined)} eligibleDestinationPileIds={eligibleDestinationPileIds} /> : null}
      {pendingDelete ? <div role="dialog" aria-modal="true" aria-label="Hapus Fleet" className="fixed inset-0 z-50 flex items-end bg-black/40 p-3"><section className="w-full rounded-xl bg-background p-4 shadow-xl"><h2 className="type-dialog-title">Hapus Fleet</h2><p className="mt-2 text-sm text-muted-foreground">Hapus {formatFleetShortLabel(Number(pendingDelete.frontNumber))}? Konfigurasi ini belum dipersist sebagai workspace aktif dan tidak akan menghapus catatan produksi.</p><div className="mt-4 grid grid-cols-2 gap-2"><Button type="button" variant="secondary" onClick={() => setPendingDelete(undefined)}>Batal</Button><Button type="button" className="bg-red-700 text-white hover:bg-red-800" onClick={confirmRemove}>Hapus Fleet</Button></div></section></div> : null}
    </div>
  )
}
