/**
 * Browser-local recovery for an unfinished pre-shift setup.  It is separate
 * from the operational IndexedDB workspace: a draft is never an active
 * production record and must not replace or mutate one.
 */
const PRE_SHIFT_SETUP_SESSION_KEY = 'form-sampling.pre-shift-setup.v1'

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function readPreShiftSetupSession<T>(storage: Storage | undefined = browserStorage()): T | undefined {
  if (!storage) return undefined
  try {
    const serialized = storage.getItem(PRE_SHIFT_SETUP_SESSION_KEY)
    if (!serialized) return undefined
    const parsed: unknown = JSON.parse(serialized)
    return parsed && typeof parsed === 'object' ? parsed as T : undefined
  } catch {
    return undefined
  }
}

export function savePreShiftSetupSession<T>(value: T, storage: Storage | undefined = browserStorage()): void {
  if (!storage) return
  try {
    storage.setItem(PRE_SHIFT_SETUP_SESSION_KEY, JSON.stringify(value))
  } catch {
    // Recovery storage is best-effort and must not block offline setup.
  }
}

export function clearPreShiftSetupSession(storage: Storage | undefined = browserStorage()): void {
  if (!storage) return
  try {
    storage.removeItem(PRE_SHIFT_SETUP_SESSION_KEY)
  } catch {
    // See savePreShiftSetupSession.
  }
}
