/**
 * Maps stable LocalDatabaseError codes to translation keys for the
 * Start/Resume load-error state. `CURRENT_SHIFT_WORKSPACE_NOT_FOUND`
 * means the current-shift pointer is inconsistent with stored
 * workspaces — a distinct, more specific message than a generic local
 * data failure, and never treated as "no active shift".
 */
const WORKSPACE_ERROR_TRANSLATION_KEYS: Readonly<Record<string, string>> = {
  CURRENT_SHIFT_WORKSPACE_NOT_FOUND: 'shiftStart.errors.corruptedState',
}

export function workspaceErrorTranslationKey(code: string): string {
  return WORKSPACE_ERROR_TRANSLATION_KEYS[code] ?? 'shiftStart.errors.loadFailed'
}
