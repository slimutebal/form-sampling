interface PageHeaderProps {
  title: string
}

export function PageHeader({ title }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3">
      <h1 className="text-xl font-semibold">{title}</h1>
    </header>
  )
}
