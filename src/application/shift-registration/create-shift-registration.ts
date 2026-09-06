import { parseShiftId } from '@/domain/common/identifiers'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'
import type { MasterData } from '@/domain/master/master-data'
import { createShift, type Shift } from '@/domain/shift/shift'
import type { ShiftRegistrationFormValues } from '@/application/shift-registration/shift-registration-form-values'
import { validateShiftRegistrationForm } from '@/application/shift-registration/validate-shift-registration-form'

export interface ShiftRegistrationInput extends ShiftRegistrationFormValues {
  readonly shiftId: string
  /** Phase 18 wiring correction: the validated MasterData snapshot Sector/Sampling House are checked against — never free text. */
  readonly masterData: MasterData
}

const FALLBACK_INVALID_REGISTRATION_CODE = 'INVALID_SHIFT_REGISTRATION'

/**
 * Validates raw Shift Registration form input — via the single shared
 * `validateShiftRegistrationForm` path, not a second copy of the field
 * parsing — and, if every field is valid, constructs a Shift in status
 * NEW. Phase 8 stops here: it does not initialize a workspace, because
 * Piles/MasterData/FleetSetup are not yet legitimately available
 * (docs/ROADMAP.md Phase 9+).
 */
export function createShiftRegistration(input: ShiftRegistrationInput): Result<Shift> {
  const idResult = parseShiftId(input.shiftId)
  if (!idResult.ok) {
    return idResult
  }

  const validation = validateShiftRegistrationForm(input, input.masterData)
  if (!validation.valid) {
    const code =
      validation.fieldErrors.shiftDate ??
      validation.fieldErrors.shiftCode ??
      validation.fieldErrors.sectorCode ??
      validation.fieldErrors.samplingHouseCode ??
      FALLBACK_INVALID_REGISTRATION_CODE
    return err<DomainError>({ code, message: `Shift registration field invalid: ${code}` })
  }

  return ok(
    createShift({
      id: idResult.value,
      date: validation.fields.shiftDate,
      shiftCode: validation.fields.shiftCode,
      sectorCode: validation.fields.sectorCode,
      samplingHouseCode: validation.fields.samplingHouseCode,
      status: 'NEW',
    }),
  )
}
