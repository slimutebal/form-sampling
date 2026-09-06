import { useEffect, useState } from 'react'
import type { ShiftWorkspaceReader } from '@/application/ports/shift-workspace-reader'

/**
 * Whether a current local shift workspace exists (ROADMAP Phase 18 §8),
 * read from the same local operational store boundary the Start/Resume
 * screen uses — never inferred from React-only state.
 *
 * Defaults to `true` (the cautious assumption) until the read resolves,
 * and stays `true` if the read fails (Phase 18 §17 storage-failure
 * boundary) — an active shift is never reported as absent on uncertain
 * information, since that would wrongly relax the update-safety UI.
 */
export function useActiveShiftPresence(reader: ShiftWorkspaceReader): boolean {
  const [hasActiveShift, setHasActiveShift] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const result = await reader.loadCurrentShiftWorkspace()
        if (cancelled) return
        if (result.ok) {
          setHasActiveShift(result.value !== undefined)
        }
      } catch {
        // Conservative: keep the cautious default on an unexpected failure.
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [reader])

  return hasActiveShift
}
