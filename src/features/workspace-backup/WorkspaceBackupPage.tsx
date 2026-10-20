import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { localOperationalStore } from '@/app/local-operational-store'
import { parseShiftId } from '@/domain/common/identifiers'
import type { LocalShiftWorkspace } from '@/infrastructure/local-db/local-operational-store'
import { parseWorkspaceBackup, stringifyWorkspaceBackup, type WorkspaceBackupEnvelope, type WorkspaceBackupPreview, workspaceBackupFilename } from '@/infrastructure/local-db/workspace-backup'

function workspaceLabel(workspace: LocalShiftWorkspace): string {
  return `${workspace.shift.date} · ${workspace.shift.shiftCode} · ${workspace.shift.sectorCode} · ${workspace.shift.samplingHouseCode}`
}

function downloadBackup(backup: WorkspaceBackupEnvelope): void {
  const blob = new Blob([stringifyWorkspaceBackup(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = workspaceBackupFilename(backup)
  link.click()
  URL.revokeObjectURL(url)
}

/** Standalone data-safety page: it does not require or alter the active workspace. */
export function WorkspaceBackupPage() {
  const [workspaces, setWorkspaces] = useState<readonly LocalShiftWorkspace[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [backup, setBackup] = useState<WorkspaceBackupEnvelope>()
  const [preview, setPreview] = useState<WorkspaceBackupPreview>()
  const [message, setMessage] = useState<string>()
  const [restoredId, setRestoredId] = useState<string>()
  const workspaceRequest = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++workspaceRequest.current
    const result = await localOperationalStore.listLocalWorkspaces()
    if (request !== workspaceRequest.current) return
    if (result.ok) { setWorkspaces(result.value); setMessage(undefined) } else setMessage('Unable to read saved local workspaces.')
  }, [])
  useEffect(() => {
    let cancelled = false
    const request = ++workspaceRequest.current
    void localOperationalStore.listLocalWorkspaces().then((result) => {
      if (cancelled || request !== workspaceRequest.current) return
      if (result.ok) {
        setWorkspaces(result.value)
        setMessage(undefined)
      } else setMessage('Unable to read saved local workspaces.')
    })
    return () => { cancelled = true }
  }, [])

  async function exportSelected() {
    if (!selectedId) return
    setMessage(undefined)
    const shiftId = parseShiftId(selectedId)
    if (!shiftId.ok) { setMessage('Selected workspace identity is invalid.'); return }
    const result = await localOperationalStore.exportLocalWorkspaceBackup(shiftId.value)
    if (!result.ok) { setMessage(`Export failed: ${result.error.code}`); return }
    downloadBackup(result.value)
    setMessage('Backup downloaded. It may contain operational and personnel data; store it securely.')
  }

  async function readFile(file?: File) {
    setBackup(undefined); setPreview(undefined); setRestoredId(undefined); setMessage(undefined)
    if (!file) return
    if (file.size > 50 * 1024 * 1024) { setMessage('Backup file exceeds the 50 MB safety limit.'); return }
    try {
      const parsed = parseWorkspaceBackup(await file.text())
      const checked = await localOperationalStore.previewLocalWorkspaceBackup(parsed)
      if (!checked.ok) { setMessage(`Backup is invalid: ${checked.error.code}`); return }
      setBackup(parsed); setPreview(checked.value)
    } catch (caught) {
      setMessage(`Backup is invalid: ${caught instanceof Error ? caught.message : 'unable to read file'}`)
    }
  }

  async function restore() {
    if (!backup) return
    const result = await localOperationalStore.restoreLocalWorkspaceBackup(backup)
    if (!result.ok) { setMessage(`Restore was not performed: ${result.error.code}`); return }
    setRestoredId(result.value.workspaceId); setBackup(undefined); setPreview(undefined)
    setMessage('Restore completed. The workspace was not activated.')
    await refresh()
  }

  async function activateRestored() {
    if (!restoredId) return
    const shiftId = parseShiftId(restoredId)
    if (!shiftId.ok) { setMessage('Restored workspace identity is invalid.'); return }
    const result = await localOperationalStore.resumeLocalWorkspaceById(shiftId.value)
    setMessage(result.ok ? 'Restored workspace is now active.' : `Could not activate workspace: ${result.error.code}`)
  }

  return <main className="safe-x mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 p-5">
    <header><Link to="/" className="text-sm font-semibold text-emerald-700">← Back</Link><h1 className="mt-2 text-2xl font-bold">Workspace Backup & Restore</h1><p className="mt-1 text-sm text-muted-foreground">Backups stay on this device until you choose where to save the downloaded file. Keep exported files secure because they may contain operational and personnel data.</p></header>
    <section className="rounded-xl border p-4"><h2 className="font-semibold">Export workspace</h2><label className="mt-3 block text-sm font-medium">Saved workspace<select aria-label="Saved workspace" className="mt-1 h-11 w-full rounded border bg-background px-3" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Select a saved workspace</option>{workspaces.map((workspace) => <option key={workspace.shiftId} value={workspace.shiftId}>{workspaceLabel(workspace)}</option>)}</select></label><button type="button" disabled={!selectedId} onClick={() => void exportSelected()} className="mt-3 rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Export Backup</button></section>
    <section className="rounded-xl border p-4"><h2 className="font-semibold">Restore workspace</h2><p className="mt-1 text-sm text-muted-foreground">Validation and preview never write data. Existing workspace or record ID conflicts are rejected; restore never merges or overwrites.</p><label className="mt-3 block text-sm font-medium">Backup JSON file<input aria-label="Backup JSON file" type="file" accept="application/json,.json" className="mt-1 block w-full text-sm" onChange={(event) => void readFile(event.target.files?.[0])} /></label>{preview ? <div className="mt-3 rounded bg-muted p-3 text-sm" aria-live="polite"><p className="font-semibold">Ready to restore: {preview.workspaceId}</p><p>{preview.identity.date} · {preview.identity.shiftCode} · {preview.identity.sectorCode} · {preview.identity.samplingHouseCode}</p><p className="mt-2">Piles: {preview.piles}; haulage: {preview.haulageTransactions}; samples: {preview.samplePositions}; production: {preview.productionRecords}; corrections: {preview.correctionAuditEntries}; outbox: {preview.hasShiftSummarySync ? 1 : 0}.</p><p className="mt-2 text-muted-foreground">Excluded: {preview.exclusions.join(', ')}.</p><button type="button" onClick={() => void restore()} className="mt-3 rounded bg-emerald-700 px-4 py-2 font-semibold text-white">Confirm Restore</button></div> : null}</section>
    {restoredId ? <section className="rounded-xl border border-emerald-700 p-4" aria-live="polite"><p className="font-semibold">Restored workspace: {restoredId}</p><p className="mt-1 text-sm text-muted-foreground">It is not active until you explicitly activate it.</p><button type="button" onClick={() => void activateRestored()} className="mt-3 rounded border px-4 py-2 text-sm font-semibold">Activate restored workspace</button></section> : null}
    {message ? <p role="status" className="rounded bg-muted p-3 text-sm">{message}</p> : null}
  </main>
}
