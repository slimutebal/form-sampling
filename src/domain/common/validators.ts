import type { Brand } from './brand'
import type { DomainError, Result } from './result'
import { err, ok } from './result'

/**
 * Shared parser for branded string values: rejects blank and
 * whitespace-only input, otherwise returns the trimmed value.
 */
export function createNonBlankStringParser<B extends string>(label: B, errorCode: string) {
  return (value: string): Result<Brand<string, B>> => {
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      return err<DomainError>({
        code: errorCode,
        message: `${label} must not be blank or whitespace-only`,
      })
    }
    return ok(trimmed as Brand<string, B>)
  }
}

/**
 * Shared validation for domain numeric values that must be strictly
 * positive integers (used by BatchNumber and RitNumber).
 */
export function parsePositiveInteger(label: string, errorCode: string, value: number): Result<number> {
  if (!Number.isFinite(value)) {
    return err<DomainError>({
      code: errorCode,
      message: `${label} must be a finite number`,
    })
  }
  if (!Number.isInteger(value)) {
    return err<DomainError>({
      code: errorCode,
      message: `${label} must be an integer`,
    })
  }
  if (value <= 0) {
    return err<DomainError>({
      code: errorCode,
      message: `${label} must be a positive integer greater than zero`,
    })
  }
  return ok(value)
}
