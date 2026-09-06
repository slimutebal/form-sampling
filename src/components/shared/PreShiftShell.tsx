import type { ReactNode } from 'react'
import { SafeAreaTopCap } from '@/components/shared/SafeAreaTopCap'

interface PreShiftShellProps {
  children: ReactNode
}

/**
 * The shared shell for every pre-shift Start Shift step (`/start`:
 * Registration, Handover, Manpower, Fleet Setup, and their loading/error
 * phases) — the counterpart to `AppLayout` for active-shift routes.
 *
 * `safe-top` reserves the top-inset flow space *before* `PageHeader`
 * renders. Without it, `PageHeader` (the first element on these routes)
 * has a natural in-flow position of `y=0`, so its `sticky
 * top-[env(safe-area-inset-top)]` offset shifts it down visually without
 * pushing the page content that follows it — content ends up starting
 * where the header *would* have been un-shifted, rendering underneath
 * the header's actual painted position. Reserving the inset here first
 * (mirroring what `GlobalStatusBar`'s own `safe-top` padding already
 * does on AppLayout routes) means `PageHeader`'s natural position is
 * already past the inset, so its sticky offset never has to move it.
 *
 * `SafeAreaTopCap` covers the same inset independently (see its own
 * doc) for when the page scrolls far enough that this padding scrolls
 * out of view too.
 */
export function PreShiftShell({ children }: PreShiftShellProps) {
  return (
    <div className="safe-top">
      <SafeAreaTopCap />
      {children}
    </div>
  )
}
