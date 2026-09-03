/**
 * Stable, language-neutral shift lifecycle codes (ARCHITECTURE.md §6).
 * Transition rules between these states are out of scope for Phase 2
 * and belong to a later phase.
 */
export const SHIFT_STATUSES = ['NEW', 'INITIALIZED', 'ACTIVE', 'READY_TO_CLOSE', 'FINALIZED', 'ARCHIVED'] as const

export type ShiftStatus = (typeof SHIFT_STATUSES)[number]
