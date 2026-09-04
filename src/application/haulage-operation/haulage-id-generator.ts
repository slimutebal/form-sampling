/**
 * Produces a new internal HaulageTransactionId value (a plain string;
 * domain parsing still validates it via `parseHaulageTransactionId`).
 * Identity generation belongs outside `src/domain/**` and outside
 * `src/i18n`/UI concerns (mirrors Phase 8 `ShiftIdGenerator` / Phase 9
 * `FleetIdGenerator`). Kept as an injectable function so tests can
 * substitute a fixed id instead of a random UUID.
 */
export type HaulageTransactionIdGenerator = () => string

export function generateHaulageTransactionId(): string {
  return crypto.randomUUID()
}
