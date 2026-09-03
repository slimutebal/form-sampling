/**
 * Produces a new internal ShiftId value (a plain string; domain parsing
 * still validates it via `parseShiftId`). Identity generation belongs
 * outside `src/domain/**` (ARCHITECTURE.md — the domain never invents
 * its own IDs) and outside `src/i18n`/UI concerns. Kept as an injectable
 * function so tests can substitute a fixed id instead of a random UUID.
 */
export type ShiftIdGenerator = () => string

export function generateShiftId(): string {
  return crypto.randomUUID()
}
