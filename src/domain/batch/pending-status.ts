/**
 * Stable, language-neutral pending status codes (BR-PEND-001).
 * COMPLETE is deliberately absent: its exact operational definition is
 * NEEDS_CONFIRMATION per BUSINESS_RULES.md §26 and must not be inferred.
 */
export const PENDING_STATUSES = ['CONTINUE', 'HOLD'] as const

export type PendingStatus = (typeof PENDING_STATUSES)[number]
