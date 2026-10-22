import type { MasterData } from '@/domain/master/master-data'

/**
 * The Employees master has no role enum.  These are the explicit Level
 * values already recognised by the personnel ordering rules as operational
 * supervisory roles.  An absent or unknown Level is ordinary Staff and must
 * not satisfy the mandatory Pengawas requirement.
 */
const PENGAWAS_LEVELS = new Set(['supervisor', 'foreman', 'pengawas'])

export function isPengawasEmployee(personId: string, masterData: MasterData): boolean {
  const employee = masterData.employees.find((candidate) => candidate.id === personId)
  return employee !== undefined && PENGAWAS_LEVELS.has(employee.level?.trim().toLocaleLowerCase() ?? '')
}
