/**
 * Injectable time source so callers that need a deterministic timestamp
 * (e.g. Phase 13 export's `ExportTimestamp`) never call `Date.now()`/
 * `new Date()` directly and can supply a fixed value in tests.
 */
export interface Clock {
  readonly now: () => Date
}

export const systemClock: Clock = { now: () => new Date() }
