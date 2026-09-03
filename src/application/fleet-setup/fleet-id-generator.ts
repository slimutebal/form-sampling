export type FleetIdGenerator = () => string

export function generateFleetId(): string {
  return crypto.randomUUID()
}
