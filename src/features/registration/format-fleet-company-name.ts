/** Fleet-list presentation only; the master-data name remains unchanged. */
export function formatFleetCompanyName(company: string): string {
  return company.replace(/^\s*pt\s+/i, '')
}
