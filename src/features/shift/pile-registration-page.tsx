import { useMemo, useState } from 'react'
import type {
  PileRegistrationDraft,
  PileRegistrationStatus,
} from '@/application/pile-registration/pile-registration-draft'
import { parseBatchNumber } from '@/domain/batch/batch-number'
import { parseRitNumber } from '@/domain/batch/rit-number'
import { deriveSampleBatchProgress } from '@/application/sample-handling/sample-batch-progress'
import { Button } from '@/components/ui/button'
import type { MasterData } from '@/domain/master/master-data'
import type { Shift } from '@/domain/shift/shift'
import { SampleProgressSummary } from '@/features/registration/sample-progress-summary'

export interface PileRegistrationPageProps {
  shift: Shift
  masterData: MasterData
  initialRegistrations: readonly PileRegistrationDraft[]
  onRegistrationsChange: (registrations: readonly PileRegistrationDraft[]) => void
  onRegistrationsReady: (registrations: readonly PileRegistrationDraft[]) => void
  onBack: () => void
}

/** Pre-workspace registrations retain Batch/Trip rows independently of Pile identity. */
export function PileRegistrationPage({
  shift,
  masterData,
  initialRegistrations,
  onRegistrationsChange,
  onRegistrationsReady,
  onBack,
}: PileRegistrationPageProps) {
  const [registrations, setRegistrations] = useState<readonly PileRegistrationDraft[]>(initialRegistrations)
  const [query, setQuery] = useState('')
  const [selectedPileId, setSelectedPileId] = useState<string>()
  const [batch, setBatch] = useState('')
  const [rit, setRit] = useState('')
  const [status, setStatus] = useState<PileRegistrationStatus>('ACTIVE')
  const [error, setError] = useState<string>()

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return masterData.pileAreas.filter(
      (pileArea) =>
        pileArea.sectorCode === shift.sectorCode &&
        ((pileArea.pileId as string).toLowerCase().includes(needle) ||
          (pileArea.stockpileCode as string).toLowerCase().includes(needle)),
    )
  }, [masterData.pileAreas, query, shift.sectorCode])
  const selectedPile = selectedPileId
    ? masterData.pileAreas.find((pileArea) => pileArea.pileId === selectedPileId)
    : undefined
  const progress = useMemo(() => {
    if (!selectedPile) return undefined
    const parsedBatch = parseBatchNumber(Number(batch))
    const parsedRit = parseRitNumber(Number(rit))
    if (!parsedBatch.ok || !parsedRit.ok) return undefined
    return deriveSampleBatchProgress(
      { pileId: selectedPile.pileId, oreCode: selectedPile.oreCode, batch: parsedBatch.value, rit: parsedRit.value },
      masterData,
    )
  }, [batch, masterData, rit, selectedPile])
  const sortedRegistrations = useMemo(
    () => [...registrations].sort((left, right) => {
      const pileComparison = String(left.pileId).localeCompare(String(right.pileId), undefined, {
        numeric: true,
        sensitivity: 'base',
      })
      if (pileComparison !== 0) return pileComparison
      if (left.batch !== right.batch) return left.batch - right.batch
      return left.rit - right.rit
    }),
    [registrations],
  )

  function updateRegistrations(next: readonly PileRegistrationDraft[]) {
    setRegistrations(next)
    onRegistrationsChange(next)
  }

  function clearEntry() {
    setQuery('')
    setSelectedPileId(undefined)
    setBatch('')
    setRit('')
    setStatus('ACTIVE')
    setError(undefined)
  }

  function handleAdd() {
    if (!selectedPile) {
      setError('Select a Pile from the master list.')
      return
    }
    const parsedBatch = parseBatchNumber(Number(batch))
    if (!batch.trim() || !parsedBatch.ok) {
      setError('Batch is required and must be a positive number.')
      return
    }
    const parsedRit = parseRitNumber(Number(rit))
    if (!rit.trim() || !parsedRit.ok) {
      setError('Trip is required and must be a positive number.')
      return
    }
    if (registrations.some((row) => row.pileId === selectedPile.pileId && row.batch === parsedBatch.value)) {
      setError('This Pile ID and Batch are already registered.')
      return
    }
    updateRegistrations([
      ...registrations,
      {
        pileId: selectedPile.pileId,
        oreCode: selectedPile.oreCode,
        batch: parsedBatch.value,
        rit: parsedRit.value,
        status,
      },
    ])
    clearEntry()
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <header className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 py-3">
        <Button type="button" variant="secondary" className="border border-emerald-700 text-emerald-800 hover:bg-emerald-50" onClick={onBack}>
          ← Back
        </Button>
        <h1 className="min-w-0 text-center text-lg font-extrabold tracking-wide">SAMPLE SETUP</h1>
        <Button type="button" disabled={registrations.length === 0} onClick={() => onRegistrationsReady(registrations)}>Next →</Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Registered Samples</h2>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-medium text-emerald-900">
            {registrations.length} Samples
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border" data-testid="setup-pile-list">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>
                <th className="w-10 px-2 py-2" aria-label="Delete" />
                <th className="px-2 py-2 font-medium">Pile_ID</th>
                <th className="px-2 py-2 font-medium">Batch</th>
                <th className="px-2 py-2 font-medium">Trip</th>
                <th className="px-2 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedRegistrations.map((row) => {
                const inactive = row.status === 'INACTIVE'
                return (
                  <tr key={`${row.pileId}-${row.batch}`} className={inactive ? 'text-red-700' : 'text-emerald-700'}>
                    <td className="px-2 py-2 align-middle">
                      <button
                        type="button"
                        aria-label={`Remove ${row.pileId} batch ${String(row.batch).padStart(3, '0')}`}
                        className="font-semibold text-red-600"
                        onClick={() => updateRegistrations(registrations.filter((candidate) => candidate !== row))}
                      >
                        x
                      </button>
                    </td>
                    <td className="px-2 py-2 font-medium">{row.pileId}</td>
                    <td className="px-2 py-2">{String(row.batch).padStart(3, '0')}</td>
                    <td className="px-2 py-2">{String(row.rit).padStart(3, '0')}</td>
                    <td className="px-2 py-2">{inactive ? 'Inactive' : 'Active'}</td>
                  </tr>
                )
              })}
              {registrations.length === 0 ? (
                <tr><td colSpan={5} className="px-2 py-5 text-center text-muted-foreground">No samples registered yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="relative shrink-0 pt-3">
          <div className="mb-3 rounded-md border border-border bg-muted/30 px-3 py-2"><SampleProgressSummary progress={progress} /></div>
          <div className="grid w-full grid-cols-[minmax(0,1.8fr)_minmax(0,.5fr)_minmax(0,.5fr)_minmax(0,1.1fr)_40px] gap-1">
          <div className="relative min-w-0">
            <label className="sr-only" htmlFor="setup-pile-search">Cari Pile/Stockpile</label>
            {selectedPile ? (
              <div className="flex h-11 items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 text-sm">
                <span className="min-w-0 truncate font-medium">{selectedPile.pileId} · {selectedPile.oreCode}</span>
                <button type="button" className="text-primary" onClick={() => { setSelectedPileId(undefined); setQuery('') }}>Change</button>
              </div>
            ) : (
              <>
                <input id="setup-pile-search" value={query} onChange={(event) => { setQuery(event.target.value); setError(undefined) }} placeholder="Search Pile_ID / Stockpile" className="h-11 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm" />
                {query.trim() ? (
                  <div className="absolute bottom-full left-0 z-20 mb-1 max-h-36 w-full overflow-y-auto rounded-md border border-border bg-background shadow-sm">
                    {candidates.map((pileArea) => (
                      <button key={pileArea.pileId} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setSelectedPileId(pileArea.pileId); setQuery(''); setError(undefined) }}>
                        <span className="font-medium">{pileArea.pileId} · {pileArea.oreCode}</span>
                        <span className="ml-2 text-muted-foreground">{pileArea.stockpileCode}</span>
                      </button>
                    ))}
                    {candidates.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">No master Pile found.</p> : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
          <div className="min-w-0"><label className="sr-only" htmlFor="setup-pile-batch">Batch</label><input id="setup-pile-batch" inputMode="numeric" value={batch} onChange={(event) => { setBatch(event.target.value); setError(undefined) }} placeholder="Batch" className="h-11 w-full min-w-0 rounded-md border border-border bg-background px-1 text-xs" /></div>
          <div className="min-w-0"><label className="sr-only" htmlFor="setup-pile-rit">Trip</label><input id="setup-pile-rit" inputMode="numeric" value={rit} onChange={(event) => { setRit(event.target.value); setError(undefined) }} placeholder="Trip" className="h-11 w-full min-w-0 rounded-md border border-border bg-background px-1 text-xs" /></div>
          <div className="min-w-0"><label className="sr-only" htmlFor="setup-pile-status">Status</label><select id="setup-pile-status" value={status} onChange={(event) => { setStatus(event.target.value as PileRegistrationStatus); setError(undefined) }} className="h-11 w-full min-w-0 rounded-md border border-border bg-background px-1 text-xs"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>
          <Button type="button" aria-label="Add Sample" className="h-11 w-10 min-w-10 px-0" onClick={handleAdd}>+</Button>
          </div>
          {error ? <p role="alert" className="absolute bottom-full left-0 mb-1 text-sm text-red-700">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}
