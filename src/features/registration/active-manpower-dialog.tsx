import { useEffect, useState } from 'react'
import { ClipboardPenLine, UsersRound, X } from 'lucide-react'
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
import type { SelectedPerson } from '@/features/manpower/use-manpower-roster'

interface ActiveManpowerDialogProps {
  readonly onClose: () => void
}

interface ManpowerValidationIssues {
  readonly rowErrors: ReadonlyMap<string, string>
  readonly rosterError?: string
}

function validateSelectedPersonnel(selected: readonly SelectedPerson[]): ManpowerValidationIssues {
  const rowErrors = new Map<string, string>()
  const seen = new Set<string>()
  const checkers = selected.filter((person) => person.isChecker)
  const checkerIds = checkers.map((person) => person.personId)

  for (const person of selected) {
    if (seen.has(person.personId)) rowErrors.set(person.personId, 'This person is selected more than once.')
    seen.add(person.personId)
  }

  if (checkerIds.length > 1) {
    for (const personId of checkerIds) rowErrors.set(personId, 'Only one Checker is allowed.')
  }

  return {
    rowErrors,
    rosterError:
      checkerIds.length === 0
        ? 'Select exactly one Checker before saving.'
        : undefined,
  }
}

/** Compact modal presentation over the existing active-shift roster logic. */
export function ActiveManpowerDialog({ onClose }: ActiveManpowerDialogProps) {
  const { workspace, refreshWorkspace } = useOutletContext<ActiveWorkspaceContext>()
  const [personnelCatalog, setPersonnelCatalog] = useState(workspace.masterData)
  const roster = useManpowerRoster(
    personnelCatalog,
    manpowerAssignmentsToSelected(workspace.manpower, workspace.checkerPersonId),
  )
  const [rowErrors, setRowErrors] = useState<ReadonlyMap<string, string>>(new Map())
  const [rosterError, setRosterError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [removeCandidate, setRemoveCandidate] = useState<{
    readonly personId: string
    readonly name: string
  }>()
  const [modalViewport, setModalViewport] = useState(() => ({
    height: typeof window === 'undefined' ? 720 : window.visualViewport?.height ?? window.innerHeight,
    offsetTop: typeof window === 'undefined' ? 0 : window.visualViewport?.offsetTop ?? 0,
  }))

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

  useEffect(() => {
    const visualViewport = window.visualViewport
    const updateViewport = () =>
      setModalViewport({
        height: visualViewport?.height ?? window.innerHeight,
        offsetTop: visualViewport?.offsetTop ?? 0,
      })
    updateViewport()
    visualViewport?.addEventListener('resize', updateViewport)
    visualViewport?.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', updateViewport)
    return () => {
      visualViewport?.removeEventListener('resize', updateViewport)
      visualViewport?.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', updateViewport)
    }
  }, [])

  const maxDialogHeight = Math.max(
    160,
    Math.min(620, Math.floor(modalViewport.height * 0.75), modalViewport.height - 16),
  )
  const dialogTop = Math.round(
    modalViewport.offsetTop + Math.max(8, (modalViewport.height - maxDialogHeight) / 2),
  )

  function toggleChecker(personId: string) {
    const person = roster.selected.find((candidate) => candidate.personId === personId)
    if (!person || person.isChecker) return
    roster.replaceChecker(personId)
    setRowErrors(new Map())
    setRosterError(undefined)
  }

  const selectedByLevel = [...roster.selected].sort((left, right) => {
    const sourceRank = left.source === right.source ? 0 : left.source === 'EMPLOYEE' ? -1 : 1
    if (sourceRank !== 0) return sourceRank
    return left.personId.localeCompare(right.personId, undefined, { numeric: true, sensitivity: 'base' })
  })
  const currentChecker = selectedByLevel.find((person) => person.isChecker)

  async function save() {
    if (saving) return
    const validation = validateSelectedPersonnel(roster.selected)
    setRowErrors(validation.rowErrors)
    setRosterError(validation.rosterError)
    if (validation.rowErrors.size > 0 || validation.rosterError) return

    const result = updateActiveManpower(
      workspace.manpower,
      roster.selected.map((person) => ({
        personId: person.personId,
        jobDeskCode: person.jobDeskCode,
        isChecker: person.isChecker,
      })),
      personnelCatalog,
    )
    if (!result.ok) {
      const failedPerson = roster.selected.find((person) => result.error.message.includes(person.personId))
      if (failedPerson) {
        setRowErrors(new Map([[failedPerson.personId, result.error.message]]))
        setRosterError(undefined)
      } else {
        setRosterError(result.error.message)
      }
      return
    }
    setSaving(true)
    const saved = await localOperationalStore.updateShiftManpower(
      workspace.shiftId,
      result.value.manpower,
      result.value.checkerPersonId,
    )
    setSaving(false)
    if (!saved.ok) {
      setRosterError('Unable to save Manpower.')
      return
    }
    refreshWorkspace()
    onClose()
  }

  return (
    <>
      <button
        type="button"
        aria-label="Dismiss Edit Manpower"
        className="fixed inset-0 z-40 cursor-default bg-black/35"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Edit Manpower"
        data-ui="active-manpower-dialog"
        style={{ top: `${dialogTop}px`, maxHeight: `${maxDialogHeight}px` }}
        className="fixed inset-x-4 z-50 mx-auto flex w-auto max-w-md flex-col overflow-hidden rounded-2xl bg-background shadow-2xl"
      >
        <div className="grid shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center border-b border-border px-3 py-3">
          <span aria-hidden="true" />
          <h2 className="type-dialog-title flex items-center justify-center gap-2 text-center">
            <UsersRound aria-hidden="true" size={18} strokeWidth={2} />
            EDIT MANPOWER
          </h2>
          <button type="button" aria-label="Close Edit Manpower" className="flex size-11 items-center justify-center" onClick={onClose}>
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        {currentChecker ? (
          <div data-ui="manpower-dialog-current-checker" className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-border px-5 py-2">
            <p className="truncate text-sm font-semibold">{currentChecker.name}</p>
            <ClipboardPenLine aria-label="Current Checker" className="text-primary" size={25} strokeWidth={1.5} />
            <p className="sr-only">
              {currentChecker.personId} · <strong className="font-semibold text-foreground">Checker</strong>
            </p>
            <p className="col-start-1 truncate text-xs text-muted-foreground">
              {currentChecker.personId} · {currentChecker.source === 'CREW' ? (
                <strong className="font-semibold text-foreground">Checker</strong>
              ) : (
                <>
                  <span>{currentChecker.jobDeskCode}</span>{' '}
                  <strong className="font-semibold text-primary">(Checker)</strong>
                </>
              )}
            </p>
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
          {rosterError ? (
            <p role="alert" className="mb-2 text-sm text-red-600">
              {rosterError}
            </p>
          ) : null}
          <div data-ui="manpower-dialog-list" className="scrollbar-none min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="flex flex-col">
              {roster.selected.length === 0 ? (
                <p className="text-sm text-muted-foreground">No personnel selected.</p>
              ) : (
                selectedByLevel.map((person, index) => (
                  <div
                    key={person.personId}
                    data-ui={person.source === 'EMPLOYEE' ? 'manpower-dialog-staff-row' : 'manpower-dialog-crew-row'}
                    className={`grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-1 border-l-4 px-2 py-1.5 ${person.source === 'EMPLOYEE' ? 'border-l-primary' : 'border-l-info'} ${index > 0 ? 'border-t border-border' : ''} ${rowErrors.has(person.personId) ? 'bg-danger/5' : ''}`}
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
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{person.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {person.personId} · {person.source === 'CREW' ? (person.isChecker ? 'Checker' : 'Sampler') : person.jobDeskCode}
                      {person.isChecker && person.source === 'EMPLOYEE' ? <strong className="font-semibold text-primary"> (Checker)</strong> : null}
                    </p>
                  </div>
                  {person.isChecker ? (
                    <span aria-hidden="true" className="flex size-8 items-center justify-center text-primary">
                      <ClipboardPenLine aria-hidden="true" size={25} strokeWidth={1.5} />
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Make ${person.name} Checker`}
                      className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-accent"
                      onClick={() => toggleChecker(person.personId)}
                    >
                      Make Checker
                    </button>
                  )}
                  {rowErrors.get(person.personId) ? (
                    <div className="col-span-3 pt-1">
                      <p className="type-field-error text-danger">{rowErrors.get(person.personId)}</p>
                    </div>
                  ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <div data-ui="manpower-dialog-footer" className="relative flex shrink-0 flex-col border-t border-border px-4 py-3">
          <div data-ui="manpower-dialog-actions" className="order-2 grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          <Button
            type="button"
            className="w-full"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save Manpower'}
          </Button>
          </div>
          <div data-ui="manpower-dialog-search" className="relative order-1 mb-2">
            {roster.query.trim() ? (
              <div className="scrollbar-none absolute bottom-full left-0 right-0 z-20 mb-1 max-h-44 overflow-y-auto rounded-lg border border-border bg-background p-1 text-foreground shadow-lg">
                {roster.searchResults.map((person) => (
                  <button
                    key={person.personId}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none"
                    onClick={() => {
                      roster.addPerson(person.personId, person.name, person.source, person.jobCode)
                      setRowErrors(new Map())
                      setRosterError(undefined)
                    }}
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
              placeholder="Search NIK / Name"
              className="h-11 w-full rounded-md border border-border bg-background px-3"
            />
          </div>
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
                if (roster.selected.find((person) => person.personId === removeCandidate.personId)?.isChecker) {
                  setRosterError('Choose another Checker before removing the current Checker.')
                  setRemoveCandidate(undefined)
                  return
                }
                roster.removePerson(removeCandidate.personId)
                setRowErrors(new Map())
                setRosterError(undefined)
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
