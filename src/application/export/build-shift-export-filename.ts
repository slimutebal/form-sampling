/**
 * Deterministic, filesystem-safe archive filename (rule 12) — the same
 * ShiftId and timestamp always produce the same filename, so export
 * behavior stays testable without touching the real clock.
 */
export function buildShiftExportFilename(shiftId: string, timestamp: Date): string {
  const safeShiftId = shiftId.replace(/[^A-Za-z0-9_-]/g, '_')
  const stamp = timestamp.toISOString().replace(/[:.]/g, '-')
  return `FormSampling_Shift_${safeShiftId}_${stamp}.xlsx`
}
