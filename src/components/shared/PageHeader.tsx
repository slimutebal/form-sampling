interface PageHeaderProps {
  title: string
}

/**
 * Sticks at `env(safe-area-inset-top)` rather than `top-0` (and carries no
 * padding of its own) so it never overlaps the iPhone status bar/Dynamic
 * Island — whether it's the true top of the screen (pre-shift routes) or
 * it only reaches the top after `GlobalStatusBar` scrolls away (AppLayout
 * routes) — without adding a second top inset on top of the one
 * `GlobalStatusBar` already reserves.
 */
export function PageHeader({ title }: PageHeaderProps) {
  return (
    <header className="sticky top-[env(safe-area-inset-top)] z-10 border-b border-border bg-background px-4 py-2.5 safe-x">
      <h1 className="text-[22px] font-semibold leading-tight">{title}</h1>
    </header>
  )
}
