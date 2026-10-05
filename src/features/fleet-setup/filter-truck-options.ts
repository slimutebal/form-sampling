/**
 * UI-only filtering over candidates supplied by the fleet application layer.
 * It deliberately does not decide which trucks are eligible.
 */
export function filterTruckOptions(truckIds: readonly string[], query: string): readonly string[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return truckIds
  return truckIds.filter((truckId) => truckId.toLowerCase().includes(normalized))
}
