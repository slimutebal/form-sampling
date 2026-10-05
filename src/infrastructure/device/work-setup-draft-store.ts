/**
 * The only persisted pre-shift state. This intentionally uses browser-local
 * storage rather than the operational IndexedDB workspace: saving a draft
 * must never create or initialize a ShiftWorkspace.
 */
export interface PersistedWorkSetupDraft {
  readonly step: 'WORK_SETUP'
  readonly checkerPersonId?: string
  readonly shiftDate: string
  readonly shiftCode: string
  readonly sectorCode: string
  readonly samplingHouseCode: string
  readonly manpowerPersonIds: readonly string[]
}

const WORK_SETUP_DRAFT_KEY = 'form-sampling.work-setup-draft.v1'

function isPersistedWorkSetupDraft(value: unknown): value is PersistedWorkSetupDraft {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.step === 'WORK_SETUP' &&
    typeof candidate.shiftDate === 'string' &&
    typeof candidate.shiftCode === 'string' &&
    typeof candidate.sectorCode === 'string' &&
    typeof candidate.samplingHouseCode === 'string' &&
    (candidate.checkerPersonId === undefined || typeof candidate.checkerPersonId === 'string') &&
    Array.isArray(candidate.manpowerPersonIds) &&
    candidate.manpowerPersonIds.every((personId) => typeof personId === 'string')
  )
}

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function readWorkSetupDraft(storage: Storage | undefined = browserStorage()): PersistedWorkSetupDraft | undefined {
  if (!storage) return undefined
  try {
    const serialized = storage.getItem(WORK_SETUP_DRAFT_KEY)
    if (!serialized) return undefined
    const parsed: unknown = JSON.parse(serialized)
    return isPersistedWorkSetupDraft(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export function saveWorkSetupDraft(
  draft: PersistedWorkSetupDraft,
  storage: Storage | undefined = browserStorage(),
): void {
  if (!storage) return
  try {
    storage.setItem(WORK_SETUP_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Draft recovery is a convenience; storage unavailability must never
    // block offline Work Setup.
  }
}

export function clearWorkSetupDraft(storage: Storage | undefined = browserStorage()): void {
  if (!storage) return
  try {
    storage.removeItem(WORK_SETUP_DRAFT_KEY)
  } catch {
    // See saveWorkSetupDraft: local storage may be unavailable by policy.
  }
}
