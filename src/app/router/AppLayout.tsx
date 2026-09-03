import { Outlet } from 'react-router'
import { BottomNav } from '@/components/shared/BottomNav'

export function AppLayout() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
