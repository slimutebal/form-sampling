/**
 * Produces a new internal ProductionCorrectionId value (a plain string;
 * domain parsing still validates it via `parseProductionCorrectionId`).
 * Identity generation belongs outside `src/domain/**` and outside
 * `src/i18n`/UI concerns (mirrors `generateHaulageTransactionId`). Kept
 * as an injectable function so tests can substitute a fixed id instead
 * of a random UUID.
 */
export type ProductionCorrectionIdGenerator = () => string

export function generateProductionCorrectionId(): string {
  return crypto.randomUUID()
}
