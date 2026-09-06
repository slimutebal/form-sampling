/**
 * Opaque strip pinned to the physical top of the viewport, exactly
 * `env(safe-area-inset-top)` tall — independent of scroll position and
 * of `PageHeader`'s own sticky offset (which only starts covering the
 * screen *below* that inset, not the inset itself). Without this, once
 * whatever reserves the top inset in document flow (`GlobalStatusBar`'s
 * `safe-top` padding on AppLayout routes, `PreShiftShell`'s on `/start`)
 * scrolls out of view, page content scrolls up into the iPhone status
 * bar/Dynamic Island (or an Android status-bar cutout) with nothing
 * opaque behind it. `fixed` (not `sticky`/flow), so it adds no extra
 * top inset of its own — mount once per shell, never per page.
 */
export function SafeAreaTopCap() {
  return (
    <div
      aria-hidden="true"
      data-testid="safe-area-top-cap"
      className="fixed inset-x-0 top-0 z-20 h-[env(safe-area-inset-top)] bg-background"
    />
  )
}
