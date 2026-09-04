/**
 * Produces a new internal SamplePositionId value (a plain string; domain
 * parsing still validates it via `parseSamplePositionId`). Identity
 * generation belongs outside `src/domain/**` (mirrors Phase 10
 * `HaulageTransactionIdGenerator`). Kept as an injectable function so
 * tests can substitute a fixed id instead of a random UUID.
 */
export type SamplePositionIdGenerator = () => string

export function generateSamplePositionId(): string {
  return crypto.randomUUID()
}
