const MANPOWER_ERROR_TRANSLATION_KEYS: Readonly<Record<string, string>> = {
  DUPLICATE_MANPOWER_PERSON_ID: 'manpower.errors.duplicatePerson',
  MANPOWER_PERSON_NOT_FOUND: 'manpower.errors.personNotFound',
  SHIFT_WORKSPACE_NOT_FOUND: 'manpower.errors.storeContextInvalid',
}

export function manpowerErrorTranslationKey(code: string): string {
  return MANPOWER_ERROR_TRANSLATION_KEYS[code] ?? 'manpower.errors.generic'
}
