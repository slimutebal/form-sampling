interface PageHeaderProps {
  title: string
}

/**
 * Sticks at `env(safe-area-inset-top)` rather than `top-0` (and reserves
 * no padding of its own at that layer) so it never overlaps the iPhone
 * status bar/Dynamic Island — whether it's the true top of the screen
 * (pre-shift routes, inside `PreShiftShell`) or it only reaches the top
 * after `GlobalStatusBar` scrolls away (AppLayout routes) — without
 * adding a second top inset on top of the one `GlobalStatusBar`/
 * `PreShiftShell` already reserves.
 *
 * `safe-x` lives on this outer `<header>` alone; the horizontal content
 * padding lives on the inner div. Putting both on the same element (as
 * before) let `safe-x`'s `env(safe-area-inset-left/right)` — which is
 * `0` on most portrait phones, no side notch — win the cascade over
 * `px-5` and collapse the title flush against the screen edge. Keeping
 * them on separate elements composes the way `GlobalStatusBar`/
 * `AppLayout` already do: safe-area clearance outside, visual padding
 * inside. `px-5` matches the `px-5` page-content wrapper below it so the
 * title lines up with cards/forms rather than the tighter `px-4` used
 * pre-hardening.
 */
export function PageHeader({ title }: PageHeaderProps) {
  return (
    <header className="sticky top-[env(safe-area-inset-top)] z-10 safe-x border-b border-border bg-background">
      <div className="flex items-center px-5 py-3">
        <h1 className="text-[19px] font-semibold leading-tight">{title}</h1>
      </div>
    </header>
  )
}
