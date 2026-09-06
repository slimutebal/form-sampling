import { useEffect, useState } from 'react'
import { deriveSyncPresentation, type ShiftSummarySyncStatusReader, type SyncPresentation } from '@/application/pwa/sync-presentation'

const ALL_SYNCED: SyncPresentation = { status: 'ALL_SYNCED', pendingCount: 0, failedCount: 0, syncingCount: 0 }

/**
 * Live sync-state presentation for the global status UI (ROADMAP Phase 18
 * §10/§11), derived from the Phase 16 `shiftSummarySync` outbox table.
 * Refreshes on mount and whenever the tab regains focus or the browser
 * comes back online — deliberately no polling timer, since nothing in
 * this phase writes to the outbox on any faster cadence.
 *
 * On a read failure (Phase 18 §17), falls back to ALL_SYNCED rather than
 * crashing the shell or surfacing a raw infrastructure error — a
 * conservative, calm default rather than an alarming one, since a stuck
 * FAILED/PENDING row will keep re-surfacing on the next successful read.
 */
export function useShiftSummarySyncPresentation(reader: ShiftSummarySyncStatusReader): SyncPresentation {
  const [presentation, setPresentation] = useState<SyncPresentation>(ALL_SYNCED)

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const result = await reader.listShiftSummarySyncRecords()
        if (cancelled) return
        if (result.ok) {
          setPresentation(deriveSyncPresentation(result.value))
        }
      } catch {
        // Conservative fallback — see doc comment above.
      }
    }

    void refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [reader])

  return presentation
}
