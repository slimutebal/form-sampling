import { useEffect, useState } from 'react'
import { FilePenLine, MoreVertical, X } from 'lucide-react'
import { useOutletContext } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { refreshAppsScriptMasterData } from '@/app/google/google-master-data-sync'
import { updateActiveManpower } from '@/application/manpower/update-active-manpower'
import { Button } from '@/components/ui/button'
import {
  manpowerAssignmentsToSelected,
  useManpowerRoster,
} from '@/features/manpower/use-manpower-roster'

interface ActiveManpowerDialogProps {
  readonly onClose: () => void
}

/** Compact modal presentation over the existing active-shift roster logic. */
export function ActiveManpowerDialog({ onClose }: ActiveManpowerDialogProps) {
  const { workspace, refreshWorkspace } = useOutletContext<ActiveWorkspaceContext>()
  const [personnelCatalog, setPersonnelCatalog] = useState(workspace.masterData)
  const roster = useManpowerRoster(
    personnelCatalog,
    manpowerAssignmentsToSelected(workspace.manpower),
  )
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [removeCandidate, setRemoveCandidate] = useState<{
    readonly personId: string
    readonly name: string
  }>()
  const [checkerMenuPersonId, setCheckerMenuPersonId] = useState<string>()

  useEffect(() => {
    let cancelled = false
    void localOperationalStore.readCachedMasterData().then((cached) => {
      if (cached.ok && cached.value && !cancelled) setPersonnelCatalog(cached.value.masterData)
    })
    if (navigator.onLine) {
      void refreshAppsScriptMasterData().then((refreshed) => {
        if (refreshed.ok && !cancelled) setPersonnelCatalog(refreshed.value.masterData)
      })
    }
    return () => { cancelled = true }
  }, [])

  function toggleChecker(personId: string) {
    const person = roster.selected.find((candidate) => candidate.personId === personId)
    if (!person) return
    if (person.jobDeskCode.trim() === 'Checker') return
    roster.replaceChecker(personId, (previousChecker) => {
      if (previousChecker.source === 'EMPLOYEE') return ''
      return personnelCatalog.crews.find((crew) => crew.code === previousChecker.personId)?.jobCode ?? 'Crew'
    })
    setCheckerMenuPersonId(undefined)
  }

  async function save() {
    if (saving) return
    const result = updateActiveManpower(
      workspace.manpower,
      roster.selected.map((person) => ({
        personId: person.personId,
        jobDeskCode: person.jobDeskCode,
      })),
      personnelCatalog,
    )
    if (!result.ok) {
      setError('Check the selected personnel and Job Desk values.')
      return
    }
    setSaving(true)
    const saved = await localOperationalStore.updateShiftManpower(workspace.shiftId, result.value)
    setSaving(false)
    if (!saved.ok) {
      setError('Unable to save Manpower.')
      return
    }
    refreshWorkspace()
    onClose()
  }

  return (
    <>
      <button
        type="button"
        aria-label="Dismiss Add Manpower"
        className="fixed inset-0 z-40 cursor-default bg-black/35"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Add Manpower"
        className="fixed inset-x-4 top-1/2 z-50 mx-auto flex max-h-[78dvh] w-auto max-w-md -translate-y-1/2 flex-col rounded-2xl bg-background shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="type-dialog-title">Manpower</h2>
          <button type="button" aria-label="Close Add Manpower" onClick={onClose}>
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="flex flex-col gap-2">
            {roster.selected.length === 0 ? (
              <p className="text-sm text-muted-foreground">No personnel selected.</p>
            ) : (
              roster.selected.map((person) => (
                <div
                  key={person.personId}
                  className="grid grid-cols-[28px_16px_minmax(0,1fr)_auto_28px] items-center gap-1 rounded-md border border-border px-2 py-2"
                >
                  <button
                    type="button"
                    aria-label={`Remove ${person.name}`}
                    className="flex size-7 items-center justify-center text-red-600"
                    onClick={() =>
                      setRemoveCandidate({ personId: person.personId, name: person.name })
                    }
                  >
                    <X aria-hidden="true" size={17} />
                  </button>
                  <span className="flex w-4 justify-center">
                    {/checker/i.test(person.jobDeskCode) ? (
                      <FilePenLine
                        aria-label="Checker"
                        size={15}
                        strokeWidth={1.8}
                        className="text-primary"
                      />
                    ) : null}
                  </span>
                  <p className="truncate text-sm font-semibold">{person.name}</p>
                  <p className="text-xs text-muted-foreground">{person.personId}</p>
                  <div className="relative">
                    <button
                      type="button"
                      aria-label={`Manpower actions for ${person.name}`}
                      className="flex size-7 items-center justify-center"
                      onClick={() =>
                        setCheckerMenuPersonId((current) =>
                          current === person.personId ? undefined : person.personId,
                        )
                      }
                    >
                      <MoreVertical aria-hidden="true" size={18} />
                    </button>
                    {checkerMenuPersonId === person.personId ? (
                      <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded border border-border bg-background p-1 shadow-lg">
                        <button
                          type="button"
                          className="w-full px-2 py-2 text-left text-xs hover:bg-muted"
                          onClick={() => toggleChecker(person.personId)}
                        >
                          {person.jobDeskCode.trim() === 'Checker' ? 'Checker' : 'Make Checker'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="relative shrink-0 border-t border-border px-4 py-3">
          {roster.query.trim() ? (
            <div className="scrollbar-none absolute bottom-full left-4 right-4 z-10 mb-1 max-h-44 overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-lg">
              {roster.searchResults.map((person) => (
                <button
                  key={person.personId}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left hover:bg-muted"
                  onClick={() =>
                    roster.addPerson(person.personId, person.name, person.source, person.jobCode)
                  }
                >
                  <span className="min-w-0 truncate text-sm">
                    <strong>{person.name}</strong>{' '}
                    <span className="text-muted-foreground">{person.personId}</span>
                  </span>
                  <span className="text-primary">+</span>
                </button>
              ))}
              {roster.searchResults.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">No matching personnel.</p>
              ) : null}
            </div>
          ) : null}
          <input
            aria-label="Search personnel"
            value={roster.query}
            onChange={(event) => roster.setQuery(event.target.value)}
            placeholder="Search personnel"
            className="h-11 w-full rounded-md border border-border bg-background px-3"
          />
          {error ? (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            className="mt-3 w-full"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save Manpower'}
          </Button>
        </div>
      </section>
      {removeCandidate ? (
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Confirm remove Manpower"
          className="fixed inset-x-8 top-1/2 z-[60] mx-auto max-w-sm -translate-y-1/2 rounded-xl bg-background p-4 shadow-2xl"
        >
          <p className="text-sm">Remove {removeCandidate.name} from current shift manpower?</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={() => setRemoveCandidate(undefined)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (roster.selected.find((person) => person.personId === removeCandidate.personId)?.jobDeskCode.trim() === 'Checker') {
                  setError('Choose another Checker before removing the current Checker.')
                  setRemoveCandidate(undefined)
                  return
                }
                roster.removePerson(removeCandidate.personId)
                setRemoveCandidate(undefined)
              }}
            >
              Remove
            </Button>
          </div>
        </section>
      ) : null}
    </>
  )
}
