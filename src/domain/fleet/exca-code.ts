import type { Brand } from '@/domain/common/brand'
import type { DomainError, Result } from '@/domain/common/result'
import { err, ok } from '@/domain/common/result'

export type ExcaCode = Brand<string, 'ExcaCode'>

export function normalizeExcaNumber(value: string): Result<string, DomainError> {
  const trimmed = value.trim()
  if (!/^\d{1,4}$/.test(trimmed)) {
    return err({
      code: 'INVALID_EXCA_NUMBER',
      message: 'Exca number must contain one to four digits',
    })
  }
  return ok(trimmed.padStart(4, '0'))
}

export function buildExcaCode(companyCode: string, hullNumber: string): Result<ExcaCode, DomainError> {
  const company = companyCode.trim()
  if (!company) {
    return err({ code: 'EXCA_COMPANY_REQUIRED', message: 'Company is required before Exca can be set' })
  }
  const normalized = normalizeExcaNumber(hullNumber)
  if (!normalized.ok) return normalized
  return ok(`${company}-Exc_${normalized.value}` as ExcaCode)
}

export function parseExcaCode(value: string): Result<ExcaCode, DomainError> {
  if (!/^[^-]+-Exc_\d{4}$/.test(value)) {
    return err({ code: 'INVALID_EXCA_CODE', message: 'Exca code is not canonical' })
  }
  return ok(value as ExcaCode)
}

export function displayExcaCode(excaCode: ExcaCode | string | undefined): string {
  if (!excaCode) return '—'
  const match = /^[^-]+-(Exc_\d{4})$/.exec(excaCode)
  return match?.[1] ?? '—'
}

export function excaNumberFromCode(excaCode: ExcaCode | string | undefined): string {
  const match = excaCode ? /^[^-]+-Exc_(\d{4})$/.exec(excaCode) : undefined
  return match?.[1] ? String(Number(match[1])) : ''
}
